"""Backtest API endpoints."""

from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.models.backtest import BacktestRequest, BacktestResponse, DateRangeResponse, OHLCV
from app.services.data_loader import date_to_timestamp, filter_by_date_range, load_csv_pandas, timestamp_to_date
from app.strategies import StrategyRegistry  # Import from __init__ to trigger strategy registration

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


def find_data_file(ticker_id: str) -> Path | None:
    """
    Find the data file path for a given ticker.

    Args:
        ticker_id: Ticker ID (e.g., 'soxl', 'AAPL')

    Returns:
        Path to the data file, or None if not found
    """
    settings = get_settings()
    ticker_lower = ticker_id.lower()
    data_dir = Path(settings.data_dir)

    # Try different path patterns
    possible_paths = [
        data_dir / f"{ticker_id}.csv",
        data_dir / f"{ticker_lower}.csv",
        data_dir / "us" / ticker_lower / f"1d_*.csv",
    ]

    for pattern in possible_paths:
        if "*" in str(pattern):
            # Glob pattern
            matches = list(pattern.parent.glob(pattern.name))
            if matches:
                return matches[0]
        elif pattern.exists():
            return pattern

    return None


@router.get("/date-range/{ticker_id}", response_model=DateRangeResponse)
async def get_date_range(ticker_id: str) -> DateRangeResponse:
    """
    Get the date range available for a ticker.

    Args:
        ticker_id: Ticker ID (e.g., 'soxl')

    Returns:
        DateRangeResponse with min and max dates
    """
    data_path = find_data_file(ticker_id)

    if data_path is None or not data_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Data file for ticker '{ticker_id}' not found",
        )

    try:
        df = load_csv_pandas(data_path)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load data: {str(e)}",
        )

    if len(df) == 0:
        raise HTTPException(
            status_code=400,
            detail="Data file is empty",
        )

    min_date = timestamp_to_date(int(df["time"].iloc[0]))
    max_date = timestamp_to_date(int(df["time"].iloc[-1]))

    return DateRangeResponse(min=min_date, max=max_date)


@router.post("/run", response_model=BacktestResponse)
async def run_backtest(request: BacktestRequest) -> BacktestResponse:
    """
    Run a single backtest.

    Args:
        request: Backtest configuration

    Returns:
        BacktestResponse with trades, equity, metrics, and priceData
    """
    # Get strategy
    strategy = StrategyRegistry.get(request.strategy_id)
    if strategy is None:
        raise HTTPException(
            status_code=404,
            detail=f"Strategy '{request.strategy_id}' not found",
        )

    # Load data
    data_path = find_data_file(request.ticker_id)
    if data_path is None or not data_path.exists():
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

    # Convert DataFrame to OHLCV list for priceData
    price_data = [
        OHLCV(
            time=int(row["time"]),
            open=float(row["open"]),
            high=float(row["high"]),
            low=float(row["low"]),
            close=float(row["close"]),
            volume=float(row["volume"]),
        )
        for _, row in df.iterrows()
    ]

    # Execute strategy
    try:
        # Merge applyFee into parameters
        params = {**request.parameters, "applyFee": request.apply_fee}
        result = strategy.execute(
            data=df,
            params=params,
            initial_capital=request.initial_capital,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Backtest execution failed: {str(e)}",
        )

    # Add priceData to result
    result.price_data = price_data

    return result
