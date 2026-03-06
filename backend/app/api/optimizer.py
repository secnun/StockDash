"""Optimizer API with SSE streaming."""

import asyncio
import logging
import time
import uuid
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
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
    YearlyRankedResultItem,
    YearlyRankings,
    YearlyResult,
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
from app.api.backtest import find_data_file
from app.strategies.utils import get_fee_rate_for_market
from app.services.clustering import cluster_and_select_representatives
from app.strategies import StrategyRegistry

router = APIRouter(prefix="/api/optimizer", tags=["optimizer"])


def _recalc_scores(r: dict) -> None:
    """Recalculate avg_return, std_return, composite_score from yearly_results in-place."""
    import operator
    from functools import reduce
    from statistics import mean, stdev

    yearly = r.get("yearly_results", [])
    if not yearly:
        r["avg_return"] = 0.0
        r["std_return"] = 0.0
        r["max_mdd"] = 0.0
        r["composite_score"] = 0.0
        return

    returns = [yr["total_return"] for yr in yearly]
    mdds = [yr["mdd"] for yr in yearly]
    n = len(returns)

    avg_ret = mean(returns)
    std_ret = stdev(returns) if len(returns) > 1 else 0.0
    max_mdd = max(mdds)

    # Composite score: (geo_mean / (max_mdd × (1+CV))) × positive_ratio^α
    factors = [1 + ret / 100 for ret in returns]
    product = reduce(operator.mul, factors, 1.0)

    if product <= 0:
        score = -abs(sum(returns)) / n
    else:
        geo_mean = (product ** (1 / n) - 1) * 100
        max_mdd_val = max(mdds) if mdds else 0
        max_mdd_val = max(max_mdd_val, 1.0)

        cv = std_ret / abs(avg_ret) if abs(avg_ret) > 0.01 else std_ret
        cv_penalty = 1 + cv

        positive_count = sum(1 for r in returns if r > 0)
        positive_ratio = positive_count / n
        consistency = positive_ratio ** 2

        score = (geo_mean / (max_mdd_val * cv_penalty)) * consistency

    r["avg_return"] = round(avg_ret, 2)
    r["std_return"] = round(std_ret, 2)
    r["max_mdd"] = round(max_mdd, 2)
    r["composite_score"] = round(score, 4)


def _build_yearly_rankings(
    results: list[dict],
    top_n: int,
) -> tuple[list[YearlyRankedResultItem], list[dict]]:
    """
    Process results into ranked items and snapshot dicts.

    Recalculates scores from yearly_results for cache compatibility,
    applies all_positive flag, sorts, clusters, and builds both
    YearlyRankedResultItem list and camelCase snapshot list.

    Returns:
        (yearly_ranked_items, snapshot_items)
    """
    # Recalculate scores from yearly_results (ensures old cache compatibility)
    for r in results:
        _recalc_scores(r)

    # all_positive flag (informational only, no longer affects sorting)
    for r in results:
        yearly = r.get("yearly_results", [])
        r["all_positive"] = bool(yearly) and all(yr.get("total_return", 0) > 0 for yr in yearly)

    results_sorted = sorted(results, key=lambda x: x.get("composite_score", 0), reverse=True)
    results_clustered = cluster_and_select_representatives(
        results_sorted,
        target_total=top_n,
        min_results_for_clustering=20,
        guaranteed_top_n=30,
        pool_multiplier=5,
    )

    yearly_ranked_items: list[YearlyRankedResultItem] = []
    snapshot_items: list[dict] = []
    for rank, r in enumerate(results_clustered[:top_n], 1):
        yearly_results = [
            YearlyResult(
                year=yr["year"],
                total_return=yr["total_return"],
                mdd=yr["mdd"],
            )
            for yr in r.get("yearly_results", [])
        ]
        yearly_ranked_items.append(
            YearlyRankedResultItem(
                rank=rank,
                params=r["params"],
                yearly_results=yearly_results,
                avg_return=r.get("avg_return", 0),
                std_return=r.get("std_return", 0),
                max_mdd=r.get("max_mdd", 0),
                composite_score=r.get("composite_score", 0),
                total_trades=r.get("total_trades", 0),
                all_positive=r.get("all_positive", False),
            )
        )
        yr_list = [
            {"year": yr["year"], "totalReturn": yr["total_return"], "mdd": yr["mdd"]}
            for yr in r.get("yearly_results", [])
        ]
        snapshot_items.append({
            "rank": rank,
            "params": r["params"],
            "yearlyResults": yr_list,
            "avgReturn": r.get("avg_return", 0),
            "stdReturn": r.get("std_return", 0),
            "maxMdd": r.get("max_mdd", 0),
            "compositeScore": r.get("composite_score", 0),
            "totalTrades": r.get("total_trades", 0),
            "allPositive": r.get("all_positive", False),
        })

    return yearly_ranked_items, snapshot_items

