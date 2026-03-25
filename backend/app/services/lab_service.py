"""연구실 서비스 — 비대칭 복리, 전략 추천 비즈니스 로직."""

from __future__ import annotations

from app.services.asymmetric_engine import AsymmetricCompoundEngine, CompoundConfig
from app.services.data_loader import filter_by_date_range, find_data_file, load_csv_pandas
from app.services.exceptions import (
    BacktestExecutionError,
    DataNotFoundError,
    EmptyDataError,
    InsufficientDataError,
    StrategyNotFoundError,
)
from app.services.recommend_engine import recommend_strategy
from app.strategies import StrategyRegistry
from app.strategies.utils import get_fee_rate_for_market

_engine = AsymmetricCompoundEngine()


def get_asymmetric_supported_strategies() -> list[dict]:
    """비대칭 복리 지원 전략 목록."""
    supported = AsymmetricCompoundEngine.SUPPORTED_STRATEGIES
    result = []
    for sid in supported:
        strategy = StrategyRegistry.get(sid)
        if strategy:
            result.append({
                "id": strategy.id,
                "name": strategy.name,
                "description": strategy.description,
                "renewalMode": AsymmetricCompoundEngine.get_renewal_mode(sid),
                "parameters": [
                    {
                        "key": p.key,
                        "label": p.label,
                        "type": p.type,
                        "default": p.default,
                        "min": p.min,
                        "max": p.max,
                        "step": p.step,
                        "options": (
                            [{"label": o.label, "value": o.value} for o in p.options]
                            if p.options
                            else None
                        ),
                    }
                    for p in strategy.parameters
                ],
            })
    return result


def run_asymmetric_compound(
    strategy_id: str,
    ticker_id: str,
    market: str,
    start_date: str | None,
    end_date: str | None,
    initial_capital: float,
    parameters: dict,
    apply_fee: bool,
    profit_rate: float,
    loss_rate: float,
    renewal_mode: str,
    renewal_period: int,
) -> dict:
    """비대칭 복리 백테스트 실행 (적용 + 미적용 비교)."""
    if strategy_id not in AsymmetricCompoundEngine.SUPPORTED_STRATEGIES:
        raise StrategyNotFoundError(strategy_id)

    # 데이터 로드
    data_path = find_data_file(ticker_id, market)
    if data_path is None or not data_path.exists():
        raise DataNotFoundError(ticker_id)

    try:
        df = load_csv_pandas(data_path)
    except Exception as e:
        raise BacktestExecutionError(f"데이터 로드 실패: {e}")

    df = filter_by_date_range(df, start_date, end_date)
    if len(df) == 0:
        raise EmptyDataError("지정한 기간에 데이터가 없습니다")

    fee_rate = get_fee_rate_for_market(market)
    params = {**parameters, "applyFee": apply_fee, "feeRate": fee_rate}

    compound_config = CompoundConfig(
        profit_rate=profit_rate,
        loss_rate=loss_rate,
        renewal_mode=renewal_mode,
        renewal_period=renewal_period,
    )

    # 1. 비대칭 복리 적용
    try:
        compound_result = _engine.run(
            strategy_id=strategy_id,
            data=df,
            params=params,
            initial_capital=initial_capital,
            compound_config=compound_config,
            market=market,
        )
    except Exception as e:
        raise BacktestExecutionError(f"비대칭 복리 백테스트 실패: {e}")

    # 2. 기존 전략 (미적용 baseline)
    try:
        strategy = StrategyRegistry.get(strategy_id)
        if strategy is None:
            raise StrategyNotFoundError(strategy_id)
        baseline_response = strategy.execute(df, params, initial_capital)
        baseline = {
            "trades": [
                {
                    "time": t.time,
                    "type": t.type,
                    "price": t.price,
                    "quantity": t.quantity,
                    "value": t.value,
                    "costBasis": t.cost_basis,
                    "tier": t.tier,
                    "tierSlots": t.tier_slots,
                }
                for t in baseline_response.trades
            ],
            "equity": [
                {"time": e.time, "value": e.value} for e in baseline_response.equity
            ],
            "metrics": {
                "totalReturn": baseline_response.metrics.total_return,
                "cagr": baseline_response.metrics.cagr,
                "mdd": baseline_response.metrics.mdd,
                "winRate": baseline_response.metrics.win_rate,
                "sharpeRatio": baseline_response.metrics.sharpe_ratio,
                "totalTrades": baseline_response.metrics.total_trades,
            },
            "executionTime": baseline_response.execution_time,
        }
    except StrategyNotFoundError:
        raise
    except Exception as e:
        raise BacktestExecutionError(f"기본 백테스트 실패: {e}")

    return {
        "compound": {
            "trades": compound_result.trades,
            "equity": compound_result.equity,
            "cash": compound_result.cash,
            "metrics": compound_result.metrics,
            "renewalEvents": compound_result.renewal_events,
            "executionTime": compound_result.execution_time,
        },
        "baseline": baseline,
        "compoundConfig": {
            "profitRate": profit_rate,
            "lossRate": loss_rate,
            "renewalMode": AsymmetricCompoundEngine.get_renewal_mode(strategy_id),
            "renewalPeriod": renewal_period,
        },
    }


