"""Crypto strategy registry."""

from app.strategies.base import Strategy, TieredStrategy


class CryptoStrategyRegistry:
    """Registry for crypto strategies."""

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
