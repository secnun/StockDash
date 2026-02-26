"""Crypto Backtest API endpoints."""

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from pydantic import BaseModel, Field

from app.models.backtest import BacktestResponse, DateRangeResponse, OHLCV
from app.services.data_loader import filter_by_date_range, load_csv_pandas, timestamp_to_date
from app.strategies.crypto import CryptoStrategyRegistry

router = APIRouter(prefix="/api/crypto", tags=["crypto"])


def find_crypto_data_file(coin: str, market: str) -> Path | None:
    """
    Find the crypto data file path.

    Args:
        coin: Coin ID (e.g., 'btc')
        market: Market ID (e.g., 'usdt')

    Returns:
        Path to the data file, or None if not found
    """
    if not re.match(r'^[a-zA-Z0-9_-]+$', coin) or not re.match(r'^[a-zA-Z0-9_-]+$', market):
        return None

    settings = get_settings()
    # data_dir is ../data/stocks, so go up one level to get ../data
    base_data_dir = Path(settings.data_dir).parent

    # Path pattern: data/crypto/{coin}/day/{market}/*.csv
    crypto_dir = base_data_dir / "crypto" / coin.lower() / "day" / market.lower()

    if not crypto_dir.exists():
        return None

    # Find CSV files
    csv_files = list(crypto_dir.glob("*.csv"))
    if not csv_files:
        return None

    return csv_files[0]


@router.get("/strategies")
async def get_crypto_strategies() -> list[dict]:
    """Get all available crypto strategies."""
    strategies = CryptoStrategyRegistry.list_all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "parameters": [
                {
                    "key": p.key,
                    "label": p.label,
                    "type": p.type,
                    "default": p.default,
                    "min": p.min,
                    "max": p.max,
                    "step": p.step,
                }
                for p in s.parameters
            ],
        }
        for s in strategies
    ]


@router.get("/date-range")
async def get_crypto_date_range(coin: str, market: str) -> DateRangeResponse:
    """
    Get the date range available for a crypto pair.

    Args:
        coin: Coin ID (e.g., 'btc')
        market: Market ID (e.g., 'usdt')

    Returns:
        DateRangeResponse with min and max dates
    """
    data_path = find_crypto_data_file(coin, market)

    if data_path is None:
        raise HTTPException(
            status_code=404,
            detail=f"Data not found for {coin}/{market}",
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


@router.post("/backtest/run")
async def run_crypto_backtest(
    coin: str,
    market: str,
    strategy_id: str,
    initial_capital: float = 10000,
    start_date: str | None = None,
    end_date: str | None = None,
    apply_fee: bool = True,
    parameters: dict | None = None,
) -> BacktestResponse:
    """
    Run a crypto backtest.

    Args:
        coin: Coin ID (e.g., 'btc')
        market: Market ID (e.g., 'usdt')
        strategy_id: Strategy ID (e.g., 'hodl', 'sma_crossover')
        initial_capital: Starting capital
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
        apply_fee: Whether to apply trading fees (0.1%)
        parameters: Strategy parameters

    Returns:
        BacktestResponse with trades, equity, metrics, and priceData
    """
    # Get strategy
    strategy = CryptoStrategyRegistry.get(strategy_id)
    if strategy is None:
        raise HTTPException(
            status_code=404,
            detail=f"Strategy '{strategy_id}' not found",
        )

    # Load data
    data_path = find_crypto_data_file(coin, market)
    if data_path is None:
        raise HTTPException(
            status_code=404,
            detail=f"Data not found for {coin}/{market}",
        )

    try:
        df = load_csv_pandas(data_path)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load data: {str(e)}",
        )

    # Filter by date range
    df = filter_by_date_range(df, start_date, end_date)

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
        params = parameters or {}
        params["applyFee"] = apply_fee
        result = strategy.execute(
            data=df,
            params=params,
            initial_capital=initial_capital,
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

        yearly_independent = run_period_independent(strategy, df, initial_capital, params)
        result.yearly_independent = yearly_independent
    except Exception:
        pass  # 실패해도 메인 결과는 정상 반환

    return result


# Pairs Mode API

class PricePoint(BaseModel):
    """Single price point for pairs comparison."""

    time: int
    price: float
    change_percent: float = Field(alias="changePercent")

    model_config = {"populate_by_name": True}


class PairPriceResponse(BaseModel):
    """Response for pair price data."""

    coin: str
    market: str
    data: list[PricePoint]
    start_price: float = Field(alias="startPrice")
    end_price: float = Field(alias="endPrice")
    total_change: float = Field(alias="totalChange")

    model_config = {"populate_by_name": True}


@router.get("/pairs/price")
async def get_pair_price_data(
    coin: str,
    market: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> PairPriceResponse:
    """
    Get price data for pairs comparison.

    Args:
        coin: Coin ID (e.g., 'btc')
        market: Market ID (e.g., 'usdt')
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)

    Returns:
        PairPriceResponse with price data and change percentages
    """
    data_path = find_crypto_data_file(coin, market)

    if data_path is None:
        raise HTTPException(
            status_code=404,
            detail=f"Data not found for {coin}/{market}",
        )

    try:
        df = load_csv_pandas(data_path)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load data: {str(e)}",
        )

    # Filter by date range
    df = filter_by_date_range(df, start_date, end_date)

    if len(df) == 0:
        raise HTTPException(
            status_code=400,
            detail="No data available for the specified date range",
        )

    # Calculate price data with change percentages
    start_price = float(df["close"].iloc[0])
    times = df["time"].values
    closes = df["close"].values
    prices: list[PricePoint] = []

    for t, c in zip(times, closes):
        price = float(c)
        change_percent = ((price - start_price) / start_price) * 100
        prices.append(
            PricePoint(
                time=int(t),
                price=price,
                change_percent=change_percent,
            )
        )

    end_price = float(df["close"].iloc[-1])
    total_change = ((end_price - start_price) / start_price) * 100

    return PairPriceResponse(
        coin=coin,
        market=market,
        data=prices,
        start_price=start_price,
        end_price=end_price,
        total_change=total_change,
    )
