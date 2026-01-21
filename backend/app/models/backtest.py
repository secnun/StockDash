"""Pydantic models for backtest API."""

from typing import Literal

from pydantic import BaseModel, Field


class OHLCV(BaseModel):
    """OHLCV candle data."""

    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float


class Trade(BaseModel):
    """Trade record."""

    time: int
    type: Literal["buy", "sell"]
    price: float
    quantity: float
    value: float
    cost_basis: float | None = Field(default=None, alias="costBasis")
    tier: int | None = None
    tier_slots: str | None = Field(default=None, alias="tierSlots")

    model_config = {"populate_by_name": True}


class EquityPoint(BaseModel):
    """Equity curve data point."""

    time: int
    value: float


class PerformanceMetrics(BaseModel):
    """Performance metrics."""

    total_return: float = Field(alias="totalReturn")
    cagr: float
    mdd: float
    win_rate: float = Field(alias="winRate")
    sharpe_ratio: float = Field(alias="sharpeRatio")
    total_trades: int = Field(alias="totalTrades")

    model_config = {"populate_by_name": True}


class BacktestRequest(BaseModel):
    """Request model for single backtest."""

    strategy_id: str = Field(alias="strategyId")
    ticker_id: str = Field(alias="tickerId")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")
    initial_capital: float = Field(alias="initialCapital")
    parameters: dict[str, float | int | str | bool]
    apply_fee: bool = Field(default=True, alias="applyFee")

    model_config = {"populate_by_name": True}


class BacktestResponse(BaseModel):
    """Response model for single backtest."""

    trades: list[Trade]
    equity: list[EquityPoint]
    metrics: PerformanceMetrics
    execution_time: float = Field(alias="executionTime")

    model_config = {"populate_by_name": True}


class ParamRange(BaseModel):
    """Parameter range for grid search."""

    min: float
    max: float
    step: float


class GridSearchRequest(BaseModel):
    """Request model for grid search."""

    strategy_id: str = Field(alias="strategyId")
    ticker_id: str = Field(alias="tickerId")
    param_ranges: dict[str, ParamRange] = Field(alias="paramRanges")
    initial_capital: float = Field(alias="initialCapital")
    top_n: int = Field(default=10, alias="topN")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")
    apply_fee: bool = Field(default=True, alias="applyFee")

    model_config = {"populate_by_name": True}


class GridSearchProgress(BaseModel):
    """Progress update for grid search SSE."""

    completed: int
    total: int
    percent: float


class GridSearchResultItem(BaseModel):
    """Single result item from grid search."""

    rank: int
    params: dict[str, float | int | str | bool]
    metrics: PerformanceMetrics


class GridSearchDone(BaseModel):
    """Final result when grid search completes."""

    total_time: float = Field(alias="totalTime")
    results_count: int = Field(alias="resultsCount")

    model_config = {"populate_by_name": True}
