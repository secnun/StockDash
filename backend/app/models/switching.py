"""Pydantic models for switching backtest API."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class IndicatorCondition(BaseModel):
    """단일 지표 조건."""

    indicator: str  # 'alignment', 'deviation', 'rsi', 'slope', 'roc', 'atr'
    operator: Literal["eq", "neq", "gt", "gte", "lt", "lte"]
    value: float | str  # float (수치) or str ('정배열', '역배열')

    model_config = {"populate_by_name": True}


class SwitchingTrigger(BaseModel):
    """스위칭 트리거 (여러 조건 + 대상 슬롯)."""

    id: str
    name: str
    conditions: list[IndicatorCondition]
    logic: Literal["and", "or"] = "and"
    strategy_slot_id: str = Field(alias="strategySlotId")
    priority: int = 0

    model_config = {"populate_by_name": True}


class StrategySlot(BaseModel):
    """전략 프리셋 슬롯."""

    slot_id: str = Field(alias="slotId")
    name: str  # '공격형', '보수형'
    strategy_id: str = Field(alias="strategyId")
    parameters: dict[str, float | int | str | bool]

    model_config = {"populate_by_name": True}


class SwitchingConfig(BaseModel):
    """스위칭 백테스트 설정."""

    strategy_slots: list[StrategySlot] = Field(alias="strategySlots")
    rules: list[SwitchingTrigger]
    default_slot_id: str = Field(alias="defaultSlotId")
    cooldown_days: int = Field(default=1, ge=1, alias="cooldownDays")
    position_handling: Literal["carry", "liquidate"] = Field(
        default="carry", alias="positionHandling"
    )

    model_config = {"populate_by_name": True}

    @field_validator("strategy_slots")
    @classmethod
    def validate_slot_count(cls, v: list[StrategySlot]) -> list[StrategySlot]:
        if len(v) < 2:
            raise ValueError("최소 2개의 전략 슬롯이 필요합니다")
        if len(v) > 4:
            raise ValueError("최대 4개의 전략 슬롯만 지원합니다")
        return v


class SwitchingBacktestRequest(BaseModel):
    """스위칭 백테스트 요청."""

    ticker_id: str = Field(alias="tickerId")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")
    initial_capital: float = Field(alias="initialCapital")
    apply_fee: bool = Field(default=True, alias="applyFee")
    market: str = Field(default="us")
    switching_config: SwitchingConfig = Field(alias="switchingConfig")

    model_config = {"populate_by_name": True}

    @field_validator("initial_capital")
    @classmethod
    def initial_capital_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("initial_capital must be greater than 0")
        return v


class SwitchingEvent(BaseModel):
    """스위칭 이벤트 기록."""

    time: int
    day_index: int = Field(alias="dayIndex")
    from_slot_id: str = Field(alias="fromSlotId")
    to_slot_id: str = Field(alias="toSlotId")
    trigger_id: str = Field(alias="triggerId")
    trigger_name: str = Field(alias="triggerName")
    indicators: dict[str, float | str | None]
    portfolio_value: float = Field(alias="portfolioValue")
    open_tiers: int = Field(alias="openTiers")
    event_type: Literal["switch", "revert"] = Field(
        default="switch", alias="eventType"
    )

    model_config = {"populate_by_name": True}


class SegmentResult(BaseModel):
    """전략 구간별 성과."""

    slot_id: str = Field(alias="slotId")
    slot_name: str = Field(alias="slotName")
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


class SwitchingBacktestResponse(BaseModel):
    """스위칭 백테스트 응답."""

    trades: list  # Trade objects
    equity: list  # EquityPoint objects
    cash: list  # EquityPoint objects
    metrics: dict  # PerformanceMetrics
    price_data: list = Field(default_factory=list, alias="priceData")
    execution_time: float = Field(alias="executionTime")
    switching_events: list[SwitchingEvent] = Field(alias="switchingEvents")
    segments: list[SegmentResult]
    active_strategy_timeline: list[dict] = Field(alias="activeStrategyTimeline")

    model_config = {"populate_by_name": True}


# --- Switching Optimizer Models ---


class ConditionValueRange(BaseModel):
    """조건별 값 범위 (옵티마이저용)."""

    rule_index: int = Field(alias="ruleIndex")
    condition_index: int = Field(alias="conditionIndex")
    indicator: str
    operator: str
    # numeric range
    min_value: float | None = Field(default=None, alias="minValue")
    max_value: float | None = Field(default=None, alias="maxValue")
    step: float | None = None
    # string discrete values
    string_values: list[str] | None = Field(default=None, alias="stringValues")

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def validate_range(self) -> "ConditionValueRange":
        has_numeric = self.min_value is not None and self.max_value is not None and self.step is not None
        has_string = self.string_values is not None and len(self.string_values) > 0
        if not has_numeric and not has_string:
            raise ValueError("numeric 범위(minValue/maxValue/step) 또는 stringValues 중 하나를 지정해야 합니다")
        return self


class CooldownRange(BaseModel):
    """쿨다운 일수 범위."""

    min_value: int = Field(alias="minValue")
    max_value: int = Field(alias="maxValue")
    step: int = 1

    model_config = {"populate_by_name": True}


class ParameterRange(BaseModel):
    """단일 파라미터 범위."""

    min: float = Field(alias="min")
    max: float = Field(alias="max")
    step: float = Field(alias="step")

    model_config = {"populate_by_name": True}


class SlotParameterRange(BaseModel):
    """슬롯별 전략 파라미터 범위 (Tier 2)."""

    slot_id: str = Field(alias="slotId")
    drop_percent: ParameterRange | None = Field(default=None, alias="dropPercent")
    target_profit: ParameterRange | None = Field(default=None, alias="targetProfit")
    stop_loss_days: ParameterRange | None = Field(default=None, alias="stopLossDays")

    model_config = {"populate_by_name": True}


class SwitchingOptimizerRequest(BaseModel):
    """스위칭 트리거 옵티마이저 요청."""

    ticker_id: str = Field(alias="tickerId")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")
    initial_capital: float = Field(alias="initialCapital")
    apply_fee: bool = Field(default=True, alias="applyFee")
    market: str = Field(default="us")
    switching_config: SwitchingConfig = Field(alias="switchingConfig")
    condition_ranges: list[ConditionValueRange] = Field(alias="conditionRanges")
    cooldown_range: CooldownRange | None = Field(default=None, alias="cooldownRange")
    top_n: int = Field(default=50, alias="topN")
    algorithm: Literal["grid_search", "monte_carlo", "two_stage"] = Field(
        default="grid_search"
    )
    slot_parameter_ranges: list[SlotParameterRange] | None = Field(
        default=None, alias="slotParameterRanges"
    )

    model_config = {"populate_by_name": True}

    @field_validator("initial_capital")
    @classmethod
    def initial_capital_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("initial_capital must be greater than 0")
        return v


class SwitchingOptimizerResultItem(BaseModel):
    """스위칭 옵티마이저 결과 항목."""

    rank: int
    condition_values: list[dict] = Field(alias="conditionValues")
    cooldown_days: int = Field(alias="cooldownDays")
    total_return: float = Field(alias="totalReturn")
    cagr: float
    mdd: float
    sharpe_ratio: float = Field(alias="sharpeRatio")
    win_rate: float = Field(alias="winRate")
    total_trades: int = Field(alias="totalTrades")
    switch_count: int = Field(alias="switchCount")
    composite_score: float = Field(alias="compositeScore")

    model_config = {"populate_by_name": True}
