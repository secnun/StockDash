"""백테스트 서비스 — API에 의존하지 않는 순수 비즈니스 로직."""

from __future__ import annotations

import pandas as pd

from app.models.backtest import BacktestResponse, DateRangeResponse
from app.services.data_loader import (
    df_to_ohlcv,
    filter_by_date_range,
    find_data_file,
    load_csv_pandas,
    timestamp_to_date,
)
from app.services.exceptions import (
    BacktestExecutionError,
    DataNotFoundError,
    EmptyDataError,
    StrategyNotFoundError,
)
from app.strategies import StrategyRegistry
from app.strategies.utils import get_fee_rate_for_market


def get_date_range(ticker_id: str, market: str = "us") -> DateRangeResponse:
    """티커의 데이터 날짜 범위를 반환합니다."""
    data_path = find_data_file(ticker_id, market)
    if data_path is None or not data_path.exists():
        raise DataNotFoundError(ticker_id)

    try:
        df = load_csv_pandas(data_path)
    except Exception as e:
        raise BacktestExecutionError(f"데이터 로드 실패: {e}")

    if len(df) == 0:
        raise EmptyDataError("데이터 파일이 비어있습니다")

    min_date = timestamp_to_date(int(df["time"].iloc[0]))
    max_date = timestamp_to_date(int(df["time"].iloc[-1]))

    return DateRangeResponse(min=min_date, max=max_date)


def run_backtest(
    strategy_id: str,
    ticker_id: str,
    market: str,
    start_date: str | None,
    end_date: str | None,
    initial_capital: float,
    parameters: dict,
    apply_fee: bool,
) -> BacktestResponse:
    """백테스트를 실행하고 결과를 반환합니다."""
    # 전략 조회
    strategy = StrategyRegistry.get(strategy_id)
    if strategy is None:
        raise StrategyNotFoundError(strategy_id)

    # 데이터 로드
    data_path = find_data_file(ticker_id, market)
    if data_path is None or not data_path.exists():
        raise DataNotFoundError(ticker_id)

    try:
        df = load_csv_pandas(data_path)
    except Exception as e:
        raise BacktestExecutionError(f"데이터 로드 실패: {e}")

    # 날짜 필터
    df = filter_by_date_range(df, start_date, end_date)
    if len(df) == 0:
        raise EmptyDataError("지정한 기간에 데이터가 없습니다")

    # 가격 데이터
    price_data = df_to_ohlcv(df)

    # 전략 실행
    try:
        fee_rate = get_fee_rate_for_market(market)
        params = {**parameters, "applyFee": apply_fee, "feeRate": fee_rate}
        result = strategy.execute(data=df, params=params, initial_capital=initial_capital)
    except Exception as e:
        raise BacktestExecutionError(f"백테스트 실행 실패: {e}")

    result.price_data = price_data

    # 기간 독립 통계
    try:
        from app.services.yearly_backtest import run_period_independent

        yearly_independent = run_period_independent(strategy, df, initial_capital, params)
        result.yearly_independent = yearly_independent
    except Exception:
        pass  # 실패해도 메인 결과는 정상 반환

    return result
