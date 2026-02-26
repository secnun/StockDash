"""Switching dashboard API — SOXL indicator data + switching backtest + trigger optimizer."""

from __future__ import annotations

import asyncio
import glob
import itertools
import logging
import random
import time
import uuid
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import AsyncGenerator

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from app.api.backtest import find_data_file
from app.core.config import get_settings
from app.models.backtest import (
    GridSearchDone,
    GridSearchProgress,
    OptimizerCancelled,
    OptimizerStartResponse,
)
from app.models.switching import (
    SlotParameterRange,
    SwitchingBacktestRequest,
    SwitchingBacktestResponse,
    SwitchingConfig,
    SwitchingOptimizerRequest,
    SwitchingOptimizerResultItem,
)
from app.optimizers.utils import generate_range_values
from app.services.data_loader import filter_by_date_range, load_csv_pandas
from app.services.indicators import AVAILABLE_INDICATORS
from app.services.switching_engine import SwitchingEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/switching", tags=["switching"])

# 스위칭 옵티마이저 취소 플래그
switching_optimizer_jobs: dict[str, bool] = {}


def _find_latest_csv(ticker_dir: Path) -> Path | None:
    """Find the most recent CSV file in a ticker directory."""
    pattern = str(ticker_dir / "1d_*.csv")
    files = sorted(glob.glob(pattern))
    return Path(files[-1]) if files else None


def _load_soxl_full(file_path: Path) -> pd.DataFrame:
    """Load SOXL CSV with all indicator columns."""
    df = pd.read_csv(file_path)
    df.columns = [c.strip() for c in df.columns]
    # Deduplicate column names (CSV has two 'Plot' columns)
    cols: list[str] = []
    seen: dict[str, int] = {}
    for c in df.columns:
        if c in seen:
            seen[c] += 1
            cols.append(f"{c}_{seen[c]}")
        else:
            seen[c] = 0
            cols.append(c)
    df.columns = pd.Index(cols)

    df["time"] = df["time"].astype(np.int64)
    return df


@router.get("/soxl")
async def get_soxl_data(days: int = Query(default=365, ge=1, le=5000)) -> dict:
    """Return SOXL candle + indicator data for the switching dashboard."""
    settings = get_settings()
    ticker_dir = settings.data_dir / "us" / "SOXL"

    csv_path = _find_latest_csv(ticker_dir)
    if csv_path is None:
        raise HTTPException(status_code=404, detail="SOXL 데이터를 찾을 수 없습니다")

    df = _load_soxl_full(csv_path)

    # Tail to requested days
    df = df.tail(days).reset_index(drop=True)

    # Build candle array
    candles = [
        {
            "time": int(row["time"]),
            "open": round(float(row["open"]), 2),
            "high": round(float(row["high"]), 2),
            "low": round(float(row["low"]), 2),
            "close": round(float(row["close"]), 2),
            "volume": int(row["Volume"]) if pd.notna(row.get("Volume")) else 0,
        }
        for _, row in df.iterrows()
    ]

    # Build MA line arrays (skip NaN)
    ma20 = [
        {"time": int(row["time"]), "value": round(float(row["MA_20"]), 2)}
        for _, row in df.iterrows()
        if pd.notna(row.get("MA_20"))
    ]
    ma60 = [
        {"time": int(row["time"]), "value": round(float(row["MA_60"]), 2)}
        for _, row in df.iterrows()
        if pd.notna(row.get("MA_60"))
    ]

    # Latest indicators from last row
    last = df.iloc[-1]
    close = float(last["close"])
    ma20_val = float(last["MA_20"]) if pd.notna(last.get("MA_20")) else None
    ma60_val = float(last["MA_60"]) if pd.notna(last.get("MA_60")) else None

    # Alignment
    if ma20_val is not None and ma60_val is not None:
        if close > ma20_val > ma60_val:
            alignment = "정배열"
        elif close < ma20_val < ma60_val:
            alignment = "역배열"
        else:
            alignment = "혼조"
    else:
        alignment = "-"

    # Deviation (20MA 이격도)
    deviation = ((close - ma20_val) / ma20_val * 100) if ma20_val else None

    # Date from timestamp
    date_str = pd.Timestamp(int(last["time"]), unit="s").strftime("%Y-%m-%d")

    latest_indicators = {
        "ma20": round(ma20_val, 2) if ma20_val is not None else None,
        "ma60": round(ma60_val, 2) if ma60_val is not None else None,
        "alignment": alignment,
        "deviation": round(deviation, 2) if deviation is not None else None,
        "slope": round(float(last["Slope"]), 2) if pd.notna(last.get("Slope")) else None,
        "roc": round(float(last["ROC"]), 2) if pd.notna(last.get("ROC")) else None,
        "rsi": round(float(last["RSI"]), 2) if pd.notna(last.get("RSI")) else None,
        "atr": round(float(last["ATR"]), 2) if pd.notna(last.get("ATR")) else None,
        "close": round(close, 2),
        "date": date_str,
    }

    return {
        "candles": candles,
        "ma20": ma20,
        "ma60": ma60,
        "latestIndicators": latest_indicators,
    }


