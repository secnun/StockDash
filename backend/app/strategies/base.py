"""Base strategy class and registry."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from app.models.backtest import BacktestResponse, EquityPoint, Trade
from app.models.strategy import ParameterDefinition
from app.services.engine import run_backtest_vectorized
from app.services.metrics import calculate_metrics


class Strategy(ABC):
    """Abstract base class for trading strategies."""

    id: str
    name: str
    description: str
    parameters: list[ParameterDefinition]

    @abstractmethod
    def generate_signals(
        self,
        data: pd.DataFrame,
        params: dict[str, float | int | str | bool],
    ) -> np.ndarray:
        """
        Generate trading signals for entire dataset.

        Args:
            data: OHLCV DataFrame
            params: Strategy parameters

        Returns:
            NumPy array of signals (1=buy, -1=sell, 0=hold)
        """
        pass

    def execute(
        self,
        data: pd.DataFrame,
        params: dict[str, float | int | str | bool],
        initial_capital: float,
    ) -> BacktestResponse:
        """
        Execute strategy and return backtest results.

        Args:
            data: OHLCV DataFrame
            params: Strategy parameters
            initial_capital: Starting capital

        Returns:
            BacktestResponse with trades, equity, and metrics
        """
        import time

        start_time = time.perf_counter()

        # Generate signals (vectorized)
        signals = self.generate_signals(data, params)

        # Run backtest
        results = run_backtest_vectorized(
            times=data["time"].values,
            closes=data["close"].values,
            signals=signals,
            initial_capital=initial_capital,
        )

        # Calculate metrics
        metrics = calculate_metrics(
            trades=results["trades"],
            equity=results["equity"],
            initial_capital=initial_capital,
        )

        execution_time = (time.perf_counter() - start_time) * 1000  # ms

        return BacktestResponse(
            trades=results["trades"],
            equity=[
                {"time": e["time"], "value": e["value"]} for e in results["equity"]
            ],
            cash=[
                {"time": c["time"], "value": c["value"]} for c in results["cash"]
            ],
            metrics=metrics,
            execution_time=execution_time,
        )


@dataclass
class TierPosition:
    """Individual tier position for tiered strategies."""

    tier: int  # 1-based tier number
    buy_price: float  # Buy price (for profit target calculation)
    buy_day_index: int  # Buy day index (for stop-loss calculation)
    quantity: int  # Quantity held (integer)
    buy_value: float  # Total buy cost including fees
    target_profit: float = 0.0  # 매수 시점의 목표 수익률 (carry 스위칭용)
    stop_loss_days: int = 0  # 매수 시점의 손절 기간 (carry 스위칭용)


class TieredStrategy(ABC):
    """
    Abstract base class for tiered strategies.

    Tiered strategies manage multiple positions (tiers) with individual
    buy/sell conditions. They cannot be reduced to simple signals.
    """

    id: str
    name: str
    description: str
    parameters: list[ParameterDefinition]

    @abstractmethod
    def execute(
        self,
        data: pd.DataFrame,
        params: dict[str, Any],
        initial_capital: float,
    ) -> BacktestResponse:
        """
        Execute strategy with full control over trade execution.

        Args:
            data: OHLCV DataFrame with columns: time, open, high, low, close, volume
            params: Strategy parameters
            initial_capital: Starting capital

        Returns:
            BacktestResponse with trades, equity, and metrics
        """
        pass

    def _build_response(
        self,
        trades: list[Trade],
        equity: list[dict[str, float]],
        initial_capital: float,
        start_time: float,
        cash_history: list[dict[str, float]] | None = None,
    ) -> BacktestResponse:
        """Helper to build BacktestResponse with metrics."""
        import time as time_module

        metrics = calculate_metrics(
            trades=trades,
            equity=equity,
            initial_capital=initial_capital,
        )

        execution_time = (time_module.perf_counter() - start_time) * 1000

        return BacktestResponse(
            trades=trades,
            equity=[EquityPoint(time=e["time"], value=e["value"]) for e in equity],
            cash=[EquityPoint(time=c["time"], value=c["value"]) for c in (cash_history or [])],
            metrics=metrics,
            execution_time=execution_time,
        )

    @staticmethod
    def get_tier_slots_string(tier_positions: list[TierPosition | None]) -> str:
        """Generate string representation of filled tier slots."""
        slots = [str(i + 1) for i, p in enumerate(tier_positions) if p is not None]
        return ",".join(slots) if slots else "-"

    @staticmethod
    def find_empty_tier_slot(tier_positions: list[TierPosition | None]) -> int:
        """Find lowest empty tier slot. Returns -1 if all filled."""
        for i, pos in enumerate(tier_positions):
            if pos is None:
                return i
        return -1


class StrategyRegistry:
    """Registry for available strategies."""

    _strategies: dict[str, Strategy | TieredStrategy] = {}

    @classmethod
    def register(cls, strategy: Strategy | TieredStrategy) -> None:
        """Register a strategy."""
        cls._strategies[strategy.id] = strategy

    @classmethod
    def get(cls, strategy_id: str) -> Strategy | TieredStrategy | None:
        """Get strategy by ID."""
        return cls._strategies.get(strategy_id)

    @classmethod
    def list_all(cls) -> list[Strategy | TieredStrategy]:
        """Get all registered strategies."""
        return list(cls._strategies.values())

    @classmethod
    def clear(cls) -> None:
        """Clear all registered strategies."""
        cls._strategies.clear()
