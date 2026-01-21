"""Tests for backtest engine."""

import numpy as np
import pandas as pd
import pytest

from app.services.engine import BacktestEngine, run_backtest_vectorized
from app.services.metrics import calculate_metrics


@pytest.fixture
def sample_data() -> pd.DataFrame:
    """Create sample OHLCV data."""
    n = 100
    times = np.arange(1609459200, 1609459200 + n * 86400, 86400)  # Daily timestamps
    base_price = 100.0
    np.random.seed(42)
    closes = base_price + np.cumsum(np.random.randn(n) * 2)

    return pd.DataFrame(
        {
            "time": times,
            "open": closes - 1,
            "high": closes + 2,
            "low": closes - 2,
            "close": closes,
            "volume": np.random.randint(1000, 10000, n),
        }
    )


class TestBacktestEngine:
    """Test BacktestEngine class."""

    def test_initialization(self) -> None:
        """Test engine initialization."""
        engine = BacktestEngine(initial_capital=1_000_000)
        assert engine.cash == 1_000_000
        assert engine.position == 0
        assert len(engine.trades) == 0

    def test_buy_order(self) -> None:
        """Test buy order execution."""
        engine = BacktestEngine(initial_capital=1_000_000)
        engine.buy(time=1609459200, price=100.0, quantity=100)

        assert engine.position == 100
        assert engine.cash == 1_000_000 - 10_000
        assert len(engine.trades) == 1
        assert engine.trades[0].type == "buy"

    def test_sell_order(self) -> None:
        """Test sell order execution."""
        engine = BacktestEngine(initial_capital=1_000_000)
        engine.buy(time=1609459200, price=100.0, quantity=100)
        engine.sell(time=1609545600, price=110.0, quantity=100)

        assert engine.position == 0
        assert engine.cash == 1_000_000 + 1_000  # 10% profit
        assert len(engine.trades) == 2

    def test_portfolio_value(self) -> None:
        """Test portfolio value calculation."""
        engine = BacktestEngine(initial_capital=1_000_000)
        engine.buy(time=1609459200, price=100.0, quantity=100)

        # Price increased 10%
        value = engine.get_portfolio_value(current_price=110.0)
        assert value == (1_000_000 - 10_000) + (100 * 110)

    def test_reset(self) -> None:
        """Test engine reset."""
        engine = BacktestEngine(initial_capital=1_000_000)
        engine.buy(time=1609459200, price=100.0, quantity=100)
        engine.reset()

        assert engine.cash == 1_000_000
        assert engine.position == 0
        assert len(engine.trades) == 0


class TestVectorizedBacktest:
    """Test vectorized backtest function."""

    def test_basic_backtest(self, sample_data: pd.DataFrame) -> None:
        """Test basic vectorized backtest."""
        times = sample_data["time"].values
        closes = sample_data["close"].values

        # Simple buy-hold-sell signals
        signals = np.zeros(len(times), dtype=np.int32)
        signals[10] = 1  # Buy
        signals[50] = -1  # Sell

        result = run_backtest_vectorized(
            times=times,
            closes=closes,
            signals=signals,
            initial_capital=1_000_000,
        )

        assert len(result["trades"]) >= 2  # At least buy and sell
        assert len(result["equity"]) == len(times)

    def test_no_trades(self, sample_data: pd.DataFrame) -> None:
        """Test backtest with no signals."""
        times = sample_data["time"].values
        closes = sample_data["close"].values
        signals = np.zeros(len(times), dtype=np.int32)

        result = run_backtest_vectorized(
            times=times,
            closes=closes,
            signals=signals,
            initial_capital=1_000_000,
        )

        assert len(result["trades"]) == 0
        assert result["equity"][-1]["value"] == 1_000_000


class TestMetrics:
    """Test metrics calculation."""

    def test_basic_metrics(self) -> None:
        """Test basic metrics calculation."""
        from app.models.backtest import Trade

        trades = [
            Trade(time=1609459200, type="buy", price=100, quantity=100, value=10000),
            Trade(time=1609545600, type="sell", price=110, quantity=100, value=11000),
        ]
        equity = [
            {"time": 1609459200, "value": 1_000_000},
            {"time": 1609545600, "value": 1_001_000},
        ]

        metrics = calculate_metrics(trades, equity, 1_000_000)

        assert metrics.total_return == 0.1
        assert metrics.total_trades == 2
        assert metrics.win_rate == 100.0

    def test_empty_metrics(self) -> None:
        """Test metrics with no data."""
        metrics = calculate_metrics([], [], 1_000_000)

        assert metrics.total_return == 0
        assert metrics.total_trades == 0
        assert metrics.mdd == 0
