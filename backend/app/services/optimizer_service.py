"""옵티마이저 서비스 — 스코어 계산, 랭킹, 단일 백테스트 워커."""

from __future__ import annotations

import logging
from pathlib import Path

from app.models.backtest import YearlyRankedResultItem, YearlyResult
from app.services.clustering import cluster_and_select_representatives

logger = logging.getLogger(__name__)


def recalc_scores(r: dict) -> None:
    """yearly_results에서 avg_return, std_return, composite_score를 재계산 (in-place)."""
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

        positive_count = sum(1 for ret in returns if ret > 0)
        positive_ratio = positive_count / n
        consistency = positive_ratio ** 2

        score = (geo_mean / (max_mdd_val * cv_penalty)) * consistency

    r["avg_return"] = round(avg_ret, 2)
    r["std_return"] = round(std_ret, 2)
    r["max_mdd"] = round(max_mdd, 2)
    r["composite_score"] = round(score, 4)


def build_yearly_rankings(
    results: list[dict],
    top_n: int,
) -> tuple[list[YearlyRankedResultItem], list[dict]]:
    """결과를 스코어링, 정렬, 클러스터링하여 랭킹 생성.

    Returns:
        (yearly_ranked_items, snapshot_items)
    """
    for r in results:
        recalc_scores(r)

    # all_positive flag
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


def run_single_backtest_worker(
    strategy_id: str,
    data_path: str,
    start_date: str | None,
    end_date: str | None,
    initial_capital: float,
    params: dict[str, float | int | str | bool],
    apply_fee: bool = True,
    fee_rate: float | None = None,
) -> dict | None:
    """단일 백테스트 실행 (ProcessPoolExecutor 워커용)."""
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


def run_yearly_backtest_worker(
    strategy_id: str,
    data_path: str,
    start_date: str | None,
    end_date: str | None,
    initial_capital: float,
    params: dict[str, float | int | str | bool],
    apply_fee: bool = True,
    fee_rate: float | None = None,
) -> dict | None:
    """연간 백테스트 실행 (ProcessPoolExecutor 워커용)."""
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
