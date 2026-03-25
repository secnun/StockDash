"""Optimizer API with SSE streaming."""

import asyncio
import logging
import time
import uuid
from concurrent.futures import ProcessPoolExecutor
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)

from app.core.config import get_settings
from app.models.backtest import (
    CachedResultsResponse,
    GridSearchCacheInfo,
    GridSearchDone,
    GridSearchProgress,
    OptimizerCancelled,
    OptimizerRequest,
    OptimizerStartResponse,
    YearlyRankings,
)
from app.optimizers import OptimizerRegistry
from app.optimizers.cache import (
    get_cache_path,
    get_param_keys_from_cache,
    get_rankings_path,
    load_cached_results,
    load_rankings_snapshot,
    params_to_tuple,
    save_rankings_snapshot,
    save_results_to_cache,
)
from app.services.data_loader import find_data_file
from app.services.optimizer_service import (
    build_yearly_rankings,
    run_yearly_backtest_worker,
)
from app.strategies.utils import get_fee_rate_for_market
from app.strategies import StrategyRegistry

router = APIRouter(prefix="/api/optimizer", tags=["optimizer"])

# Global dict to track running optimization jobs
# NOTE: 단일 Uvicorn 워커 전제. 다중 워커(Gunicorn) 환경에서는 Redis 등 외부 상태 저장소 필요
running_jobs: dict[str, bool] = {}


@router.get("/list")
async def list_optimizers():
    """사용 가능한 옵티마이저 목록."""
    return [
        {
            "id": o.id,
            "name": o.name,
            "description": o.description,
            "configSchema": o.get_config_schema(),
        }
        for o in OptimizerRegistry.list_all()
    ]


@router.get("/cached/{strategy_id}/{ticker_id}")
async def get_cached_results(
    strategy_id: str,
    ticker_id: str,
    top_n: int = 70,
):
    """캐시된 옵티마이저 결과 조회."""
    cache_path = get_cache_path(strategy_id, ticker_id)

    if not cache_path.exists():
        return CachedResultsResponse(
            exists=False,
            results=[],
            total_count=0,
            last_updated=None,
        ).model_dump(by_alias=True)

    # 1) JSON 스냅샷이 존재하고, CSV보다 최신이며 새 필드 형식이면 즉시 반환
    rankings_path = get_rankings_path(strategy_id, ticker_id)
    if rankings_path.exists():
        if rankings_path.stat().st_mtime >= cache_path.stat().st_mtime:
            snapshot = load_rankings_snapshot(rankings_path)
            if snapshot and len(snapshot.get("results", [])) >= top_n:
                first = snapshot["results"][0]
                if "avgReturn" in first:
                    return {
                        "exists": True,
                        "results": snapshot["results"][:top_n],
                        "totalCount": snapshot["totalCount"],
                        "lastUpdated": snapshot["lastUpdated"],
                    }

    # 2) 폴백: CSV 풀스캔 + 클러스터링
    param_keys = get_param_keys_from_cache(cache_path)
    if not param_keys:
        return CachedResultsResponse(
            exists=False,
            results=[],
            total_count=0,
            last_updated=None,
        ).model_dump(by_alias=True)

    cached_dict = load_cached_results(cache_path, param_keys)
    all_results = list(cached_dict.values())
    total_count = len(all_results)

    if total_count == 0:
        return CachedResultsResponse(
            exists=True,
            results=[],
            total_count=0,
            last_updated=None,
        ).model_dump(by_alias=True)

    yearly_ranked_items, snapshot_items = build_yearly_rankings(all_results, top_n)

    last_updated = int(cache_path.stat().st_mtime)

    # 3) 폴백 실행 후 JSON 스냅샷 저장
    save_rankings_snapshot(rankings_path, snapshot_items, total_count)

    return CachedResultsResponse(
        exists=True,
        results=yearly_ranked_items,
        total_count=total_count,
        last_updated=last_updated,
    ).model_dump(by_alias=True)


@router.post("/cancel/{job_id}")
async def cancel_optimization(job_id: str):
    """옵티마이저 실행 취소."""
    if job_id in running_jobs:
        running_jobs[job_id] = True
        return {"status": "cancelling", "jobId": job_id}
    return {"status": "not_found", "jobId": job_id}


