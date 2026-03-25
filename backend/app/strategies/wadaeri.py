"""
위대리 v1.0 (WEV10) 전략

QQQ 장기 지수 추세선 기반 TQQQ 주간 리밸런싱 전략.
- 매주 금요일 종가 기준 매매
- TQQQ 평가금 변동분의 매수율/매도율만큼 반대 매매
- QQQ 추세선 대비 이탈률로 구간별 매매율 조정
"""

import time as time_module
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.models.backtest import BacktestResponse, Trade
from app.models.strategy import ParameterDefinition
from app.services.qqq_data import load_qqq_weekly, calc_exponential_trendline
from app.strategies.base import TieredStrategy, StrategyRegistry
from app.strategies.utils import (
    get_fee_rate_for_market,
    record_equity,
    DEFAULT_FEE_RATE,
)


class WadaeriStrategy(TieredStrategy):
    """위대리 v1.0: QQQ 추세선 기반 TQQQ 주간 리밸런싱"""

    @property
    def id(self) -> str:
        return "wadaeri_v1"

    @property
    def name(self) -> str:
        return "위대리 v1.0"

    @property
    def description(self) -> str:
        return "QQQ 장기 추세선 기반 TQQQ 주간 리밸런싱 (Vol. Drag 방어)"

    @property
    def parameters(self) -> list[ParameterDefinition]:
        return [
            # 고평가 구간 매매율
            ParameterDefinition(
                key="sellRateHigh",
                label="고평가 매도율 (%)",
                type="number",
                default=100,
                min=0,
                max=100,
                step=0.1,
            ),
            ParameterDefinition(
                key="buyRateHigh",
                label="고평가 매수율 (%)",
                type="number",
                default=50,
                min=0,
                max=100,
                step=0.1,
            ),
            # 중립 구간 매매율
            ParameterDefinition(
                key="sellRateNeutral",
                label="중립 매도율 (%)",
                type="number",
                default=50,
                min=0,
                max=100,
                step=0.1,
            ),
            ParameterDefinition(
                key="buyRateNeutral",
                label="중립 매수율 (%)",
                type="number",
                default=50,
                min=0,
                max=100,
                step=0.1,
            ),
            # 저평가 구간 매매율
            ParameterDefinition(
                key="sellRateLow",
                label="저평가 매도율 (%)",
                type="number",
                default=33.3,
                min=0,
                max=100,
                step=0.1,
            ),
            ParameterDefinition(
                key="buyRateLow",
                label="저평가 매수율 (%)",
                type="number",
                default=100,
                min=0,
                max=100,
                step=0.1,
            ),
            # 추세선 파라미터
            ParameterDefinition(
                key="trendPeriod",
                label="추세선 주기 (주)",
                type="number",
                default=260,
                min=100,
                max=520,
                step=10,
            ),
            ParameterDefinition(
                key="bandUpper",
                label="밴드 상한 (%)",
                type="number",
                default=5,
                min=0,
                max=30,
                step=0.5,
            ),
            ParameterDefinition(
                key="bandLower",
                label="밴드 하한 (%)",
                type="number",
                default=6,
                min=0,
                max=30,
                step=0.5,
            ),
        ]

    def execute(
        self,
        data: pd.DataFrame,
        params: dict[str, Any],
        initial_capital: float,
    ) -> BacktestResponse:
        start_time = time_module.perf_counter()

        # ── 파라미터 추출 ──
        sell_rate_high = float(params.get("sellRateHigh", 100)) / 100
        buy_rate_high = float(params.get("buyRateHigh", 50)) / 100
        sell_rate_neutral = float(params.get("sellRateNeutral", 50)) / 100
        buy_rate_neutral = float(params.get("buyRateNeutral", 50)) / 100
        sell_rate_low = float(params.get("sellRateLow", 33.3)) / 100
        buy_rate_low = float(params.get("buyRateLow", 100)) / 100
        trend_period = int(params.get("trendPeriod", 260))
        band_upper = float(params.get("bandUpper", 5))
        band_lower = float(params.get("bandLower", 6))
        fee_rate = float(params.get("feeRate", DEFAULT_FEE_RATE))
        apply_fee = bool(params.get("applyFee", True))

        # ── QQQ 주봉 데이터 로드 ──
        qqq_df = load_qqq_weekly()
        qqq_dates = qqq_df["date"].values
        qqq_closes = qqq_df["close"].values.astype(np.float64)

        # ── TQQQ 일봉에서 금요일만 필터링 ──
        times = data["time"].values
        closes = data["close"].values.astype(np.float64)

        friday_indices = []
        for i in range(len(times)):
            dt = datetime.fromtimestamp(int(times[i]), tz=timezone.utc)
            if dt.weekday() == 4:  # 금요일
                friday_indices.append(i)

        if len(friday_indices) == 0:
            # 금요일이 없으면 빈 결과 반환
            return self._build_response([], [], initial_capital, start_time, [])

        # ── 상태 초기화 ──
        cash = initial_capital
        position = 0  # TQQQ 보유 수량
        avg_cost = 0.0
        trades: list[Trade] = []
        equity: list[dict[str, float]] = []
        cash_history: list[dict[str, float]] = []

        prev_valuation = 0.0  # 지난주 TQQQ 평가금
        is_first_week = True

        # ── 매 금요일 루프 ──
        for fi in friday_indices:
            candle_time = int(times[fi])
            price = float(closes[fi])
            date_str = datetime.fromtimestamp(candle_time, tz=timezone.utc).strftime("%Y-%m-%d")

            current_valuation = position * price

            if is_first_week:
                # 첫 주: 시드의 50% TQQQ 매수
                buy_budget = initial_capital * 0.5
                quantity = self._calc_buy_qty(buy_budget, price, fee_rate, apply_fee)
                if quantity > 0:
                    cost = quantity * price
                    total_cost = cost * (1 + fee_rate) if apply_fee else cost
                    cash -= total_cost
                    avg_cost = price
                    position = quantity
                    trades.append(Trade(
                        time=candle_time, type="buy", price=price,
                        quantity=quantity, value=total_cost,
                    ))

                prev_valuation = position * price
                is_first_week = False

            else:
                # 평가금 변동 계산
                change = current_valuation - prev_valuation

                # QQQ 추세선 기반 구간 판단
                buy_rate, sell_rate = self._get_rates_for_date(
                    qqq_dates, qqq_closes, date_str, trend_period,
                    band_upper, band_lower,
                    sell_rate_high, buy_rate_high,
                    sell_rate_neutral, buy_rate_neutral,
                    sell_rate_low, buy_rate_low,
                )

                if change < 0:
                    # 하락 → 매수
                    buy_amount = abs(change) * buy_rate
                    buy_amount = min(buy_amount, cash)
                    quantity = self._calc_buy_qty(buy_amount, price, fee_rate, apply_fee)
                    if quantity > 0:
                        cost = quantity * price
                        total_cost = cost * (1 + fee_rate) if apply_fee else cost
                        if total_cost <= cash:
                            new_total_qty = position + quantity
                            avg_cost = (avg_cost * position + price * quantity) / new_total_qty if new_total_qty > 0 else 0.0
                            cash -= total_cost
                            position = new_total_qty
                            trades.append(Trade(
                                time=candle_time, type="buy", price=price,
                                quantity=quantity, value=total_cost,
                            ))

                elif change > 0:
                    # 상승 → 매도
                    sell_amount = change * sell_rate
                    sell_qty = int(sell_amount / price) if price > 0 else 0
                    sell_qty = min(sell_qty, position)
                    if sell_qty > 0:
                        gross_value = sell_qty * price
                        net_value = gross_value * (1 - fee_rate) if apply_fee else gross_value
                        cash += net_value
                        position -= sell_qty
                        trades.append(Trade(
                            time=candle_time, type="sell", price=price,
                            quantity=sell_qty, value=net_value,
                            cost_basis=avg_cost,
                        ))
                        if position == 0:
                            avg_cost = 0.0

                prev_valuation = position * price

            # 에쿼티 기록
            portfolio_value = record_equity(equity, cash_history, candle_time, cash, position, price)

        # ── 일봉 에쿼티 보간 (금요일 사이 일봉도 에쿼티 기록) ──
        # 금요일만 기록하면 차트가 듬성듬성해지므로 전체 일봉 에쿼티 생성
        full_equity: list[dict[str, float]] = []
        full_cash: list[dict[str, float]] = []
        for i in range(len(times)):
            t = int(times[i])
            p = float(closes[i])
            full_equity.append({"time": t, "value": cash + position * p})
            full_cash.append({"time": t, "value": cash})

        # 정확한 에쿼티를 위해 금요일 기준 상태로 일봉 재계산
        full_equity, full_cash = self._interpolate_daily_equity(
            times, closes, friday_indices, trades, initial_capital,
            fee_rate, apply_fee,
        )

        return self._build_response(
            trades, full_equity, initial_capital, start_time, full_cash,
        )

    @staticmethod
    def _calc_buy_qty(budget: float, price: float, fee_rate: float, apply_fee: bool) -> int:
        """예산으로 매수 가능한 정수 수량."""
        if price <= 0 or budget <= 0:
            return 0
        effective_price = price * (1 + fee_rate) if apply_fee else price
        return int(budget / effective_price)

    @staticmethod
    def _get_rates_for_date(
        qqq_dates: np.ndarray,
        qqq_closes: np.ndarray,
        target_date: str,
        trend_period: int,
        band_upper: float,
        band_lower: float,
        sell_rate_high: float,
        buy_rate_high: float,
        sell_rate_neutral: float,
        buy_rate_neutral: float,
        sell_rate_low: float,
        buy_rate_low: float,
    ) -> tuple[float, float]:
        """
        특정 날짜의 QQQ 추세선 이탈률을 계산하고 매수율/매도율 반환.

        Returns:
            (buy_rate, sell_rate)
        """
        # target_date 이전의 QQQ 데이터만 사용
        mask = qqq_dates <= target_date
        subset_closes = qqq_closes[mask]

        if len(subset_closes) < 10:
            # 데이터 부족 → 중립
            return buy_rate_neutral, sell_rate_neutral

        trend_value = calc_exponential_trendline(subset_closes, trend_period)
        if trend_value <= 0:
            return buy_rate_neutral, sell_rate_neutral

        actual = float(subset_closes[-1])
        deviation = ((actual - trend_value) / trend_value) * 100

        if deviation > band_upper:
            return buy_rate_high, sell_rate_high
        elif deviation < -band_lower:
            return buy_rate_low, sell_rate_low
        else:
            return buy_rate_neutral, sell_rate_neutral

    @staticmethod
    def _interpolate_daily_equity(
        times: np.ndarray,
        closes: np.ndarray,
        friday_indices: list[int],
        trades: list[Trade],
        initial_capital: float,
        fee_rate: float,
        apply_fee: bool,
    ) -> tuple[list[dict[str, float]], list[dict[str, float]]]:
        """
        거래 기록을 기반으로 전체 일봉 에쿼티/캐시 히스토리 재구성.
        금요일에만 거래가 발생하지만, 매일의 포트폴리오 가치를 계산.
        """
        equity: list[dict[str, float]] = []
        cash_hist: list[dict[str, float]] = []

        # 거래를 시간순으로 인덱싱
        trade_map: dict[int, list[Trade]] = {}
        for t in trades:
            trade_map.setdefault(t.time, []).append(t)

        cash = initial_capital
        position = 0

        for i in range(len(times)):
            candle_time = int(times[i])

            # 이 시점에 거래가 있으면 실행
            if candle_time in trade_map:
                for trade in trade_map[candle_time]:
                    if trade.type == "buy":
                        position += int(trade.quantity)
                        cash -= trade.value
                    elif trade.type == "sell":
                        position -= int(trade.quantity)
                        cash += trade.value

            price = float(closes[i])
            portfolio_value = cash + position * price
            equity.append({"time": candle_time, "value": portfolio_value})
            cash_hist.append({"time": candle_time, "value": cash})

        return equity, cash_hist


# Register strategy
wadaeri_v1_strategy = WadaeriStrategy()
StrategyRegistry.register(wadaeri_v1_strategy)
