"""Pydantic models for backtest API."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class PeriodIndependentStats(BaseModel):
    """기간별 독립 백테스트 결과. 연도별 또는 월별."""

    label: str  # "2020" (연도) 또는 "2024-03" (월)
    start_value: float = Field(alias="startValue")
    end_value: float = Field(alias="endValue")
    total_return: float = Field(alias="totalReturn")
    mdd: float
    total_trades: int = Field(alias="totalTrades")

    model_config = {"populate_by_name": True}


class PeriodIndependentResult(BaseModel):
    """독립 백테스트 결과 (시드 리셋 + 시드 이월)."""

    granularity: Literal["yearly", "monthly"]
    seed_reset: list[PeriodIndependentStats] = Field(alias="seedReset")
    seed_carry: list[PeriodIndependentStats] = Field(alias="seedCarry")

    model_config = {"populate_by_name": True}


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
    market: str = Field(default="us")

    model_config = {"populate_by_name": True}

    @field_validator("initial_capital")
    @classmethod
    def initial_capital_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("initial_capital must be greater than 0")
        return v


class BacktestResponse(BaseModel):
    """Response model for single backtest."""

    trades: list[Trade]
    equity: list[EquityPoint]
    cash: list[EquityPoint] = Field(default_factory=list)
    metrics: PerformanceMetrics
    price_data: list[OHLCV] = Field(default_factory=list, alias="priceData")
    execution_time: float = Field(alias="executionTime")
    yearly_independent: PeriodIndependentResult | None = Field(
        default=None, alias="yearlyIndependent"
    )

    model_config = {"populate_by_name": True}


class DateRangeResponse(BaseModel):
    """Response model for ticker date range."""

    min: str
    max: str


class ParamRange(BaseModel):
    """Parameter range for grid search."""

    min: float
    max: float
    step: float

    @field_validator("step")
    @classmethod
    def step_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("step must be greater than 0")
        return v

    @field_validator("max")
    @classmethod
    def max_must_be_gte_min(cls, v: float, info) -> float:
        if "min" in info.data and v < info.data["min"]:
            raise ValueError("max must be greater than or equal to min")
        return v


class GridSearchProgress(BaseModel):
    """Progress update for grid search SSE."""

    completed: int
    total: int
    percent: float


class GridSearchDone(BaseModel):
    """Final result when grid search completes."""

    total_time: float = Field(alias="totalTime")
    results_count: int = Field(alias="resultsCount")

    model_config = {"populate_by_name": True}


class YearlyResult(BaseModel):
    """Yearly backtest result."""

    year: int
    total_return: float = Field(alias="totalReturn")
    mdd: float

    model_config = {"populate_by_name": True}


class YearlyRankedResultItem(BaseModel):
    """Single result item with yearly composite score."""

    rank: int
    params: dict[str, float | int | str | bool]
    yearly_results: list[YearlyResult] = Field(alias="yearlyResults")
    avg_return: float = Field(alias="avgReturn")
    std_return: float = Field(default=0.0, alias="stdReturn")
    max_mdd: float = Field(alias="maxMdd")
    composite_score: float = Field(alias="compositeScore")
    total_trades: int = Field(default=0, alias="totalTrades")
    all_positive: bool = Field(default=False, alias="allPositive")

    model_config = {"populate_by_name": True}


class YearlyRankings(BaseModel):
    """Yearly-based ranking results (single ranking by composite score)."""

    results: list[YearlyRankedResultItem]

    model_config = {"populate_by_name": True}


class GridSearchCacheInfo(BaseModel):
    """Cache info for grid search."""

    cached_count: int = Field(alias="cachedCount")
    new_count: int = Field(alias="newCount")
    total_count: int = Field(alias="totalCount")

    model_config = {"populate_by_name": True}


class OptimizerRequest(BaseModel):
    """Request model for optimizer."""

    optimizer_id: str = Field(alias="optimizerId")
    optimizer_config: dict = Field(default_factory=dict, alias="optimizerConfig")
    strategy_id: str = Field(alias="strategyId")
    ticker_id: str = Field(alias="tickerId")
    param_ranges: dict[str, ParamRange] = Field(alias="paramRanges")
    select_params: dict[str, list[str]] = Field(default_factory=dict, alias="selectParams")
    initial_capital: float = Field(alias="initialCapital")
    top_n: int = Field(default=70, alias="topN")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")
    apply_fee: bool = Field(default=True, alias="applyFee")
    market: str = Field(default="us")

    model_config = {"populate_by_name": True}


class OptimizerStartResponse(BaseModel):
    """Response when optimizer starts."""

    job_id: str = Field(alias="jobId")

    model_config = {"populate_by_name": True}


class OptimizerCancelled(BaseModel):
    """Event when optimizer is cancelled."""

    job_id: str = Field(alias="jobId")
    completed: int
    total: int

    model_config = {"populate_by_name": True}


class CachedResultsResponse(BaseModel):
    """Response for cached optimizer results."""

    exists: bool
    results: list[YearlyRankedResultItem]
    total_count: int = Field(alias="totalCount")
    last_updated: int | None = Field(default=None, alias="lastUpdated")

    model_config = {"populate_by_name": True}
