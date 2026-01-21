"""Sample SMA Crossover Strategy for testing."""

import numpy as np
import pandas as pd

from app.models.strategy import ParameterDefinition
from app.strategies.base import Strategy, StrategyRegistry


class SMACrossoverStrategy(Strategy):
    """
    Simple Moving Average Crossover Strategy.

    Buy when short SMA crosses above long SMA.
    Sell when short SMA crosses below long SMA.
    """

    id = "sma_crossover"
    name = "SMA Crossover"
    description = "단기 이동평균이 장기 이동평균을 상향 돌파시 매수, 하향 돌파시 매도"

    parameters = [
        ParameterDefinition(
            key="shortPeriod",
            label="단기 이평 기간",
            type="number",
            default=10,
            min=2,
            max=50,
            step=1,
        ),
        ParameterDefinition(
            key="longPeriod",
            label="장기 이평 기간",
            type="number",
            default=30,
            min=5,
            max=200,
            step=1,
        ),
    ]

    def generate_signals(
        self,
        data: pd.DataFrame,
        params: dict[str, float | int | str | bool],
    ) -> np.ndarray:
        """Generate SMA crossover signals."""
        short_period = int(params.get("shortPeriod", 10))
        long_period = int(params.get("longPeriod", 30))

        closes = data["close"].values
        n = len(closes)

        signals = np.zeros(n, dtype=np.int32)

        if n < long_period:
            return signals

        # Calculate SMAs (vectorized)
        short_sma = np.convolve(closes, np.ones(short_period) / short_period, mode="valid")
        long_sma = np.convolve(closes, np.ones(long_period) / long_period, mode="valid")

        # Align arrays (long SMA starts later)
        offset = long_period - short_period
        short_sma_aligned = short_sma[offset:]

        # Find crossover points
        # Previous: short < long, Current: short > long => Buy (1)
        # Previous: short > long, Current: short < long => Sell (-1)
        min_len = min(len(short_sma_aligned), len(long_sma))
        for i in range(1, min_len):
            idx = long_period - 1 + i  # Index in original data

            prev_short = short_sma_aligned[i - 1]
            prev_long = long_sma[i - 1]
            curr_short = short_sma_aligned[i]
            curr_long = long_sma[i]

            if prev_short <= prev_long and curr_short > curr_long:
                signals[idx] = 1  # Buy
            elif prev_short >= prev_long and curr_short < curr_long:
                signals[idx] = -1  # Sell

        return signals


# Register the strategy
StrategyRegistry.register(SMACrossoverStrategy())