@router.post("/run")
async def run_optimization(request: OptimizerRequest) -> EventSourceResponse:
    """옵티마이저 실행 (SSE 스트리밍)."""
    settings = get_settings()

    job_id = str(uuid.uuid4())

    # Validate optimizer
    optimizer = OptimizerRegistry.get(request.optimizer_id)
    if optimizer is None:
        raise HTTPException(
            status_code=404,
            detail=f"'{request.optimizer_id}' 옵티마이저를 찾을 수 없습니다",
        )

    # Validate strategy
    strategy = StrategyRegistry.get(request.strategy_id)
    if strategy is None:
        raise HTTPException(
            status_code=404,
            detail=f"'{request.strategy_id}' 전략을 찾을 수 없습니다",
        )

    # Validate data file
    data_path = find_data_file(request.ticker_id, request.market)
    if data_path is None or not data_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"'{request.ticker_id}' 티커의 데이터 파일을 찾을 수 없습니다",
        )

    # Generate parameter combinations
    param_ranges_dict = {k: v.model_dump() for k, v in request.param_ranges.items()}
    max_combinations = request.optimizer_config.get("max_combinations", -1)

    candidates = optimizer.generate_candidates(param_ranges_dict, request.optimizer_config)

    # ddeolsapro_custom: splitPct 합계 100% 초과 조합 필터링
    split_keys = [k for k in param_ranges_dict if k.startswith("splitPct")]
    if split_keys:
        candidates = (p for p in candidates if sum(p.get(k, 0) for k in split_keys) <= 100)

    if max_combinations > 0:
        from itertools import islice
        param_combinations = list(islice(candidates, max_combinations))
    else:
        param_combinations = list(candidates)

    # Expand with select params (cartesian product)
    if request.select_params:
        import itertools
        select_keys = list(request.select_params.keys())
        select_values = [request.select_params[k] for k in select_keys]
        expanded = []
        for combo in param_combinations:
            for select_combo in itertools.product(*select_values):
                expanded.append({**combo, **dict(zip(select_keys, select_combo))})
        param_combinations = expanded

    total = len(param_combinations)
    if total == 0:
        raise HTTPException(
            status_code=400,
            detail="생성된 파라미터 조합이 없습니다",
        )

    start_date = request.start_date
    end_date = request.end_date
    fee_rate = get_fee_rate_for_market(request.market)

    async def event_generator() -> AsyncGenerator[dict, None]:
        running_jobs[job_id] = False

        start_response = OptimizerStartResponse(job_id=job_id)
        yield {
            "event": "start",
            "data": start_response.model_dump_json(by_alias=True),
        }

        start_time_ms = time.perf_counter()

        param_keys = list(request.param_ranges.keys()) + list(request.select_params.keys())

        cache_path = get_cache_path(request.strategy_id, request.ticker_id)
        cached_results = load_cached_results(cache_path, param_keys)

        new_combinations = []
        cached_list = []
        for params in param_combinations:
            param_tuple = params_to_tuple(params)
            if param_tuple in cached_results:
                cached_list.append(cached_results[param_tuple])
            else:
                new_combinations.append(params)

        cache_info = GridSearchCacheInfo(
            cached_count=len(cached_list),
            new_count=len(new_combinations),
            total_count=total,
        )
        yield {
            "event": "cache_info",
            "data": cache_info.model_dump_json(by_alias=True),
        }

        results: list[dict] = list(cached_list)
        new_results: list[dict] = []
        completed = len(cached_list)

        if cached_list:
            progress = GridSearchProgress(
                completed=completed,
                total=total,
                percent=round(completed / total * 100, 1),
            )
            yield {
                "event": "progress",
                "data": progress.model_dump_json(by_alias=True),
            }

        is_cancelled = False
        if new_combinations:
            max_workers = min(settings.max_workers, len(new_combinations))
            batch_size = max(1, min(10, len(new_combinations) // 100))
            loop = asyncio.get_event_loop()

            with ProcessPoolExecutor(max_workers=max_workers) as executor:
                for i in range(0, len(new_combinations), batch_size):
                    if running_jobs.get(job_id, False):
                        is_cancelled = True
                        cancelled_event = OptimizerCancelled(
                            job_id=job_id,
                            completed=completed,
                            total=total,
                        )
                        yield {
                            "event": "cancelled",
                            "data": cancelled_event.model_dump_json(by_alias=True),
                        }
                        break

                    batch = new_combinations[i : i + batch_size]

                    futures = [
                        loop.run_in_executor(
                            executor,
                            run_yearly_backtest_worker,
                            request.strategy_id,
                            str(data_path),
                            start_date,
                            end_date,
                            request.initial_capital,
                            params,
                            request.apply_fee,
                            fee_rate,
                        )
                        for params in batch
                    ]

                    for coro in asyncio.as_completed(futures):
                        result = await coro

                        if result is not None:
                            results.append(result)
                            new_results.append(result)

                        completed += 1

                        if running_jobs.get(job_id, False):
                            is_cancelled = True
                            cancelled_event = OptimizerCancelled(
                                job_id=job_id,
                                completed=completed,
                                total=total,
                            )
                            yield {
                                "event": "cancelled",
                                "data": cancelled_event.model_dump_json(by_alias=True),
                            }
                            break

                        progress = GridSearchProgress(
                            completed=completed,
                            total=total,
                            percent=round(completed / total * 100, 1),
                        )
                        yield {
                            "event": "progress",
                            "data": progress.model_dump_json(by_alias=True),
                        }

                    if is_cancelled:
                        break

            if new_results:
                save_results_to_cache(
                    cache_path, new_results, param_keys, append=cache_path.exists()
                )

        if job_id in running_jobs:
            del running_jobs[job_id]

        if is_cancelled:
            return

        top_n = request.top_n

        yearly_ranked_items, _ = build_yearly_rankings(results, top_n)

        yearly_rankings = YearlyRankings(results=yearly_ranked_items)
        yield {
            "event": "yearly_rankings",
            "data": yearly_rankings.model_dump_json(by_alias=True),
        }

        all_data = list(cached_results.values()) + new_results
        _, snapshot_items = build_yearly_rankings(all_data, top_n)

        save_rankings_snapshot(
            get_rankings_path(request.strategy_id, request.ticker_id),
            snapshot_items,
            total_count=len(all_data),
        )

        total_time = (time.perf_counter() - start_time_ms) * 1000
        done = GridSearchDone(
            total_time=round(total_time, 2),
            results_count=len(yearly_ranked_items),
        )
        yield {
            "event": "done",
            "data": done.model_dump_json(by_alias=True),
        }

    return EventSourceResponse(event_generator())
