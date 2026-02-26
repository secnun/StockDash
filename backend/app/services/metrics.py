"""Performance metrics calculation using NumPy."""

import numpy as np

from app.models.backtest import PerformanceMetrics, Trade


def calculate_metrics(
    trades: list[Trade],
    equity: list[dict[str, float]],
    initial_capital: float,
) -> PerformanceMetrics:
    """
    Calculate backtest performance metrics.

    Args:
        trades: List of trade records
        equity: List of equity points {time, value}
        initial_capital: Starting capital

    Returns:
        PerformanceMetrics object
    """
    if not equity:
        return PerformanceMetrics(
            total_return=0,
            cagr=0,
            mdd=0,
            win_rate=0,
            sharpe_ratio=0,
            total_trades=0,
        )

    equity_values = np.array([e["value"] for e in equity], dtype=np.float64)
    equity_times = np.array([e["time"] for e in equity], dtype=np.int64)

    final_value = equity_values[-1]
    total_return = ((final_value - initial_capital) / initial_capital) * 100

    # Win rate calculation
    win_rate = _calculate_win_rate(trades)

    # MDD calculation
    mdd = _calculate_mdd(equity_values)

    # CAGR calculation
    cagr = _calculate_cagr(equity_times, equity_values, initial_capital)

    # Sharpe ratio
    sharpe = _calculate_sharpe_ratio(equity_values)

    return PerformanceMetrics(
        total_return=round(total_return, 2),
        cagr=round(cagr, 2),
        mdd=round(mdd, 2),
        win_rate=round(win_rate, 2),
        sharpe_ratio=round(sharpe, 2),
        total_trades=len(trades),
    )


def _calculate_win_rate(trades: list[Trade]) -> float:
    """Calculate win rate from trades."""
    # Check for cost_basis based calculation
    sell_trades_with_cost = [t for t in trades if t.type == "sell" and t.cost_basis is not None]

    if sell_trades_with_cost:
        winning = sum(1 for t in sell_trades_with_cost if t.price > (t.cost_basis or 0))
        return (winning / len(sell_trades_with_cost)) * 100

    # Traditional pair-based calculation
    pairs = _get_trade_pairs(trades)
    if not pairs:
        return 0

    winning = sum(1 for buy, sell in pairs if sell.price > buy.price)
    return (winning / len(pairs)) * 100


def _get_trade_pairs(trades: list[Trade]) -> list[tuple[Trade, Trade]]:
    """Extract buy-sell pairs from trades using FIFO matching."""
    pairs: list[tuple[Trade, Trade]] = []
    buy_stack: list[Trade] = []

    for trade in trades:
        if trade.type == "buy":
            buy_stack.append(trade)
        elif trade.type == "sell" and buy_stack:
            pairs.append((buy_stack.pop(0), trade))

    return pairs


def _calculate_mdd(equity_values: np.ndarray) -> float:
    """
    Calculate Maximum Drawdown using NumPy vectorization.

    Args:
        equity_values: Array of equity values

    Returns:
        MDD as percentage
    """
    if len(equity_values) == 0:
        return 0.0

    # Running maximum
    running_max = np.maximum.accumulate(equity_values)

    # Guard against zero running_max (edge case)
    safe_max = np.where(running_max == 0, 1, running_max)

    # Drawdown at each point
    drawdowns = (running_max - equity_values) / safe_max * 100

    return float(np.max(drawdowns))


def _calculate_cagr(
    times: np.ndarray,
    values: np.ndarray,
    initial_capital: float,
) -> float:
    """
    Calculate Compound Annual Growth Rate.

    Args:
        times: Array of timestamps
        values: Array of equity values
        initial_capital: Starting capital

    Returns:
        CAGR as percentage
    """
    if len(times) < 2:
        return 0.0

    start_time = times[0]
    end_time = times[-1]
    final_value = values[-1]

    # Years (timestamps are in seconds)
    years = (end_time - start_time) / (365.25 * 24 * 60 * 60)

    if years <= 0:
        return 0.0

    cagr = (np.power(final_value / initial_capital, 1 / years) - 1) * 100
    return float(cagr)


def _calculate_sharpe_ratio(equity_values: np.ndarray) -> float:
    """
    Calculate Sharpe Ratio (simplified, risk-free rate = 0).

    Args:
        equity_values: Array of equity values

    Returns:
        Annualized Sharpe ratio
    """
    if len(equity_values) < 2:
        return 0.0

    # Daily returns (vectorized)
    daily_returns = np.diff(equity_values) / equity_values[:-1]

    if len(daily_returns) == 0:
        return 0.0

    mean_return = np.mean(daily_returns)
    std_dev = np.std(daily_returns)

    if std_dev == 0:
        return 0.0

    # Annualized Sharpe (assuming daily data, 252 trading days)
    sharpe = (mean_return / std_dev) * np.sqrt(252)
    return float(sharpe)


