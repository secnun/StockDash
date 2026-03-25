"""Crypto trading strategies package."""

from app.strategies.crypto.registry import CryptoStrategyRegistry
from app.strategies.crypto.hodl import hodl_strategy  # noqa: F401
from app.strategies.crypto.sma_crossover import sma_crossover_strategy  # noqa: F401
from app.strategies.crypto.jongjong5 import crypto_jongjong5_strategy  # noqa: F401

__all__ = ["CryptoStrategyRegistry"]
