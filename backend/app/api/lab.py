"""연구실 API — 비대칭 복리 계산 등 실험적 기능.

독립적 파일: 연구 종료 시 이 파일 + main.py 라우터 등록 1줄만 제거하면 됨.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.models.validators import PositiveCapitalValidator
from app.services.exceptions import (
    BacktestExecutionError,
    DataNotFoundError,
    EmptyDataError,
    InsufficientDataError,
    StrategyNotFoundError,
)
from app.services.lab_service import (
    analyze_strategy_recommendation,
    convert_strategy_params,
    get_asymmetric_supported_strategies,
    run_asymmetric_compound,
    run_radar_backtest,
)

router = APIRouter(prefix="/api/lab", tags=["lab"])


# ===== 비대칭 복리 계산 =====


class AsymmetricCompoundRequest(BaseModel, PositiveCapitalValidator):
    """비대칭 복리 백테스트 요청."""

    strategy_id: str = Field(alias="strategyId")
    ticker_id: str = Field(alias="tickerId")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")
    initial_capital: float = Field(alias="initialCapital")
    parameters: dict[str, float | int | str | bool]
    apply_fee: bool = Field(default=True, alias="applyFee")
    market: str = Field(default="us")
    profit_rate: float = Field(default=0.80, ge=0, le=1, alias="profitRate")
    loss_rate: float = Field(default=0.30, ge=0, le=1, alias="lossRate")
    renewal_mode: str = Field(default="fixed_period", alias="renewalMode")
    renewal_period: int = Field(default=10, ge=1, le=100, alias="renewalPeriod")

    model_config = {"populate_by_name": True}


@router.get("/asymmetric-compound/strategies")
async def get_supported_strategies() -> list[dict]:
    """비대칭 복리 지원 전략 목록."""
    return get_asymmetric_supported_strategies()


@router.post("/asymmetric-compound/run")
async def run_asymmetric_compound_endpoint(request: AsymmetricCompoundRequest) -> dict:
    """비대칭 복리 백테스트 실행 (적용 + 미적용 비교)."""
    try:
        return run_asymmetric_compound(
            strategy_id=request.strategy_id,
            ticker_id=request.ticker_id,
            market=request.market,
            start_date=request.start_date,
            end_date=request.end_date,
            initial_capital=request.initial_capital,
            parameters=request.parameters,
            apply_fee=request.apply_fee,
            profit_rate=request.profit_rate,
            loss_rate=request.loss_rate,
            renewal_mode=request.renewal_mode,
            renewal_period=request.renewal_period,
        )
    except StrategyNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except DataNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except EmptyDataError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except BacktestExecutionError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===== 떨사 Pro 추천 =====


class StrategyParamsOverride(BaseModel):
    """전략별 파라미터 오버라이드."""

    drop_percent: float | None = Field(default=None, alias="dropPercent")
    target_profit: float | None = Field(default=None, alias="targetProfit")
    stop_loss_days: int | None = Field(default=None, alias="stopLossDays")
    stop_loss_day_buy: str | None = Field(default=None, alias="stopLossDayBuy")

    model_config = {"populate_by_name": True}


class StrategyRecommendRequest(BaseModel):
    """전략 추천 요청."""

    target_date: str | None = Field(default=None, alias="targetDate")
    forward_days: int = Field(default=30, alias="forwardDays")
    top_n: int = Field(default=3, alias="topN")
    alpha: float = Field(default=-0.05)
    initial_capital: float = Field(default=10_000, alias="initialCapital")
    strategy_params: dict[str, StrategyParamsOverride] | None = Field(
        default=None, alias="strategyParams",
    )

    model_config = {"populate_by_name": True}


@router.post("/strategy-recommend/analyze")
async def analyze_strategy_recommendation_endpoint(
    request: StrategyRecommendRequest,
) -> dict:
    """현재 장세 분석 → 떨사 Pro 전략 추천."""
    custom_params = convert_strategy_params(request.strategy_params)
    try:
        return analyze_strategy_recommendation(
            target_date=request.target_date,
            forward_days=request.forward_days,
            top_n=request.top_n,
            alpha=request.alpha,
            initial_capital=request.initial_capital,
            custom_params=custom_params,
        )
    except DataNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InsufficientDataError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except BacktestExecutionError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===== 레이더 백테스트 =====


class RadarBacktestRequest(BaseModel):
    """레이더 백테스트 요청."""

    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")
    initial_capital: float = Field(default=10_000, alias="initialCapital")
    forward_days: int = Field(default=30, alias="forwardDays")
    top_n: int = Field(default=3, alias="topN")
    alpha: float = Field(default=-0.05)
    strategy_params: dict[str, StrategyParamsOverride] | None = Field(
        default=None, alias="strategyParams",
    )

    model_config = {"populate_by_name": True}


@router.post("/strategy-recommend/backtest")
async def run_radar_backtest_endpoint(
    request: RadarBacktestRequest,
) -> dict:
    """레이더 추천 기반 백테스트 실행."""
    custom_params = convert_strategy_params(request.strategy_params)
    try:
        return run_radar_backtest(
            start_date=request.start_date,
            end_date=request.end_date,
            initial_capital=request.initial_capital,
            forward_days=request.forward_days,
            top_n=request.top_n,
            alpha=request.alpha,
            custom_params=custom_params,
        )
    except DataNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InsufficientDataError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except BacktestExecutionError as e:
        raise HTTPException(status_code=500, detail=str(e))
