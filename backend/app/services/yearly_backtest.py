"""Yearly backtest service for optimizer scoring.

Runs backtests with yearly capital resets to avoid compounding distortion.
"""

import logging
import operator
from functools import reduce
from pathlib import Path
from statistics import mean, stdev
from typing import TypedDict

import numpy as np
import pandas as pd

from app.models.backtest import PeriodIndependentResult, PeriodIndependentStats
from app.services.data_loader import filter_by_date_range, load_csv_pandas
from app.services.metrics import _calculate_mdd
from app.strategies import StrategyRegistry

logger = logging.getLogger(__name__)


class YearlyResultDict(TypedDict):
    """Yearly result dictionary type."""

    year: int
    total_return: float
    mdd: float


class YearlyBacktestResult(TypedDict):
    """Full yearly backtest result type."""

    yearly_results: list[YearlyResultDict]
    avg_return: float
    std_return: float
    max_mdd: float
    composite_score: float
    total_trades: int


def run_yearly_backtest(
    strategy_id: str,
    data_path: str,
    start_date: str | None,
    end_date: str | None,
    initial_capital: float,
    params: dict[str, float | int | str | bool],
    apply_fee: bool = True,
    fee_rate: float | None = None,
) -> YearlyBacktestResult | None:
    """
    Run backtest with yearly capital reset.

    Each year starts fresh with initial_capital to avoid compounding distortion.
    Incomplete years (start/end) are included as-is.

    Args:
        strategy_id: Strategy identifier
        data_path: Path to CSV data file
        start_date: Start date string YYYY-MM-DD (optional)
        end_date: End date string YYYY-MM-DD (optional)
        initial_capital: Initial capital for each year
        params: Strategy parameters
        apply_fee: Whether to apply trading fees

    Returns:
        YearlyBacktestResult with yearly metrics and composite score,
        or None if backtest fails
    """
    try:
        strategy = StrategyRegistry.get(strategy_id)
        if strategy is None:
            return None

        df = load_csv_pandas(Path(data_path))
        df = filter_by_date_range(df, start_date, end_date)

        if len(df) == 0:
            return None

        # Add year column from timestamp
        df["year"] = pd.to_datetime(df["time"], unit="s").dt.year

        # Get unique years
        years = sorted(df["year"].unique())

        yearly_results: list[YearlyResultDict] = []
        total_trades = 0

        for year in years:
            year_data = df[df["year"] == year].copy()
            if len(year_data) == 0:
                continue

            # Execute strategy for this year
            full_params = {**params, "applyFee": apply_fee}
            if fee_rate is not None:
                full_params["feeRate"] = fee_rate
            result = strategy.execute(year_data, full_params, initial_capital)

            # Calculate year return
            year_return = result.metrics.total_return
            year_mdd = abs(result.metrics.mdd)

            # Accumulate trades
            total_trades += result.metrics.total_trades

            yearly_results.append(
                YearlyResultDict(
                    year=int(year),
                    total_return=round(year_return, 2),
                    mdd=round(year_mdd, 2),
                )
            )

        if not yearly_results:
            return None

        # Calculate avg/std return
        returns = [r["total_return"] for r in yearly_results]
        avg_return = mean(returns)
        std_return = stdev(returns) if len(returns) > 1 else 0.0

        # Max MDD across all years
        max_mdd = max(r["mdd"] for r in yearly_results)

        # Composite score: geometric mean return / avg MDD
        # 기하평균은 복리 효과를 반영하여 손실 연도를 자연스럽게 감점
        n = len(returns)
        factors = [1 + r / 100 for r in returns]
        product = reduce(operator.mul, factors, 1.0)

        if product <= 0:
            composite_score = -abs(sum(returns)) / n
        else:
            geo_mean = (product ** (1 / n) - 1) * 100
            mdds = [r["mdd"] for r in yearly_results]
            avg_mdd = sum(mdds) / n if mdds else 0
            avg_mdd = max(avg_mdd, 1.0)  # 0 방지
            composite_score = geo_mean / avg_mdd

        return YearlyBacktestResult(
            yearly_results=yearly_results,
            avg_return=round(avg_return, 2),
            std_return=round(std_return, 2),
            max_mdd=round(max_mdd, 2),
            composite_score=round(composite_score, 4),
            total_trades=total_trades,
        )

    except Exception:
        logger.error("Yearly backtest failed for strategy=%s, params=%s", strategy_id, params, exc_info=True)
        return None


