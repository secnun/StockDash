"""Strategy API endpoints."""

from fastapi import APIRouter

from app.models.strategy import ParameterDefinition, StrategyInfo, StrategyListResponse
from app.strategies import StrategyRegistry  # Import from __init__ to trigger strategy registration

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


@router.get("", response_model=StrategyListResponse)
async def list_strategies() -> StrategyListResponse:
    """Get list of available strategies."""
    strategies = StrategyRegistry.list_all()

    return StrategyListResponse(
        strategies=[
            StrategyInfo(
                id=s.id,
                name=s.name,
                description=s.description,
                parameters=[
                    ParameterDefinition(
                        key=p.key,
                        label=p.label,
                        type=p.type,
                        default=p.default,
                        min=p.min,
                        max=p.max,
                        step=p.step,
                        options=p.options,
                    )
                    for p in s.parameters
                ],
            )
            for s in strategies
        ]
    )


