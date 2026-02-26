"""Backtest API endpoints."""

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.models.backtest import BacktestRequest, BacktestResponse, DateRangeResponse, OHLCV
from app.services.data_loader import filter_by_date_range, load_csv_pandas, timestamp_to_date
from app.strategies import StrategyRegistry  # Import from __init__ to trigger strategy registration
from app.strategies.utils import get_fee_rate_for_market

router = APIRouter(prefix="/api/backtest", tags=["backtest"])

# market 파라미터 → 실제 디렉토리명 매핑
MARKET_DIR_MAP: dict[str, str] = {
    "kr": "ko",
}


def find_data_file(ticker_id: str, market: str = "us") -> Path | None:
    """
    Find the data file path for a given ticker.

    Args:
        ticker_id: Ticker ID (e.g., 'soxl', 'AAPL')
        market: Market identifier (e.g., 'us', 'kr')

    Returns:
        Path to the data file, or None if not found
    """
    if not re.match(r'^[a-zA-Z0-9_-]+$', ticker_id):
        return None
    if not re.match(r'^[a-zA-Z0-9_-]+$', market):
        return None

    settings = get_settings()
    ticker_lower = ticker_id.lower()
    data_dir = Path(settings.data_dir)
    market_dir = MARKET_DIR_MAP.get(market, market)

    # Try different path patterns
    possible_paths = [
        data_dir / market_dir / ticker_lower / f"1d_*.csv",
        data_dir / f"{ticker_id}.csv",
        data_dir / f"{ticker_lower}.csv",
    ]

    for pattern in possible_paths:
        if "*" in str(pattern):
            # Glob pattern
            matches = sorted(pattern.parent.glob(pattern.name))
            if matches:
                return matches[-1]  # 최신 파일 (파일명에 날짜 포함, 알파벳순 마지막)
        elif pattern.exists():
            return pattern

    return None


@router.get("/date-range/{ticker_id}", response_model=DateRangeResponse)
async def get_date_range(ticker_id: str, market: str = "us") -> DateRangeResponse:
    """
    Get the date range available for a ticker.

    Args:
        ticker_id: Ticker ID (e.g., 'soxl')
        market: Market identifier (e.g., 'us', 'kr')

    Returns:
        DateRangeResponse with min and max dates
    """
    data_path = find_data_file(ticker_id, market)

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
    data_path = find_data_file(request.ticker_id, request.market)
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
    df = filter_by_date_range(df, request.start_date, request.end_date)

    if len(df) == 0:
        raise HTTPException(
            status_code=400,
            detail="No data available for the specified date range",
        )

    # Convert DataFrame to OHLCV list for priceData
    price_data = [
        OHLCV(time=int(t), open=float(o), high=float(h), low=float(l), close=float(c), volume=float(v))
        for t, o, h, l, c, v in zip(
            df["time"].values, df["open"].values, df["high"].values,
            df["low"].values, df["close"].values, df["volume"].values,
        )
    ]

    # Execute strategy
    try:
        # Merge applyFee and market-specific feeRate into parameters
        fee_rate = get_fee_rate_for_market(request.market)
        params = {**request.parameters, "applyFee": request.apply_fee, "feeRate": fee_rate}
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

    # Calculate period-independent stats (yearly or monthly)
    try:
        from app.services.yearly_backtest import run_period_independent

        yearly_independent = run_period_independent(strategy, df, request.initial_capital, params)
        result.yearly_independent = yearly_independent
    except Exception:
        pass  # 실패해도 메인 결과는 정상 반환

    return result