@router.post("/backtest/run")
async def run_switching_backtest(request: SwitchingBacktestRequest) -> dict:
    """스위칭 백테스트 실행."""
    # 데이터 로드
    data_path = find_data_file(request.ticker_id, request.market)
    if data_path is None or not data_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"'{request.ticker_id}' 데이터를 찾을 수 없습니다",
        )

    try:
        df = load_csv_pandas(data_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"데이터 로드 실패: {e}")

    df = filter_by_date_range(df, request.start_date, request.end_date)
    if len(df) == 0:
        raise HTTPException(status_code=400, detail="지정한 기간에 데이터가 없습니다")

    # 스위칭 엔진 실행
    try:
        engine = SwitchingEngine()
        result = engine.run(
            data=df,
            config=request.switching_config,
            initial_capital=request.initial_capital,
            apply_fee=request.apply_fee,
            market=request.market,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"백테스트 실행 실패: {e}")

    return result.model_dump(by_alias=True)


@router.get("/indicators")
async def get_available_indicators() -> list[dict]:
    """사용 가능한 지표 목록 반환."""
    return AVAILABLE_INDICATORS


# ===== 스위칭 트리거 옵티마이저 =====


def _build_condition_values_lists(
    request: SwitchingOptimizerRequest,
) -> tuple[list[list[list]], list[int]]:
    """조건 값 리스트 + 쿨다운 값 리스트 생성."""
    per_condition_values: list[list[list]] = []
    for cr in request.condition_ranges:
        ri = cr.rule_index
        ci = cr.condition_index
        if cr.string_values is not None and len(cr.string_values) > 0:
            per_condition_values.append([[ri, ci, v] for v in cr.string_values])
        elif cr.min_value is not None and cr.max_value is not None and cr.step is not None:
            per_condition_values.append(
                [[ri, ci, v] for v in generate_range_values(cr.min_value, cr.max_value, cr.step)]
            )
        else:
            rules = request.switching_config.rules
            if ri < len(rules) and ci < len(rules[ri].conditions):
                val = rules[ri].conditions[ci].value
            else:
                val = 0
            per_condition_values.append([[ri, ci, val]])

    if request.cooldown_range is not None:
        cooldown_values = list(
            range(
                request.cooldown_range.min_value,
                request.cooldown_range.max_value + 1,
                request.cooldown_range.step,
            )
        )
    else:
        cooldown_values = [request.switching_config.cooldown_days]

    return per_condition_values, cooldown_values


