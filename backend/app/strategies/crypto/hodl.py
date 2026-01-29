"""HODL (Buy and Hold) Strategy for crypto."""

import time as time_module

import numpy as np
import pandas as pd

from app.models.backtest import BacktestResponse, EquityPoint, PerformanceMetrics, Trade
from app.models.strategy import ParameterDefinition
from app.strategies.base import Strategy
from app.strategies.crypto.registry import CryptoStrategyRegistry


class HODLStrategy(Strategy):
    """
    HODL (Buy and Hold) Strategy.

    Buy at the start and hold until the end.
    """

    id = "hodl"
    name = "HODL"
    description = "시작 시점에 매수하고 끝까지 보유하는 장기 투자 전략"
    parameters: list[ParameterDefinition] = []

    def generate_signals(
        self,
        data: pd.DataFrame,
        params: dict[str, float | int | str | bool],
    ) -> np.ndarray:
        """Generate HODL signals (buy on first day only)."""
        n = len(data)
        signals = np.zeros(n, dtype=np.int32)
        if n > 0:
            signals[0] = 1  # Buy on first day
        return signals

    def execute(
        self,
        data: pd.DataFrame,
        params: dict[str, float | int | str | bool],
        initial_capital: float,
    ) -> BacktestResponse:
        """Execute HODL strategy."""
        start_time = time_module.perf_counter()

        apply_fee = params.get("applyFee", True)
        fee_rate = 0.001 if apply_fee else 0  # 0.1%

        times = data["time"].values
        closes = data["close"].values
        n = len(closes)

        if n == 0:
            return BacktestResponse(
                trades=[],
                equity=[],
                metrics=PerformanceMetrics(
                    total_return=0, cagr=0, mdd=0, win_rate=0, sharpe_ratio=0, total_trades=0
                ),
                execution_time=0,
            )

        # Buy on first day
        buy_price = closes[0]
        buy_value = initial_capital * (1 - fee_rate)
        quantity = buy_value / buy_price

        trades = [
            Trade(
                time=int(times[0]),
                type="buy",
                price=buy_price,
                quantity=quantity,
                value=initial_capital,
                cost_basis=buy_price,
            )
        ]

        # Calculate equity curve
        equity = []
        for i in range(n):
            current_value = quantity * closes[i]
            equity.append({"time": int(times[i]), "value": current_value})

        # Final value
        final_value = quantity * closes[-1]

        # Calculate metrics
        total_return = ((final_value - initial_capital) / initial_capital) * 100

        # CAGR calculation
        days = n
        years = days / 365.0
        if years > 0 and final_value > 0:
            cagr = (pow(final_value / initial_capital, 1 / years) - 1) * 100
        else:
            cagr = 0

        # MDD calculation
        peak = equity[0]["value"]
        mdd = 0
        for e in equity:
            if e["value"] > peak:
                peak = e["value"]
            drawdown = ((e["value"] - peak) / peak) * 100
            if drawdown < mdd:
                mdd = drawdown

        execution_time = (time_module.perf_counter() - start_time) * 1000

        return BacktestResponse(
            trades=trades,
            equity=[EquityPoint(time=e["time"], value=e["value"]) for e in equity],
            metrics=PerformanceMetrics(
                total_return=total_return,
                cagr=cagr,
                mdd=mdd,
                win_rate=100 if total_return > 0 else 0,
                sharpe_ratio=0,  # Not calculated for HODL
                total_trades=1,
            ),
            execution_time=execution_time,
        )


# Register the strategy
hodl_strategy = HODLStrategy()
CryptoStrategyRegistry.register(hodl_strategy)
