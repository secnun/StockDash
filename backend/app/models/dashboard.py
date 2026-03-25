"""Pydantic models for dashboard API."""

from pydantic import BaseModel, Field


class MonthlyBreakdown(BaseModel):
    """월별 백테스트 결과."""

    month: str  # "2026-01", "2026-02", etc.
    total_return: float = Field(alias="totalReturn")
    mdd: float

    model_config = {"populate_by_name": True}


class HeatmapStrategyItem(BaseModel):
    """히트맵 전략 아이템."""

    strategy_id: str = Field(alias="strategyId")
    strategy_name: str = Field(alias="strategyName")
    representative_ticker: str = Field(alias="representativeTicker")
    alt_ticker: str = Field(alias="altTicker")
    ytd_return: float = Field(alias="ytdReturn")
    alt_ytd_return: float = Field(alias="altYtdReturn")
    current_seed: float = Field(alias="currentSeed")
    max_mdd: float = Field(alias="maxMdd")
    win_rate: float = Field(alias="winRate")
    total_trades: int = Field(alias="totalTrades")
    monthly_breakdown: list[MonthlyBreakdown] = Field(alias="monthlyBreakdown")

    model_config = {"populate_by_name": True}


class MarketIndicator(BaseModel):
    """시장 지표."""

    label: str
    value: str
    change: float | None = None  # 변동률 (있을 경우)

    model_config = {"populate_by_name": True}


class HeatmapResponse(BaseModel):
    """히트맵 응답."""

    generated_at: str = Field(alias="generatedAt")
    initial_capital: float = Field(alias="initialCapital")
    strategies: list[HeatmapStrategyItem]
    market_indicators: list[MarketIndicator] = Field(default_factory=list, alias="marketIndicators")

    model_config = {"populate_by_name": True}
