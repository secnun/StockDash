"""HODL (Buy and Hold) Strategy for crypto."""

import time as time_module

import numpy as np
import pandas as pd

from app.models.backtest import BacktestResponse, EquityPoint, PerformanceMetrics, Trade
from app.models.strategy import ParameterDefinition
from app.services.metrics import calculate_metrics
from app.strategies.base import Strategy
from app.strategies.crypto.registry import CryptoStrategyRegistry


class HODLStrategy(Strategy):
    """
    HODL (Buy and Hold) Strategy.

    Buy at the start and hold until the end.
    Supports fractional shares (standard for crypto).
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
        """Execute HODL strategy with fractional share support."""
        start_time = time_module.perf_counter()

        apply_fee = params.get("applyFee", True)
        fee_rate = float(params.get("feeRate", 0.001)) if apply_fee else 0

        times = data["time"].values
        closes = data["close"].values
        n = len(closes)

        if n == 0:
            return BacktestResponse(
                trades=[],
                equity=[],
                cash=[],
                metrics=PerformanceMetrics(
                    total_return=0, cagr=0, mdd=0, win_rate=0, sharpe_ratio=0, total_trades=0
                ),
                execution_time=0,
            )

        # Buy on first day (fractional shares for crypto)
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

        # Calculate equity and cash curves
        equity: list[dict[str, float]] = []
        for i in range(n):
            current_value = quantity * closes[i]
            equity.append({"time": int(times[i]), "value": current_value})

        cash = [EquityPoint(time=int(times[i]), value=0) for i in range(n)]

        # Use shared metrics calculation
        metrics = calculate_metrics(
            trades=trades,
            equity=equity,
            initial_capital=initial_capital,
        )

        execution_time = (time_module.perf_counter() - start_time) * 1000

        return BacktestResponse(
            trades=trades,
            equity=[EquityPoint(time=e["time"], value=e["value"]) for e in equity],
            cash=cash,
            metrics=metrics,
            execution_time=execution_time,
        )


# Register the strategy
hodl_strategy = HODLStrategy()
CryptoStrategyRegistry.register(hodl_strategy)
