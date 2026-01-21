"""Base strategy class and registry."""

from abc import ABC, abstractmethod

import numpy as np
import pandas as pd

from app.models.backtest import BacktestResponse, PerformanceMetrics, Trade
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
            metrics=metrics,
            execution_time=execution_time,
        )


class StrategyRegistry:
    """Registry for available strategies."""

    _strategies: dict[str, Strategy] = {}

    @classmethod
    def register(cls, strategy: Strategy) -> None:
        """Register a strategy."""
        cls._strategies[strategy.id] = strategy

    @classmethod
    def get(cls, strategy_id: str) -> Strategy | None:
        """Get strategy by ID."""
        return cls._strategies.get(strategy_id)

    @classmethod
    def list_all(cls) -> list[Strategy]:
        """Get all registered strategies."""
        return list(cls._strategies.values())

    @classmethod
    def clear(cls) -> None:
        """Clear all registered strategies."""
        cls._strategies.clear()
