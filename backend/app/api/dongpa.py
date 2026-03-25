"""동파법 API — QQQ 주봉 기반 안전/공세 모드 전환 SOXL 매매."""

from __future__ import annotations

import asyncio
import logging
import random
import time
import uuid
from concurrent.futures import ProcessPoolExecutor
from typing import AsyncGenerator

import pandas as pd
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.core.config import get_settings
from app.models.backtest import (
    GridSearchDone,
    GridSearchProgress,
    OptimizerCancelled,
    OptimizerStartResponse,
)
from app.models.dongpa import (
    DongpaBacktestRequest,
    DongpaOptimizerRequest,
    DongpaOptimizerResultItem,
)
from app.services.data_loader import filter_by_date_range, find_data_file, load_csv_pandas
from app.services.dongpa_engine import (
    DongpaEngine,
    build_dongpa_combinations,
    run_dongpa_single_worker,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dongpa", tags=["dongpa"])

# 옵티마이저 취소 플래그
dongpa_optimizer_jobs: dict[str, bool] = {}


@router.get("/indicators")
async def get_dongpa_indicators() -> list[dict]:
    """동파법 사용 가능 지표 목록."""
    from app.services.dongpa_indicators import DONGPA_AVAILABLE_INDICATORS

    return DONGPA_AVAILABLE_INDICATORS


@router.get("/qqq-weekly")
async def get_qqq_weekly_data() -> dict:
    """QQQ 주봉 데이터 + 지표."""
    from app.services.dongpa_indicators import compute_qqq_indicators
    from app.services.qqq_data import load_qqq_weekly

    try:
        qqq_raw = load_qqq_weekly()
        qqq_df = compute_qqq_indicators(qqq_raw, ma_period=10)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"QQQ 데이터 로드 실패: {e}")

    qqq_df = qqq_df.tail(200).reset_index(drop=True)

    weekly_data = [
        {
            "date": row["date"],
            "close": round(float(row["close"]), 2),
            "ma": round(float(row["qqq_ma"]), 2),
            "maCross": row["qqq_ma_cross"],
            "trendDeviation": round(float(row["qqq_trend_deviation"]), 2),
            "weeklyRoc": round(float(row["qqq_weekly_roc"]), 2),
            "maSlope": round(float(row["qqq_ma_slope"]), 2),
        }
        for _, row in qqq_df.iterrows()
    ]

    last = qqq_df.iloc[-1]
    latest = {
        "date": last["date"],
        "close": round(float(last["close"]), 2),
        "ma": round(float(last["qqq_ma"]), 2),
        "maCross": last["qqq_ma_cross"],
        "trendDeviation": round(float(last["qqq_trend_deviation"]), 2),
        "weeklyRoc": round(float(last["qqq_weekly_roc"]), 2),
        "maSlope": round(float(last["qqq_ma_slope"]), 2),
    }

    return {"weeklyData": weekly_data, "latest": latest}


# ===== 짭파법 v1 =====


