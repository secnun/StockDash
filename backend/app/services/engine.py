"""Backtest engine with NumPy optimization."""

from typing import Literal

import numpy as np
import pandas as pd

from app.models.backtest import Trade


class BacktestEngine:
    """
    Backtest engine for executing trades and managing positions.

    Uses NumPy for performance-critical calculations.
    """

    def __init__(self, initial_capital: float) -> None:
        self.initial_capital = initial_capital
        self.cash = initial_capital
        self.position = 0  # Quantity held
        self.trades: list[Trade] = []
        self.equity: list[dict[str, float]] = []
        self._avg_cost = 0.0  # Average cost basis for position

    def buy(self, time: int, price: float, quantity: int | None = None) -> None:
        """
        Execute a buy order.

        Args:
            time: Unix timestamp
            price: Price per share
            quantity: Number of shares (optional, defaults to max affordable)
        """
        buy_quantity = quantity if quantity is not None else int(self.cash // price)

        if buy_quantity <= 0:
            return

        total_cost = buy_quantity * price

        if total_cost > self.cash:
            affordable = int(self.cash // price)
            if affordable <= 0:
                return
            self._execute_buy(time, price, affordable)
        else:
            self._execute_buy(time, price, buy_quantity)

    def sell(self, time: int, price: float, quantity: int | None = None) -> None:
        """
        Execute a sell order.

        Args:
            time: Unix timestamp
            price: Price per share
            quantity: Number of shares (optional, defaults to full position)
        """
        sell_quantity = quantity if quantity is not None else self.position

        if sell_quantity <= 0 or sell_quantity > self.position:
            return

        self._execute_sell(time, price, sell_quantity)

    def _execute_buy(self, time: int, price: float, quantity: int) -> None:
        """Internal buy execution."""
        total_cost = quantity * price

        # Update average cost (moving average)
        total_value = self._avg_cost * self.position + total_cost
        new_position = self.position + quantity
        self._avg_cost = total_value / new_position if new_position > 0 else 0

        self.cash -= total_cost
        self.position = new_position

        self.trades.append(
            Trade(
                time=time,
                type="buy",
                price=price,
                quantity=quantity,
                value=total_cost,
            )
        )

    def _execute_sell(self, time: int, price: float, quantity: int) -> None:
        """Internal sell execution."""
        total_value = quantity * price

        self.cash += total_value
        self.position -= quantity

        self.trades.append(
            Trade(
                time=time,
                type="sell",
                price=price,
                quantity=quantity,
                value=total_value,
                cost_basis=self._avg_cost,
            )
        )

        # Reset avg cost if position closed
        if self.position == 0:
            self._avg_cost = 0.0

    def get_portfolio_value(self, current_price: float) -> float:
        """Calculate current portfolio value."""
        return self.cash + self.position * current_price

    def record_equity(self, time: int, current_price: float) -> None:
        """Record equity curve point."""
        value = self.get_portfolio_value(current_price)
        self.equity.append({"time": time, "value": value})

    def get_results(self) -> dict:
        """Get backtest results."""
        return {
            "trades": self.trades,
            "equity": self.equity,
        }

    def has_position(self) -> bool:
        """Check if currently holding a position."""
        return self.position > 0

    def reset(self, initial_capital: float | None = None) -> None:
        """Reset engine for new backtest."""
        self.initial_capital = initial_capital or self.initial_capital
        self.cash = self.initial_capital
        self.position = 0
        self.trades = []
        self.equity = []
        self._avg_cost = 0.0


Signal = Literal["buy", "sell", "hold"]
SignalGenerator = type["SignalGeneratorBase"]


class SignalGeneratorBase:
    """Base class for signal generators."""

    def generate(self, data: pd.DataFrame, index: int) -> Signal:
        """Generate trading signal for given index."""
        raise NotImplementedError


def run_backtest(
    data: pd.DataFrame,
    signal_generator: SignalGeneratorBase,
    initial_capital: float,
) -> dict:
    """
    Run backtest with given data and signal generator.

    Args:
        data: OHLCV DataFrame
        signal_generator: Signal generator instance
        initial_capital: Starting capital

    Returns:
        Dict with trades and equity
    """
    engine = BacktestEngine(initial_capital)

    times = data["time"].values
    closes = data["close"].values

    for i in range(len(data)):
        signal = signal_generator.generate(data, i)

        if signal == "buy" and not engine.has_position():
            engine.buy(int(times[i]), float(closes[i]))
        elif signal == "sell" and engine.has_position():
            engine.sell(int(times[i]), float(closes[i]))

        engine.record_equity(int(times[i]), float(closes[i]))

    # Close position at end
    if engine.has_position() and len(data) > 0:
        engine.sell(int(times[-1]), float(closes[-1]))

    return engine.get_results()


def run_backtest_vectorized(
    times: np.ndarray,
    closes: np.ndarray,
    signals: np.ndarray,
    initial_capital: float,
) -> dict:
    """
    Run backtest with pre-computed signals (NumPy vectorized).

    This is optimized for grid search where signals are pre-computed.

    Args:
        times: Array of timestamps
        closes: Array of close prices
        signals: Array of signals (1=buy, -1=sell, 0=hold)
        initial_capital: Starting capital

    Returns:
        Dict with trades and equity
    """
    n = len(times)
    if n == 0:
        return {"trades": [], "equity": []}

    # State tracking
    cash = initial_capital
    position = 0
    avg_cost = 0.0
    trades: list[Trade] = []
    equity_values = np.zeros(n, dtype=np.float64)

    for i in range(n):
        time = int(times[i])
        price = float(closes[i])
        signal = int(signals[i])

        # Execute trades
        if signal == 1 and position == 0:  # Buy
            quantity = int(cash // price)
            if quantity > 0:
                cost = quantity * price
                avg_cost = price
                cash -= cost
                position = quantity
                trades.append(
                    Trade(
                        time=time,
                        type="buy",
                        price=price,
                        quantity=quantity,
                        value=cost,
                    )
                )

        elif signal == -1 and position > 0:  # Sell
            value = position * price
            cash += value
            trades.append(
                Trade(
                    time=time,
                    type="sell",
                    price=price,
                    quantity=position,
                    value=value,
                    cost_basis=avg_cost,
                )
            )
            position = 0
            avg_cost = 0.0

        # Record equity
        equity_values[i] = cash + position * price

    # Close position at end
    if position > 0:
        price = float(closes[-1])
        value = position * price
        cash += value
        trades.append(
            Trade(
                time=int(times[-1]),
                type="sell",
                price=price,
                quantity=position,
                value=value,
                cost_basis=avg_cost,
            )
        )
        equity_values[-1] = cash

    equity = [{"time": int(times[i]), "value": float(equity_values[i])} for i in range(n)]

    return {"trades": trades, "equity": equity}