# Global dict to track running optimization jobs
# Key: job_id, Value: bool (True = cancelled)
# NOTE: 단일 Uvicorn 워커 전제. 다중 워커(Gunicorn) 환경에서는 Redis 등 외부 상태 저장소 필요
running_jobs: dict[str, bool] = {}


def _run_single_backtest(
    strategy_id: str,
    data_path: str,
    start_date: str | None,
    end_date: str | None,
    initial_capital: float,
    params: dict[str, float | int | str | bool],
    apply_fee: bool = True,
    fee_rate: float | None = None,
) -> dict | None:
    """Run a single backtest (for multiprocessing)."""
    try:
        from app.services.data_loader import filter_by_date_range, load_csv_pandas
        from app.strategies import StrategyRegistry  # noqa: F401

        strategy = StrategyRegistry.get(strategy_id)
        if strategy is None:
            return None

        df = load_csv_pandas(Path(data_path))
        df = filter_by_date_range(df, start_date, end_date)

        if len(df) == 0:
            return None

        full_params = {**params, "applyFee": apply_fee}
        if fee_rate is not None:
            full_params["feeRate"] = fee_rate
        result = strategy.execute(df, full_params, initial_capital)

        return {
            "params": params,
            "metrics": result.metrics.model_dump(by_alias=True),
        }
    except Exception:
        logger.error("Single backtest failed for strategy=%s, params=%s", strategy_id, params, exc_info=True)
        return None


def _run_yearly_backtest(
    strategy_id: str,
    data_path: str,
    start_date: str | None,
    end_date: str | None,
    initial_capital: float,
    params: dict[str, float | int | str | bool],
    apply_fee: bool = True,
    fee_rate: float | None = None,
) -> dict | None:
    """Run yearly backtest with capital reset (for multiprocessing)."""
    try:
        from app.services.yearly_backtest import run_yearly_backtest_for_optimizer

        return run_yearly_backtest_for_optimizer(
            strategy_id=strategy_id,
            data_path=data_path,
            start_date=start_date,
            end_date=end_date,
            initial_capital=initial_capital,
            params=params,
            apply_fee=apply_fee,
            fee_rate=fee_rate,
        )
    except Exception:
        logger.error("Yearly backtest failed for strategy=%s, params=%s", strategy_id, params, exc_info=True)
        return None


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
                # 구 형식(weightedReturn) 스냅샷은 스킵 → CSV 풀스캔으로 재계산
                first = snapshot["results"][0]
                if "avgReturn" in first:
                    return {
                        "exists": True,
                        "results": snapshot["results"][:top_n],
                        "totalCount": snapshot["totalCount"],
                        "lastUpdated": snapshot["lastUpdated"],
                    }

    # 2) 폴백: CSV 풀스캔 + 클러스터링
    # Get param keys from CSV header
    param_keys = get_param_keys_from_cache(cache_path)
    if not param_keys:
        return CachedResultsResponse(
            exists=False,
            results=[],
            total_count=0,
            last_updated=None,
        ).model_dump(by_alias=True)

    # Load all cached results
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

    # Build ranked items and snapshot
    yearly_ranked_items, snapshot_items = _build_yearly_rankings(all_results, top_n)

    # Get last modified time of cache file
    last_updated = int(cache_path.stat().st_mtime)

    # 3) 폴백 실행 후 JSON 스냅샷 저장 (다음 조회를 위해)
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
        running_jobs[job_id] = True  # Set cancel flag
        return {"status": "cancelling", "jobId": job_id}
    return {"status": "not_found", "jobId": job_id}