@router.get("/jjappa/chart-data")
async def get_jjappa_chart_data() -> dict:
    """짭파법용 QQQ 주봉 + SOXL 일봉 차트 데이터."""
    settings = get_settings()

    qqq_path = settings.data_dir / "us" / "qqq" / "qqq_1w.csv"
    if not qqq_path.exists():
        raise HTTPException(status_code=404, detail="QQQ 주봉 데이터 없음")
    qqq_df = load_csv_pandas(qqq_path)

    soxl_path = settings.data_dir / "us" / "soxl" / "soxl_1d.csv"
    if not soxl_path.exists():
        raise HTTPException(status_code=404, detail="SOXL 일봉 데이터 없음")
    soxl_df = load_csv_pandas(soxl_path)

    qqq_tail = qqq_df.tail(300).reset_index(drop=True)
    qqq_candles = []
    for _, row in qqq_tail.iterrows():
        rsi_val = None if pd.isna(row.get("rsi")) else round(float(row["rsi"]), 2)
        qqq_candles.append({
            "time": int(row["time"]),
            "open": round(float(row["open"]), 2),
            "high": round(float(row["high"]), 2),
            "low": round(float(row["low"]), 2),
            "close": round(float(row["close"]), 2),
            "rsi": rsi_val,
        })

    last_qqq = qqq_tail.iloc[-1]
    prev_qqq = qqq_tail.iloc[-2] if len(qqq_tail) >= 2 else last_qqq
    rsi_curr = None if pd.isna(last_qqq.get("rsi")) else round(float(last_qqq["rsi"]), 2)
    rsi_prev = None if pd.isna(prev_qqq.get("rsi")) else round(float(prev_qqq["rsi"]), 2)
    rsi_change = round(rsi_curr - rsi_prev, 2) if rsi_curr is not None and rsi_prev is not None else None

    current_mode = "안전"
    if rsi_curr is not None and rsi_prev is not None:
        if rsi_curr < 63 and rsi_curr > rsi_prev:
            current_mode = "공세"

    qqq_latest = {
        "date": pd.Timestamp(int(last_qqq["time"]), unit="s").strftime("%Y-%m-%d"),
        "close": round(float(last_qqq["close"]), 2),
        "closePrev": round(float(prev_qqq["close"]), 2),
        "rsi": rsi_curr,
        "rsiPrev": rsi_prev,
        "rsiChange": rsi_change,
        "currentMode": current_mode,
    }

    soxl_tail = soxl_df.tail(1500).reset_index(drop=True)
    soxl_candles = [
        {
            "time": int(row["time"]),
            "open": round(float(row["open"]), 2),
            "high": round(float(row["high"]), 2),
            "low": round(float(row["low"]), 2),
            "close": round(float(row["close"]), 2),
        }
        for _, row in soxl_tail.iterrows()
    ]

    return {
        "qqq": {"candles": qqq_candles, "latest": qqq_latest},
        "soxl": {"candles": soxl_candles},
    }


@router.post("/jjappa/run")
async def run_jjappa_backtest(request: dict) -> dict:
    """짭파법 v1 백테스트 실행."""
    from app.services.jjappa_engine import JjappaConfig, JjappaEngine

    settings = get_settings()

    soxl_path = settings.data_dir / "us" / "soxl" / "soxl_1d.csv"
    if not soxl_path.exists():
        raise HTTPException(status_code=404, detail="SOXL 일봉 데이터를 찾을 수 없습니다")
    soxl_df = load_csv_pandas(soxl_path)

    qqq_path = settings.data_dir / "us" / "qqq" / "qqq_1w.csv"
    if not qqq_path.exists():
        raise HTTPException(status_code=404, detail="QQQ 주봉 데이터를 찾을 수 없습니다")
    qqq_df = load_csv_pandas(qqq_path)

    if "date" not in qqq_df.columns:
        qqq_df["date"] = qqq_df["time"].apply(
            lambda t: pd.Timestamp(int(t), unit="s").strftime("%Y-%m-%d")
        )

    start_date = request.get("startDate")
    end_date = request.get("endDate")
    soxl_df = filter_by_date_range(soxl_df, start_date, end_date)
    if len(soxl_df) == 0:
        raise HTTPException(status_code=400, detail="지정한 기간에 데이터가 없습니다")

    cfg = request.get("config", {})
    config = JjappaConfig(
        rsi_threshold=cfg.get("rsiThreshold", 63.0),
        safe_strategy=cfg.get("safeStrategy", "dongpa"),
        safe_buy_max_rise=cfg.get("safeBuyMaxRise", 3.0),
        safe_drop_percent=cfg.get("safeDropPercent", 0.10),
        safe_target_profit=cfg.get("safeTargetProfit", 0.2),
        safe_max_hold_days=cfg.get("safeMaxHoldDays", 30),
        safe_stop_loss_day_buy=cfg.get("safeStopLossDayBuy", "allow"),
        aggr_strategy=cfg.get("aggrStrategy", "dongpa"),
        aggr_buy_max_rise=cfg.get("aggrBuyMaxRise", 5.0),
        aggr_drop_percent=cfg.get("aggrDropPercent", 0.10),
        aggr_target_profit=cfg.get("aggrTargetProfit", 2.5),
        aggr_max_hold_days=cfg.get("aggrMaxHoldDays", 7),
        aggr_stop_loss_day_buy=cfg.get("aggrStopLossDayBuy", "allow"),
        renewal_mode=cfg.get("renewalMode", "fixed_period"),
        renewal_period=cfg.get("renewalPeriod", 10),
        profit_rate=cfg.get("profitRate", 0.80),
        loss_rate=cfg.get("lossRate", 0.30),
        fee_rate=cfg.get("feeRate", 0.0025),
        apply_fee=cfg.get("applyFee", True),
        initial_capital=request.get("initialCapital", 100000.0),
    )

    engine = JjappaEngine()
    try:
        result = engine.run(soxl_df, qqq_df, config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"짭파법 백테스트 실행 실패: {e}")

    return result