def _build_slot_param_values(
    slot_ranges: list[SlotParameterRange] | None,
) -> list[dict] | None:
    """슬롯별 파라미터 값 조합 생성."""
    if not slot_ranges:
        return None
    param_lists: list[list[dict]] = []
    for sr in slot_ranges:
        slot_combos: list[dict] = []
        dp_vals = (
            list(generate_range_values(sr.drop_percent.min, sr.drop_percent.max, sr.drop_percent.step))
            if sr.drop_percent
            else [None]
        )
        tp_vals = (
            list(generate_range_values(sr.target_profit.min, sr.target_profit.max, sr.target_profit.step))
            if sr.target_profit
            else [None]
        )
        sd_vals = (
            list(generate_range_values(sr.stop_loss_days.min, sr.stop_loss_days.max, sr.stop_loss_days.step))
            if sr.stop_loss_days
            else [None]
        )
        for dp in dp_vals:
            for tp in tp_vals:
                for sd in sd_vals:
                    combo: dict = {"slotId": sr.slot_id}
                    if dp is not None:
                        combo["dropPercent"] = dp
                    if tp is not None:
                        combo["targetProfit"] = tp
                    if sd is not None:
                        combo["stopLossDays"] = int(sd)
                    slot_combos.append(combo)
        param_lists.append(slot_combos)

    # 슬롯 간 카르테시안 곱
    full_combos: list[dict] = []
    for slot_combo in itertools.product(*param_lists):
        merged: dict = {}
        for sc in slot_combo:
            merged[sc["slotId"]] = {k: v for k, v in sc.items() if k != "slotId"}
        full_combos.append(merged)
    return full_combos


def _generate_switching_combinations(
    request: SwitchingOptimizerRequest,
) -> list[tuple[list[list], int, dict | None]]:
    """Tier 1 (조건+쿨다운) + Tier 2 (전략 파라미터) 조합 생성.

    Returns:
        list of (condition_mappings, cooldown_days, slot_params_or_none) tuples.
    """
    per_condition_values, cooldown_values = _build_condition_values_lists(request)
    slot_param_combos = _build_slot_param_values(request.slot_parameter_ranges)

    combinations: list[tuple[list[list], int, dict | None]] = []
    for cond_combo in itertools.product(*per_condition_values):
        for cd in cooldown_values:
            if slot_param_combos:
                for sp in slot_param_combos:
                    combinations.append((list(cond_combo), cd, sp))
            else:
                combinations.append((list(cond_combo), cd, None))

    return combinations


def _generate_monte_carlo_combinations(
    request: SwitchingOptimizerRequest,
    max_samples: int = 10000,
) -> list[tuple[list[list], int, dict | None]]:
    """Monte Carlo 무작위 샘플링."""
    per_condition_values, cooldown_values = _build_condition_values_lists(request)
    slot_param_combos = _build_slot_param_values(request.slot_parameter_ranges)

    combinations: list[tuple[list[list], int, dict | None]] = []
    for _ in range(max_samples):
        cond_combo = [random.choice(vals) for vals in per_condition_values]
        cd = random.choice(cooldown_values)
        sp = random.choice(slot_param_combos) if slot_param_combos else None
        combinations.append((cond_combo, cd, sp))

    return combinations


def _compute_composite_score(
    metrics: dict,
    switch_count: int,
    candle_count: int,
) -> float:
    """가중 복합 점수 계산.

    score = (sharpe * 1.0 + return_factor * 1.0) / (mdd_penalty * switch_penalty)
    """
    total_return = metrics.get("totalReturn", 0.0)
    mdd = metrics.get("mdd", 0.0)
    sharpe = metrics.get("sharpeRatio", 0.0)

    return_factor = total_return / 100.0
    mdd_penalty = max(1.0, abs(mdd) / 10.0)
    annual_switch_freq = (switch_count / max(1, candle_count)) * 252
    switch_penalty_val = 1.0 + 0.1 * annual_switch_freq

    numerator = sharpe + return_factor
    denominator = mdd_penalty * switch_penalty_val

    return numerator / max(0.001, denominator)


