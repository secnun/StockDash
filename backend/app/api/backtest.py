"""Backtest API endpoints."""

from fastapi import APIRouter, HTTPException

from app.models.backtest import BacktestRequest, BacktestResponse, DateRangeResponse
from app.services.backtest_service import (
    get_date_range as _get_date_range,
    run_backtest as _run_backtest,
)
from app.services.exceptions import (
    BacktestExecutionError,
    DataNotFoundError,
    EmptyDataError,
    StrategyNotFoundError,
)

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


@router.get("/date-range/{ticker_id}", response_model=DateRangeResponse)
async def get_date_range(ticker_id: str, market: str = "us") -> DateRangeResponse:
    """Get the date range available for a ticker."""
    try:
        return _get_date_range(ticker_id, market)
    except DataNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except EmptyDataError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except BacktestExecutionError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run", response_model=BacktestResponse)
async def run_backtest(request: BacktestRequest) -> BacktestResponse:
    """Run a single backtest."""
    try:
        return _run_backtest(
            strategy_id=request.strategy_id,
            ticker_id=request.ticker_id,
            market=request.market,
            start_date=request.start_date,
            end_date=request.end_date,
            initial_capital=request.initial_capital,
            parameters=request.parameters,
            apply_fee=request.apply_fee,
        )
    except StrategyNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except DataNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except EmptyDataError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except BacktestExecutionError as e:
        raise HTTPException(status_code=500, detail=str(e))