@router.post("/backtest/run")
async def run_dongpa_backtest(request: DongpaBacktestRequest) -> dict:
    """동파법 백테스트 실행."""
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

    try:
        engine = DongpaEngine()
        result = engine.run(
            soxl_data=df,
            config=request.dongpa_config,
            initial_capital=request.initial_capital,
            apply_fee=request.apply_fee,
            market=request.market,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"백테스트 실행 실패: {e}")

    return result.model_dump(by_alias=True)


# ===== 동파법 옵티마이저 =====


@router.post("/optimizer/run")
async def run_dongpa_optimizer(
    request: DongpaOptimizerRequest,
) -> EventSourceResponse:
    """동파법 옵티마이저 실행 (SSE 스트리밍)."""
    settings = get_settings()
    job_id = str(uuid.uuid4())

    data_path = find_data_file(request.ticker_id, request.market)
    if data_path is None or not data_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"'{request.ticker_id}' 데이터를 찾을 수 없습니다",
        )

    config_dict = request.dongpa_config.model_dump(by_alias=True)

    if request.algorithm == "monte_carlo":
        all_combos = build_dongpa_combinations(request.condition_ranges, request.dongpa_config)
        if len(all_combos) > 10000:
            combinations = random.sample(all_combos, 10000)
        else:
            combinations = all_combos
    else:
        combinations = build_dongpa_combinations(request.condition_ranges, request.dongpa_config)

    total = len(combinations)
    if total == 0:
        raise HTTPException(status_code=400, detail="조합이 생성되지 않았습니다")

    async def event_generator() -> AsyncGenerator[dict, None]:
        dongpa_optimizer_jobs[job_id] = False

        yield {
            "event": "start",
            "data": OptimizerStartResponse(job_id=job_id).model_dump_json(by_alias=True),
        }

        start_time_ms = time.perf_counter()
        all_results: list[dict] = []
        is_cancelled = False
        completed = 0
        max_workers = min(settings.max_workers, total)
        batch_size = max(1, min(10, total // 100))
        loop = asyncio.get_event_loop()

        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            for i in range(0, total, batch_size):
                if dongpa_optimizer_jobs.get(job_id, False):
                    is_cancelled = True
                    break

                batch = combinations[i : i + batch_size]
                futures = [
                    loop.run_in_executor(
                        executor,
                        run_dongpa_single_worker,
                        str(data_path),
                        request.start_date,
                        request.end_date,
                        request.initial_capital,
                        request.apply_fee,
                        request.market,
                        config_dict,
                        cond_mappings,
                    )
                    for cond_mappings in batch
                ]

                for coro in asyncio.as_completed(futures):
                    result = await coro
                    if result is not None:
                        all_results.append(result)
                    completed += 1

                    if dongpa_optimizer_jobs.get(job_id, False):
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

        if job_id in dongpa_optimizer_jobs:
            del dongpa_optimizer_jobs[job_id]

        if is_cancelled:
            yield {
                "event": "cancelled",
                "data": OptimizerCancelled(
                    job_id=job_id, completed=completed, total=total,
                ).model_dump_json(by_alias=True),
            }
            return

        all_results.sort(key=lambda r: r["composite_score"], reverse=True)
        top_results = all_results[: request.top_n]

        ranked_items = [
            DongpaOptimizerResultItem(
                rank=rank,
                condition_values=r["condition_values"],
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
        yield {
            "event": "done",
            "data": GridSearchDone(
                total_time=round(total_time, 2),
                results_count=len(ranked_items),
            ).model_dump_json(by_alias=True),
        }

    return EventSourceResponse(event_generator())


@router.post("/optimizer/cancel/{job_id}")
async def cancel_dongpa_optimizer(job_id: str) -> dict:
    """동파법 옵티마이저 취소."""
    if job_id in dongpa_optimizer_jobs:
        dongpa_optimizer_jobs[job_id] = True
        return {"status": "cancelling", "jobId": job_id}
    return {"status": "not_found", "jobId": job_id}