@router.post("/run")
async def run_optimization(request: OptimizerRequest) -> EventSourceResponse:
    """옵티마이저 실행 (SSE 스트리밍)."""
    settings = get_settings()

    # Generate unique job ID
    job_id = str(uuid.uuid4())

    # Validate optimizer
    optimizer = OptimizerRegistry.get(request.optimizer_id)
    if optimizer is None:
        raise HTTPException(
            status_code=404,
            detail=f"Optimizer '{request.optimizer_id}' not found",
        )

    # Validate strategy
    strategy = StrategyRegistry.get(request.strategy_id)
    if strategy is None:
        raise HTTPException(
            status_code=404,
            detail=f"Strategy '{request.strategy_id}' not found",
        )

    # Validate data file
    data_path = find_data_file(request.ticker_id, request.market)
    if data_path is None or not data_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Data file for ticker '{request.ticker_id}' not found",
        )

    # Generate parameter combinations using optimizer
    param_ranges_dict = {k: v.model_dump() for k, v in request.param_ranges.items()}

    # Apply max_combinations limit during generation (not after!)
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
            detail="No parameter combinations generated",
        )

    # Prepare date filters
    start_date = request.start_date
    end_date = request.end_date

    fee_rate = get_fee_rate_for_market(request.market)

    async def event_generator() -> AsyncGenerator[dict, None]:
        # Register job as running
        running_jobs[job_id] = False

        # Send start event with job ID
        start_response = OptimizerStartResponse(job_id=job_id)
        yield {
            "event": "start",
            "data": start_response.model_dump_json(by_alias=True),
        }
        # Generate SSE events
        start_time_ms = time.perf_counter()

        # Get param keys for cache
        param_keys = list(request.param_ranges.keys()) + list(request.select_params.keys())

        # Load cached results
        cache_path = get_cache_path(request.strategy_id, request.ticker_id)
        cached_results = load_cached_results(cache_path, param_keys)

        # Filter out already cached combinations
        new_combinations = []
        cached_list = []
        for params in param_combinations:
            param_tuple = params_to_tuple(params)
            if param_tuple in cached_results:
                cached_list.append(cached_results[param_tuple])
            else:
                new_combinations.append(params)

        # Send cache info
        cache_info = GridSearchCacheInfo(
            cached_count=len(cached_list),
            new_count=len(new_combinations),
            total_count=total,
        )
        yield {
            "event": "cache_info",
            "data": cache_info.model_dump_json(by_alias=True),
        }

        # Initialize results with cached data
        results: list[dict] = list(cached_list)
        new_results: list[dict] = []
        completed = len(cached_list)

        # Send initial progress if there are cached results
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

        # Run new combinations only
        is_cancelled = False
        if new_combinations:
            max_workers = min(settings.max_workers, len(new_combinations))
            # 배치 크기: 1% 단위, 최대 10개 (취소 반응성 개선)
            batch_size = max(1, min(10, len(new_combinations) // 100))
            loop = asyncio.get_event_loop()

            with ProcessPoolExecutor(max_workers=max_workers) as executor:
                for i in range(0, len(new_combinations), batch_size):
                    # Check for cancellation before starting batch
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
                            _run_yearly_backtest,
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

                    # asyncio.as_completed로 개별 작업 완료 시마다 처리
                    for coro in asyncio.as_completed(futures):
                        result = await coro

                        if result is not None:
                            results.append(result)
                            new_results.append(result)

                        completed += 1

                        # 매 작업마다 취소 체크 (반응성 개선)
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

                        # 즉시 진행률 업데이트 (1개 단위)
                        progress = GridSearchProgress(
                            completed=completed,
                            total=total,
                            percent=round(completed / total * 100, 1),
                        )
                        yield {
                            "event": "progress",
                            "data": progress.model_dump_json(by_alias=True),
                        }

                    # 내부 루프에서 취소된 경우 외부 루프도 종료
                    if is_cancelled:
                        break

            # Save new results to cache (save partial results even if cancelled)
            if new_results:
                save_results_to_cache(
                    cache_path, new_results, param_keys, append=cache_path.exists()
                )

        # Clean up job from running_jobs
        if job_id in running_jobs:
            del running_jobs[job_id]

        # If cancelled, don't send rankings/done
        if is_cancelled:
            return

        top_n = request.top_n

        # Build ranked items for SSE response
        yearly_ranked_items, _ = _build_yearly_rankings(results, top_n)

        # Send yearly rankings (new format)
        yearly_rankings = YearlyRankings(results=yearly_ranked_items)
        yield {
            "event": "yearly_rankings",
            "data": yearly_rankings.model_dump_json(by_alias=True),
        }

        # 전체 데이터 기반 랭킹 스냅샷 저장 (누적 순위용)
        all_data = list(cached_results.values()) + new_results
        _, snapshot_items = _build_yearly_rankings(all_data, top_n)

        save_rankings_snapshot(
            get_rankings_path(request.strategy_id, request.ticker_id),
            snapshot_items,
            total_count=len(all_data),
        )

        # Send completion event
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