def _run_switching_single(
    data_path: str,
    start_date: str | None,
    end_date: str | None,
    initial_capital: float,
    apply_fee: bool,
    market: str,
    config_dict: dict,
    condition_mappings: list[list],
    cooldown_days: int,
    slot_params: dict | None = None,
) -> dict | None:
    """단일 스위칭 백테스트 실행 (ProcessPoolExecutor 워커)."""
    try:
        from app.models.switching import SwitchingConfig
        from app.services.data_loader import filter_by_date_range, load_csv_pandas
        from app.services.switching_engine import SwitchingEngine

        config = SwitchingConfig(**config_dict)
        for mapping in condition_mappings:
            ri, ci, val = mapping[0], mapping[1], mapping[2]
            if ri < len(config.rules) and ci < len(config.rules[ri].conditions):
                config.rules[ri].conditions[ci].value = val
        config.cooldown_days = cooldown_days

        # 전략 파라미터 주입
        if slot_params:
            for slot in config.strategy_slots:
                sp = slot_params.get(slot.slot_id)
                if sp:
                    for k, v in sp.items():
                        slot.parameters[k] = v

        df = load_csv_pandas(Path(data_path))
        df = filter_by_date_range(df, start_date, end_date)
        if len(df) == 0:
            return None

        engine = SwitchingEngine()
        result = engine.run(
            data=df,
            config=config,
            initial_capital=initial_capital,
            apply_fee=apply_fee,
            market=market,
        )

        metrics = result.metrics
        composite_score = _compute_composite_score(
            metrics, len(result.switching_events), len(df),
        )

        condition_values = [
            {"ruleIndex": m[0], "conditionIndex": m[1], "value": m[2]}
            for m in condition_mappings
        ]

        return {
            "condition_values": condition_values,
            "cooldown_days": cooldown_days,
            "slot_params": slot_params,
            "total_return": round(metrics.get("totalReturn", 0.0), 2),
            "cagr": round(metrics.get("cagr", 0.0), 2),
            "mdd": round(metrics.get("mdd", 0.0), 2),
            "sharpe_ratio": round(metrics.get("sharpeRatio", 0.0), 4),
            "win_rate": round(metrics.get("winRate", 0.0), 2),
            "total_trades": metrics.get("totalTrades", 0),
            "switch_count": len(result.switching_events),
            "composite_score": round(composite_score, 4),
        }
    except Exception:
        logger.error(
            "Switching single backtest failed: mappings=%s, cooldown=%s",
            condition_mappings,
            cooldown_days,
            exc_info=True,
        )
        return None


