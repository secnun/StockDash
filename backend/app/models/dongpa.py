"""Pydantic models for 동파법 (Dongpa) backtest API.

QQQ 주봉 기반 안전/공세 모드 전환으로 SOXL을 매매하는 전략.
"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models.validators import PositiveCapitalValidator


class DongpaModeRule(BaseModel):
    """모드 전환 규칙 (QQQ 주봉 기반)."""

    indicator: str  # 'qqq_ma_cross', 'qqq_trend_deviation', 'qqq_weekly_roc', 'qqq_ma_slope'
    operator: Literal["gt", "gte", "lt", "lte", "eq", "neq"]
    value: float | str

    model_config = {"populate_by_name": True}


class DongpaMode(BaseModel):
    """안전/공세 모드 정의."""

    mode_id: str = Field(alias="modeId")  # 'safe', 'aggressive'
    name: str  # '안전', '공세'
    strategy_id: str = Field(alias="strategyId")
    parameters: dict[str, float | int | str | bool]

    model_config = {"populate_by_name": True}


class DongpaTrigger(BaseModel):
    """모드 전환 트리거."""

    id: str
    name: str
    conditions: list[DongpaModeRule]
    logic: Literal["and", "or"] = "and"
    target_mode_id: str = Field(alias="targetModeId")
    priority: int = 0

    model_config = {"populate_by_name": True}


class DongpaConfig(BaseModel):
    """동파법 설정."""

    modes: list[DongpaMode]
    triggers: list[DongpaTrigger]
    default_mode_id: str = Field(default="safe", alias="defaultModeId")
    qqq_ma_period: int = Field(default=10, ge=2, le=52, alias="qqqMaPeriod")  # QQQ 주봉 MA 기간
    position_handling: Literal["carry", "liquidate"] = Field(
        default="carry", alias="positionHandling"
    )

    model_config = {"populate_by_name": True}


class DongpaModeEvent(BaseModel):
    """모드 전환 이벤트."""

    time: int
    day_index: int = Field(alias="dayIndex")
    from_mode_id: str = Field(alias="fromModeId")
    to_mode_id: str = Field(alias="toModeId")
    trigger_id: str = Field(alias="triggerId")
    trigger_name: str = Field(alias="triggerName")
    qqq_indicators: dict[str, float | str | None] = Field(alias="qqqIndicators")
    portfolio_value: float = Field(alias="portfolioValue")
    open_tiers: int = Field(alias="openTiers")

    model_config = {"populate_by_name": True}


class DongpaSegmentResult(BaseModel):
    """모드 구간별 성과."""

    mode_id: str = Field(alias="modeId")
    mode_name: str = Field(alias="modeName")
    strategy_id: str = Field(alias="strategyId")
    start_time: int = Field(alias="startTime")
    end_time: int = Field(alias="endTime")
    start_value: float = Field(alias="startValue")
    end_value: float = Field(alias="endValue")
    segment_return: float = Field(alias="segmentReturn")
    segment_mdd: float = Field(alias="segmentMdd")
    trade_count: int = Field(alias="tradeCount")
    candle_count: int = Field(alias="candleCount")

    model_config = {"populate_by_name": True}


class DongpaBacktestRequest(BaseModel, PositiveCapitalValidator):
    """동파법 백테스트 요청."""

    ticker_id: str = Field(default="SOXL", alias="tickerId")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")
    initial_capital: float = Field(alias="initialCapital")
    apply_fee: bool = Field(default=True, alias="applyFee")
    market: str = Field(default="us")
    dongpa_config: DongpaConfig = Field(alias="dongpaConfig")

    model_config = {"populate_by_name": True}


class DongpaBacktestResponse(BaseModel):
    """동파법 백테스트 응답."""

    trades: list  # Trade objects
    equity: list  # EquityPoint objects
    cash: list  # EquityPoint objects
    metrics: dict  # PerformanceMetrics
    price_data: list = Field(default_factory=list, alias="priceData")
    execution_time: float = Field(alias="executionTime")
    mode_events: list[DongpaModeEvent] = Field(alias="modeEvents")
    segments: list[DongpaSegmentResult]
    active_mode_timeline: list[dict] = Field(alias="activeModeTimeline")
    qqq_weekly_data: list[dict] = Field(default_factory=list, alias="qqqWeeklyData")

    model_config = {"populate_by_name": True}


# --- 동파법 옵티마이저 모델 ---


class DongpaConditionRange(BaseModel):
    """조건별 값 범위 (옵티마이저용)."""

    trigger_index: int = Field(alias="triggerIndex")
    condition_index: int = Field(alias="conditionIndex")
    indicator: str
    operator: str
    min_value: float | None = Field(default=None, alias="minValue")
    max_value: float | None = Field(default=None, alias="maxValue")
    step: float | None = None

    model_config = {"populate_by_name": True}


class DongpaParameterRange(BaseModel):
    """단일 파라미터 범위."""

    min: float
    max: float
    step: float

    model_config = {"populate_by_name": True}


class DongpaModeParameterRange(BaseModel):
    """모드별 전략 파라미터 범위."""

    mode_id: str = Field(alias="modeId")
    drop_percent: DongpaParameterRange | None = Field(default=None, alias="dropPercent")
    target_profit: DongpaParameterRange | None = Field(default=None, alias="targetProfit")
    stop_loss_days: DongpaParameterRange | None = Field(default=None, alias="stopLossDays")

    model_config = {"populate_by_name": True}


class DongpaOptimizerRequest(BaseModel, PositiveCapitalValidator):
    """동파법 옵티마이저 요청."""

    ticker_id: str = Field(default="SOXL", alias="tickerId")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")
    initial_capital: float = Field(alias="initialCapital")
    apply_fee: bool = Field(default=True, alias="applyFee")
    market: str = Field(default="us")
    dongpa_config: DongpaConfig = Field(alias="dongpaConfig")
    condition_ranges: list[DongpaConditionRange] = Field(alias="conditionRanges")
    top_n: int = Field(default=50, alias="topN")
    algorithm: Literal["grid_search", "monte_carlo"] = Field(default="grid_search")
    mode_parameter_ranges: list[DongpaModeParameterRange] | None = Field(
        default=None, alias="modeParameterRanges"
    )

    model_config = {"populate_by_name": True}


class DongpaOptimizerResultItem(BaseModel):
    """동파법 옵티마이저 결과 항목."""

    rank: int
    condition_values: list[dict] = Field(alias="conditionValues")
    total_return: float = Field(alias="totalReturn")
    cagr: float
    mdd: float
    sharpe_ratio: float = Field(alias="sharpeRatio")
    win_rate: float = Field(alias="winRate")
    total_trades: int = Field(alias="totalTrades")
    switch_count: int = Field(alias="switchCount")
    composite_score: float = Field(alias="compositeScore")

    model_config = {"populate_by_name": True}