def run_yearly_backtest_for_optimizer(
    strategy_id: str,
    data_path: str,
    start_date: str | None,
    end_date: str | None,
    initial_capital: float,
    params: dict[str, float | int | str | bool],
    apply_fee: bool = True,
    fee_rate: float | None = None,
) -> dict | None:
    """
    Wrapper for optimizer that returns dict with params included.

    Args:
        strategy_id: Strategy identifier
        data_path: Path to CSV data file
        start_date: Start date string YYYY-MM-DD (optional)
        end_date: End date string YYYY-MM-DD (optional)
        initial_capital: Initial capital for each year
        params: Strategy parameters
        apply_fee: Whether to apply trading fees

    Returns:
        Dict with params and yearly backtest results, or None if fails
    """
    result = run_yearly_backtest(
        strategy_id=strategy_id,
        data_path=data_path,
        start_date=start_date,
        end_date=end_date,
        initial_capital=initial_capital,
        params=params,
        apply_fee=apply_fee,
        fee_rate=fee_rate,
    )

    if result is None:
        return None

    return {
        "params": params,
        "yearly_results": result["yearly_results"],
        "avg_return": result["avg_return"],
        "std_return": result["std_return"],
        "max_mdd": result["max_mdd"],
        "composite_score": result["composite_score"],
        "total_trades": result["total_trades"],
    }


def run_period_independent(
    strategy,
    df: pd.DataFrame,
    initial_capital: float,
    params: dict,
) -> PeriodIndependentResult:
    """
    Run independent backtests per period (yearly or monthly).

    Seed Reset: each period starts with initial_capital.
    Seed Carry: each period starts with the ending capital of the previous period.

    Args:
        strategy: Already resolved Strategy/TieredStrategy instance
        df: Already date-filtered DataFrame with time/open/high/low/close/volume
        initial_capital: Initial capital amount
        params: Strategy parameters (already includes applyFee/feeRate)

    Returns:
        PeriodIndependentResult with granularity, seedReset, seedCarry lists
    """
    dates = pd.to_datetime(df["time"], unit="s")
    total_days = (dates.max() - dates.min()).days

    # Determine granularity: yearly if >365 days, otherwise monthly
    if total_days > 365:
        granularity = "yearly"
        df = df.copy()
        df["_period"] = dates.dt.year
        label_fn = lambda period: str(int(period))
    else:
        granularity = "monthly"
        df = df.copy()
        df["_period"] = dates.dt.to_period("M")
        label_fn = lambda period: str(period)

    periods = sorted(df["_period"].unique())

    seed_reset_stats: list[PeriodIndependentStats] = []
    seed_carry_stats: list[PeriodIndependentStats] = []
    carry_capital = initial_capital

    for period in periods:
        period_data = df[df["_period"] == period].copy()
        period_data = period_data.drop(columns=["_period"])

        if len(period_data) < 2:
            # Not enough data for meaningful backtest
            label = label_fn(period)
            seed_reset_stats.append(
                PeriodIndependentStats(
                    label=label,
                    start_value=initial_capital,
                    end_value=initial_capital,
                    total_return=0.0,
                    mdd=0.0,
                    total_trades=0,
                )
            )
            seed_carry_stats.append(
                PeriodIndependentStats(
                    label=label,
                    start_value=carry_capital,
                    end_value=carry_capital,
                    total_return=0.0,
                    mdd=0.0,
                    total_trades=0,
                )
            )
            continue

        label = label_fn(period)

        # Seed Reset: always use initial_capital
        reset_result = strategy.execute(period_data, params, initial_capital)
        reset_equity = reset_result.equity
        reset_end = reset_equity[-1].value if reset_equity else initial_capital
        reset_return = ((reset_end - initial_capital) / initial_capital) * 100 if initial_capital > 0 else 0.0

        seed_reset_stats.append(
            PeriodIndependentStats(
                label=label,
                start_value=round(initial_capital, 2),
                end_value=round(reset_end, 2),
                total_return=round(reset_return, 2),
                mdd=round(abs(reset_result.metrics.mdd), 2),
                total_trades=reset_result.metrics.total_trades,
            )
        )

        # Seed Carry: use carry_capital from previous period
        carry_result = strategy.execute(period_data, params, carry_capital)
        carry_equity = carry_result.equity
        carry_end = carry_equity[-1].value if carry_equity else carry_capital
        carry_return = ((carry_end - carry_capital) / carry_capital) * 100 if carry_capital > 0 else 0.0

        seed_carry_stats.append(
            PeriodIndependentStats(
                label=label,
                start_value=round(carry_capital, 2),
                end_value=round(carry_end, 2),
                total_return=round(carry_return, 2),
                mdd=round(abs(carry_result.metrics.mdd), 2),
                total_trades=carry_result.metrics.total_trades,
            )
        )

        carry_capital = carry_end

    return PeriodIndependentResult(
        granularity=granularity,
        seed_reset=seed_reset_stats,
        seed_carry=seed_carry_stats,
    )
