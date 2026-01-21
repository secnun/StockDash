"""Backtest API endpoints."""

from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.models.backtest import BacktestRequest, BacktestResponse
from app.services.data_loader import date_to_timestamp, filter_by_date_range, load_csv_pandas
from app.strategies.base import StrategyRegistry

# Import strategies to register them
from app.strategies import sample_sma  # noqa: F401

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


@router.post("/run", response_model=BacktestResponse)
async def run_backtest(request: BacktestRequest) -> BacktestResponse:
    """
    Run a single backtest.

    Args:
        request: Backtest configuration

    Returns:
        BacktestResponse with trades, equity, and metrics
    """
    settings = get_settings()

    # Get strategy
    strategy = StrategyRegistry.get(request.strategy_id)
    if strategy is None:
        raise HTTPException(
            status_code=404,
            detail=f"Strategy '{request.strategy_id}' not found",
        )

    # Load data
    data_path = Path(settings.data_dir) / f"{request.ticker_id}.csv"
    if not data_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Data file for ticker '{request.ticker_id}' not found",
        )

    try:
        df = load_csv_pandas(data_path)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load data: {str(e)}",
        )

    # Filter by date range
    start_time = date_to_timestamp(request.start_date) if request.start_date else None
    end_time = date_to_timestamp(request.end_date) if request.end_date else None
    df = filter_by_date_range(df, start_time, end_time)

    if len(df) == 0:
        raise HTTPException(
            status_code=400,
            detail="No data available for the specified date range",
        )

    # Execute strategy
    try:
        result = strategy.execute(
            data=df,
            params=request.parameters,
            initial_capital=request.initial_capital,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Backtest execution failed: {str(e)}",
        )

    return result