async def _run_batch_combinations(
    combinations: list[tuple[list[list], int, dict | None]],
    data_path: str,
    request: SwitchingOptimizerRequest,
    config_dict: dict,
    settings: object,
    job_id: str,
    stage_label: str | None = None,
) -> AsyncGenerator[dict, None]:
    """조합 목록을 배치 실행하고 SSE 이벤트를 yield."""
    total = len(combinations)
    results: list[dict] = []
    completed = 0
    is_cancelled = False
    max_workers = min(settings.max_workers, total)
    batch_size = max(1, min(10, total // 100))
    loop = asyncio.get_event_loop()

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        for i in range(0, total, batch_size):
            if switching_optimizer_jobs.get(job_id, False):
                is_cancelled = True
                break

            batch = combinations[i : i + batch_size]
            futures = [
                loop.run_in_executor(
                    executor,
                    _run_switching_single,
                    data_path,
                    request.start_date,
                    request.end_date,
                    request.initial_capital,
                    request.apply_fee,
                    request.market,
                    config_dict,
                    cond_mappings,
                    cd,
                    sp,
                )
                for cond_mappings, cd, sp in batch
            ]

            for coro in asyncio.as_completed(futures):
                result = await coro
                if result is not None:
                    results.append(result)
                completed += 1

                if switching_optimizer_jobs.get(job_id, False):
                    is_cancelled = True
                    break

                yield {
                    "event": "progress",
                    "data": GridSearchProgress(
                        completed=completed,
                        total=total,
                        percent=round(completed / total * 100, 1),
                    ).model_dump_json(),
                }

            if is_cancelled:
                break

    # _batch_result를 통해 결과 전달 (제너레이터가 아닌 속성으로)
    yield {"_batch_results": results, "_is_cancelled": is_cancelled}


@router.post("/optimizer/run")
async def run_switching_optimizer(
    request: SwitchingOptimizerRequest,
) -> EventSourceResponse:
    """스위칭 트리거 옵티마이저 실행 (SSE 스트리밍)."""
    settings = get_settings()
    job_id = str(uuid.uuid4())

    data_path = find_data_file(request.ticker_id, request.market)
    if data_path is None or not data_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"'{request.ticker_id}' 데이터를 찾을 수 없습니다",
        )

    config_dict = request.switching_config.model_dump(by_alias=True)

    # 알고리즘별 조합 생성
    if request.algorithm == "monte_carlo":
        combinations = _generate_monte_carlo_combinations(request, max_samples=10000)
    elif request.algorithm == "two_stage":
        # 2단계: Stage 1은 조건+쿨다운만 (전략 파라미터 고정)
        stage1_request = request.model_copy()
        stage1_request.slot_parameter_ranges = None
        combinations = _generate_switching_combinations(stage1_request)
    else:
        combinations = _generate_switching_combinations(request)

    total = len(combinations)
    if total == 0:
        raise HTTPException(status_code=400, detail="조합이 생성되지 않았습니다")

    async def event_generator() -> AsyncGenerator[dict, None]:
        switching_optimizer_jobs[job_id] = False

        start_response = OptimizerStartResponse(job_id=job_id)
        yield {
            "event": "start",
            "data": start_response.model_dump_json(by_alias=True),
        }

        start_time_ms = time.perf_counter()
        all_results: list[dict] = []
        is_cancelled = False

        if request.algorithm == "two_stage":
            # ===== Stage 1: 조건 임계값만 Grid Search =====
            stage1_combos = combinations
            batch_results: list[dict] = []

            async for event in _run_batch_combinations(
                stage1_combos, str(data_path), request, config_dict,
                settings, job_id, "Stage 1",
            ):
                if "_batch_results" in event:
                    batch_results = event["_batch_results"]
                    is_cancelled = event["_is_cancelled"]
                else:
                    yield event

            if is_cancelled:
                cancelled_event = OptimizerCancelled(
                    job_id=job_id,
                    completed=len(batch_results),
                    total=len(stage1_combos),
                )
                yield {
                    "event": "cancelled",
                    "data": cancelled_event.model_dump_json(by_alias=True),
                }
                if job_id in switching_optimizer_jobs:
                    del switching_optimizer_jobs[job_id]
                return

            # Stage 1 Top-20 선택
            batch_results.sort(key=lambda r: r["composite_score"], reverse=True)
            top_stage1 = batch_results[:20]
            all_results.extend(batch_results)

            # ===== Stage 2: Top-20의 전략 파라미터 Monte Carlo =====
            if request.slot_parameter_ranges and len(top_stage1) > 0:
                stage2_combos: list[tuple[list[list], int, dict | None]] = []
                slot_param_combos = _build_slot_param_values(request.slot_parameter_ranges) or []
                samples_per_top = min(500, max(100, 10000 // len(top_stage1)))

                for top_result in top_stage1:
                    cond_mappings = [
                        [cv["ruleIndex"], cv["conditionIndex"], cv["value"]]
                        for cv in top_result["condition_values"]
                    ]
                    cd = top_result["cooldown_days"]
                    for _ in range(samples_per_top):
                        sp = random.choice(slot_param_combos) if slot_param_combos else None
                        stage2_combos.append((cond_mappings, cd, sp))

                stage2_results: list[dict] = []
                async for event in _run_batch_combinations(
                    stage2_combos, str(data_path), request, config_dict,
                    settings, job_id, "Stage 2",
                ):
                    if "_batch_results" in event:
                        stage2_results = event["_batch_results"]
                        is_cancelled = event["_is_cancelled"]
                    else:
                        yield event

                all_results.extend(stage2_results)

                if is_cancelled:
                    cancelled_event = OptimizerCancelled(
                        job_id=job_id,
                        completed=len(all_results),
                        total=len(stage1_combos) + len(stage2_combos),
                    )
                    yield {
                        "event": "cancelled",
                        "data": cancelled_event.model_dump_json(by_alias=True),
                    }
                    if job_id in switching_optimizer_jobs:
                        del switching_optimizer_jobs[job_id]
                    return

        else:
            # ===== Grid Search / Monte Carlo: 단일 단계 =====
            max_workers = min(settings.max_workers, total)
            batch_size = max(1, min(10, total // 100))
            completed = 0
            loop = asyncio.get_event_loop()

            with ProcessPoolExecutor(max_workers=max_workers) as executor:
                for i in range(0, total, batch_size):
                    if switching_optimizer_jobs.get(job_id, False):
                        is_cancelled = True
                        cancelled_event = OptimizerCancelled(
                            job_id=job_id, completed=completed, total=total,
                        )
                        yield {
                            "event": "cancelled",
                            "data": cancelled_event.model_dump_json(by_alias=True),
                        }
                        break

                    batch = combinations[i : i + batch_size]
                    futures = [
                        loop.run_in_executor(
                            executor,
                            _run_switching_single,
                            str(data_path),
                            request.start_date,
                            request.end_date,
                            request.initial_capital,
                            request.apply_fee,
                            request.market,
                            config_dict,
                            cond_mappings,
                            cd,
                            sp,
                        )
                        for cond_mappings, cd, sp in batch
                    ]

                    for coro in asyncio.as_completed(futures):
                        result = await coro
                        if result is not None:
                            all_results.append(result)
                        completed += 1

                        if switching_optimizer_jobs.get(job_id, False):
                            is_cancelled = True
                            cancelled_event = OptimizerCancelled(
                                job_id=job_id, completed=completed, total=total,
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
                            "data": progress.model_dump_json(),
                        }

                    if is_cancelled:
                        break

        # 정리
        if job_id in switching_optimizer_jobs:
            del switching_optimizer_jobs[job_id]

        if is_cancelled:
            return

        # composite_score DESC 정렬 + top_n 추출
        all_results.sort(key=lambda r: r["composite_score"], reverse=True)
        top_results = all_results[: request.top_n]

        ranked_items = [
            SwitchingOptimizerResultItem(
                rank=rank,
                condition_values=r["condition_values"],
                cooldown_days=r["cooldown_days"],
                total_return=r["total_return"],
                cagr=r["cagr"],
                mdd=r["mdd"],
                sharpe_ratio=r["sharpe_ratio"],
                win_rate=r["win_rate"],
                total_trades=r["total_trades"],
                switch_count=r["switch_count"],
                composite_score=r["composite_score"],
            )
            for rank, r in enumerate(top_results, 1)
        ]

        yield {
            "event": "results",
            "data": "[" + ",".join(
                item.model_dump_json(by_alias=True) for item in ranked_items
            ) + "]",
        }

        total_time = (time.perf_counter() - start_time_ms) * 1000
        done = GridSearchDone(
            total_time=round(total_time, 2),
            results_count=len(ranked_items),
        )
        yield {
            "event": "done",
            "data": done.model_dump_json(by_alias=True),
        }

    return EventSourceResponse(event_generator())


@router.post("/optimizer/cancel/{job_id}")
async def cancel_switching_optimizer(job_id: str) -> dict:
    """스위칭 옵티마이저 실행 취소."""
    if job_id in switching_optimizer_jobs:
        switching_optimizer_jobs[job_id] = True
        return {"status": "cancelling", "jobId": job_id}
    return {"status": "not_found", "jobId": job_id}
