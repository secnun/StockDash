"""Trading strategies package (private)."""

from app.strategies.base import Strategy, StrategyRegistry, TieredStrategy, TierPosition
from app.strategies.ddeolsapro_base import DdeolsaproBase, TieredStrategyState

# Import strategies to register them
from app.strategies.ddeolsapro1 import ddeolsapro1_strategy  # noqa: F401
from app.strategies.ddeolsapro2 import ddeolsapro2_strategy  # noqa: F401
from app.strategies.ddeolsapro3 import ddeolsapro3_strategy  # noqa: F401
from app.strategies.ddeolsapro_custom import ddeolsapro_custom_strategy  # noqa: F401
from app.strategies.ddeolsapro_at import ddeolsapro_at_strategy  # noqa: F401
from app.strategies.moomae21 import moomae21_strategy  # noqa: F401
from app.strategies.jongjong5 import jongjong5_strategy  # noqa: F401
from app.strategies.wadaeri import wadaeri_v1_strategy  # noqa: F401

def get_split_ratios(strategy_id: str) -> list[float]:
    """전략 ID로 분할 비율 반환 (단일 소스).

    전략 클래스의 SPLIT_RATIOS를 사용하며,
    등록되지 않은 전략은 균등 6분할을 반환.
    """
    strategy = StrategyRegistry.get(strategy_id)
    if strategy is not None and hasattr(strategy, "SPLIT_RATIOS"):
        return list(strategy.SPLIT_RATIOS)
    # fallback: 균등 6분할
    return [1 / 6] * 6


__all__ = [
    "Strategy", "StrategyRegistry", "TieredStrategy", "TierPosition",
    "DdeolsaproBase", "TieredStrategyState",
    "get_split_ratios",
]
