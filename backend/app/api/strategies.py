"""Strategy API endpoints."""

from fastapi import APIRouter, HTTPException

from app.models.strategy import ParameterDefinition, StrategyInfo, StrategyListResponse
from app.strategies.base import StrategyRegistry

# Import strategies to register them
from app.strategies import sample_sma  # noqa: F401

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


@router.get("/{strategy_id}", response_model=StrategyInfo)
async def get_strategy(strategy_id: str) -> StrategyInfo:
    """Get strategy details by ID."""
    strategy = StrategyRegistry.get(strategy_id)

    if strategy is None:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_id}' not found")

    return StrategyInfo(
        id=strategy.id,
        name=strategy.name,
        description=strategy.description,
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
            for p in strategy.parameters
        ],
    )