def convert_strategy_params(strategy_params: dict | None) -> dict | None:
    """프론트엔드 파라미터 오버라이드를 백엔드 형식으로 변환."""
    if not strategy_params:
        return None

    custom_params = {}
    for sid, override in strategy_params.items():
        p = {}
        if hasattr(override, "drop_percent") and override.drop_percent is not None:
            p["dropPercent"] = override.drop_percent
        if hasattr(override, "target_profit") and override.target_profit is not None:
            p["targetProfit"] = override.target_profit
        if hasattr(override, "stop_loss_days") and override.stop_loss_days is not None:
            p["stopLossDays"] = override.stop_loss_days
        if hasattr(override, "stop_loss_day_buy") and override.stop_loss_day_buy is not None:
            p["stopLossDayBuy"] = override.stop_loss_day_buy
        if p:
            custom_params[sid] = p

    return custom_params if custom_params else None


def analyze_strategy_recommendation(
    target_date: str | None,
    forward_days: int,
    top_n: int,
    alpha: float,
    initial_capital: float,
    custom_params: dict | None,
) -> dict:
    """현재 장세 분석 → 떨사 Pro 전략 추천."""
    data_path = find_data_file("SOXL", "us")
    if data_path is None or not data_path.exists():
        raise DataNotFoundError("SOXL")

    try:
        df = load_csv_pandas(data_path)
    except Exception as e:
        raise BacktestExecutionError(f"데이터 로드 실패: {e}")

    if len(df) < 120:
        raise InsufficientDataError("분석에 필요한 데이터가 부족합니다 (최소 120일)")

    try:
        return recommend_strategy(
            df=df,
            target_date=target_date,
            forward_days=forward_days,
            top_n=top_n,
            alpha=alpha,
            initial_capital=initial_capital,
            market="us",
            custom_params=custom_params,
        )
    except Exception as e:
        raise BacktestExecutionError(f"분석 실패: {e}")


def run_radar_backtest(
    start_date: str | None,
    end_date: str | None,
    initial_capital: float,
    forward_days: int,
    top_n: int,
    alpha: float,
    custom_params: dict | None,
) -> dict:
    """레이더 추천 기반 백테스트 실행."""
    from app.services.recommend_engine import run_radar_backtest as _run_radar

    data_path = find_data_file("SOXL", "us")
    if data_path is None or not data_path.exists():
        raise DataNotFoundError("SOXL")

    try:
        df = load_csv_pandas(data_path)
    except Exception as e:
        raise BacktestExecutionError(f"데이터 로드 실패: {e}")

    if len(df) < 120:
        raise InsufficientDataError("분석에 필요한 데이터가 부족합니다 (최소 120일)")

    try:
        return _run_radar(
            df=df,
            start_date=start_date,
            end_date=end_date,
            initial_capital=initial_capital,
            forward_days=forward_days,
            top_n=top_n,
            market="us",
            custom_params=custom_params,
        )
    except Exception as e:
        raise BacktestExecutionError(f"레이더 백테스트 실패: {e}")
