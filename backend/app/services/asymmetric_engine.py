"""비대칭 복리 백테스트 엔진.

기존 전략 코드를 수정하지 않는 독립 엔진.
- ddeolsapro 계열: DdeolsaproBase.step_candle() 외부 호출
- jongjong5, moomae21, wadaeri: 로직 자체 내장 + 비대칭 복리 삽입

삭제 시 이 파일만 제거하면 됨 (기존 코드 영향 없음).
"""

from __future__ import annotations

import math
import time as time_module
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

import numpy as np
import pandas as pd

from app.models.backtest import PerformanceMetrics, Trade
from app.services.metrics import calculate_metrics
from app.strategies.base import TierPosition
from app.strategies.ddeolsapro_base import DdeolsaproBase, TieredStrategyState
from app.strategies.utils import (
    DEFAULT_FEE_RATE,
    apply_buy_fee,
    apply_sell_fee,
    calc_buy_quantity,
    calc_portfolio_value,
    create_buy_trade,
    create_sell_trade,
    execute_buy_core,
    execute_sell_core,
    get_fee_rate_for_market,
)


# ========== 비대칭 복리 설정 ==========


@dataclass
class CompoundConfig:
    """비대칭 복리 설정."""

    profit_rate: float = 0.80  # 이익 반영률
    loss_rate: float = 0.30  # 손실 반영률
    renewal_mode: str = "fixed_period"  # 'no_position', 'fixed_period', 'hybrid'
    renewal_period: int = 10  # 갱신 주기 (거래일)


@dataclass
class RenewalEvent:
    """투자금 갱신 이벤트."""

    time: int
    day_index: int
    rp_delta: float  # 구간 실현 손익
    rate: float  # 적용된 비율
    prev_capital: float
    new_capital: float
    surplus: float  # 잉여현금 (이익 시 빼낼 수 있는 돈, 양수)
    injection: float  # 충전필요 (손실 시 넣어야 하는 돈, 양수)


# ========== 비대칭 복리 추적기 ==========


@dataclass
class CompoundTracker:
    """비대칭 복리 상태 추적 (전략 독립적)."""

    config: CompoundConfig
    realized_pnl: float = 0.0
    prev_renewal_rp: float = 0.0
    prev_capital: float = 0.0
    capital: float = 0.0
    days_since_renewal: int = 0
    first_trade_done: bool = False
    events: list[RenewalEvent] = field(default_factory=list)

    def init(self, initial_capital: float) -> None:
        self.capital = initial_capital
        self.prev_capital = initial_capital

    def add_realized_pnl(self, pnl: float) -> None:
        """실현 손익 누적."""
        self.realized_pnl += pnl
        if not self.first_trade_done:
            self.first_trade_done = True

    def check_renewal(
        self,
        day_index: int,
        candle_time: int,
        has_open_position: bool,
    ) -> float | None:
        """갱신 조건 확인. 갱신 시 새 capital 반환, 아니면 None."""
        if not self.first_trade_done:
            return None

        self.days_since_renewal += 1
        do_renewal = False
        mode = self.config.renewal_mode

        if mode == "no_position":
            do_renewal = not has_open_position
        elif mode == "fixed_period":
            do_renewal = self.days_since_renewal >= self.config.renewal_period
        elif mode == "hybrid":
            do_renewal = (
                not has_open_position
                or self.days_since_renewal >= self.config.renewal_period
            )

        if not do_renewal:
            return None

        rp_delta = self.realized_pnl - self.prev_renewal_rp

        # 실현 손익 변동이 없으면 갱신 불필요
        if abs(rp_delta) < 0.01:
            return None

        rate = self.config.profit_rate if rp_delta >= 0 else self.config.loss_rate
        new_capital = self.prev_capital + rp_delta * rate

        # 잉여현금 / 충전필요 계산
        # 이익 시: 반영 안 된 부분 = rp_delta * (1 - rate) → 빼낼 수 있는 돈
        # 손실 시: 반영 안 된 부분 = |rp_delta| * (1 - rate) → 넣어야 하는 돈
        if rp_delta >= 0:
            surplus = round(rp_delta * (1 - rate), 2)
            injection = 0.0
        else:
            surplus = 0.0
            injection = round(abs(rp_delta) * (1 - rate), 2)

        self.events.append(
            RenewalEvent(
                time=candle_time,
                day_index=day_index,
                rp_delta=round(rp_delta, 2),
                rate=rate,
                prev_capital=round(self.prev_capital, 2),
                new_capital=round(new_capital, 2),
                surplus=surplus,
                injection=injection,
            )
        )

        self.capital = new_capital
        self.prev_capital = new_capital
        self.prev_renewal_rp = self.realized_pnl
        self.days_since_renewal = 0

        return new_capital


# ========== 결과 구조체 ==========


@dataclass
class AsymmetricResult:
    """비대칭 복리 백테스트 결과."""

    trades: list[dict]
    equity: list[dict]
    cash: list[dict]
    metrics: dict
    renewal_events: list[dict]
    execution_time: float


# ========== 메인 엔진 ==========

from app.strategies import get_split_ratios


class AsymmetricCompoundEngine:
    """비대칭 복리 백테스트 엔진 (기존 전략 코드 무수정)."""

    SUPPORTED_STRATEGIES = [
        "ddeolsapro1",
        "ddeolsapro2",
        "ddeolsapro3",
        "ddeolsapro_custom",
        "ddeolsapro_at",
        "jongjong5",
        "moomae21",
        "wadaeri_v1",
    ]

    # 전략별 고유 갱신 모드 자동 매칭
    # 사이클 기반 전략 → 사이클 종료 시 (no_position)
    # 비사이클 전략 → 고정 주기 (fixed_period)
    STRATEGY_RENEWAL_MODE: dict[str, str] = {
        "ddeolsapro1": "no_position",
        "ddeolsapro2": "no_position",
        "ddeolsapro3": "no_position",
        "ddeolsapro_custom": "no_position",
        "ddeolsapro_at": "no_position",
        "moomae21": "no_position",
        "jongjong5": "every_sell",
        "wadaeri_v1": "fixed_period",
    }

    @classmethod
    def get_renewal_mode(cls, strategy_id: str) -> str:
        """전략에 맞는 갱신 모드 반환."""
        return cls.STRATEGY_RENEWAL_MODE.get(strategy_id, "fixed_period")

    def run(
        self,
        strategy_id: str,
        data: pd.DataFrame,
        params: dict[str, Any],
        initial_capital: float,
        compound_config: CompoundConfig,
        market: str = "us",
        qqq_df: pd.DataFrame | None = None,
    ) -> AsymmetricResult:
        """비대칭 복리 적용 백테스트 실행."""
        # 전략별 갱신 모드 자동 매칭 (사용자 지정 무시)
        compound_config.renewal_mode = self.get_renewal_mode(strategy_id)
        if strategy_id.startswith("ddeolsapro"):
            return self._run_ddeolsapro(
                strategy_id, data, params, initial_capital, compound_config, market
            )
        elif strategy_id == "jongjong5":
            return self._run_jongjong5(
                data, params, initial_capital, compound_config, market
            )
        elif strategy_id == "moomae21":
            return self._run_moomae21(
                data, params, initial_capital, compound_config, market
            )
        elif strategy_id == "wadaeri_v1":
            return self._run_wadaeri(
                data, params, initial_capital, compound_config, market, qqq_df
            )
        else:
            raise ValueError(f"Unsupported strategy: {strategy_id}")

    # ===== ddeolsapro 계열 =====

    def _run_ddeolsapro(
        self,
        strategy_id: str,
        data: pd.DataFrame,
        params: dict[str, Any],
        initial_capital: float,
        compound_config: CompoundConfig,
        market: str,
    ) -> AsymmetricResult:
        start_time = time_module.perf_counter()

        fee_rate = get_fee_rate_for_market(market)
        apply_fee = bool(params.get("applyFee", True))

        # split_ratios 결정
        if strategy_id == "ddeolsapro_custom":
            divisions = int(params.get("divisions", 6))
            divisions = max(2, min(10, divisions))
            default_pct = round(100 / divisions, 2)
            split_ratios = []
            for i in range(1, divisions + 1):
                pct = float(params.get(f"splitPct{i}", default_pct))
                split_ratios.append(pct / 100)
        elif strategy_id == "ddeolsapro_at":
            split_ratios = get_split_ratios("ddeolsapro3")
        else:
            split_ratios = get_split_ratios(strategy_id)

        max_tiers = len(split_ratios) + 1

        state = TieredStrategyState(
            cash=initial_capital,
            cycle_seed=initial_capital,
            avg_cost=0.0,
            total_qty=0,
            tier_positions=[None] * max_tiers,
            fee_rate=fee_rate,
            apply_fee=apply_fee,
            drop_percent=float(params.get("dropPercent", 0.01)),
            target_profit=float(params.get("targetProfit", 0.01)),
            stop_loss_days=int(params.get("stopLossDays", 10)),
            no_stop_loss_day_buy=params.get("stopLossDayBuy", "allow") == "block",
            split_ratios=split_ratios,
            max_tiers=max_tiers,
        )

        tracker = CompoundTracker(config=compound_config)
        tracker.init(initial_capital)

        times_arr = data["time"].values
        closes_arr = data["close"].values
        n = len(data)

        prev_trade_count = 0

        for i in range(n):
            candle_time = int(times_arr[i])
            close = float(closes_arr[i])
            prev_close = float(closes_arr[i - 1]) if i > 0 else None

            # 1. 전략 1캔들 처리 (매도/매수/사이클종료 포함)
            DdeolsaproBase.step_candle(state, i, candle_time, close, prev_close)

            # 2. 새 매도 거래에서 실현 손익 추적
            new_trades = state.trades[prev_trade_count:]
            for trade in new_trades:
                if trade.type == "sell" and trade.cost_basis is not None:
                    proceeds = trade.value
                    cost = trade.cost_basis * trade.quantity * (
                        1 + fee_rate if apply_fee else 1
                    )
                    tracker.add_realized_pnl(proceeds - cost)
            prev_trade_count = len(state.trades)

            # 3. 비대칭 복리 갱신 (step_candle 후)
            # cash 조정 + cycle_seed도 함께 갱신하여 불일치 방지
            has_position = any(p is not None for p in state.tier_positions)
            new_capital = tracker.check_renewal(i, candle_time, has_position)
            if new_capital is not None:
                last_event = tracker.events[-1]
                state.cash -= last_event.surplus
                state.cash += last_event.injection
                # cycle_seed도 cash와 동기화 (무포지션이면 이미 cash와 같음)
                if not has_position:
                    state.cycle_seed = state.cash

        # 최종 청산
        if n > 0:
            last_time = int(times_arr[-1])
            last_close = round(float(closes_arr[-1]), 2)
            for t in range(state.max_tiers):
                if state.tier_positions[t] is not None:
                    DdeolsaproBase._sell_tier(state, t, last_time, last_close)

        return self._build_result(
            state.trades, state.equity, state.cash_history,
            initial_capital, tracker, start_time,
        )

    # ===== jongjong5 =====

    def _run_jongjong5(
        self,
        data: pd.DataFrame,
        params: dict[str, Any],
        initial_capital: float,
        compound_config: CompoundConfig,
        market: str,
    ) -> AsymmetricResult:
        start_time = time_module.perf_counter()

        closes = data["close"].values
        times = data["time"].values.astype(int)
        n = len(closes)

        daily_invest_ratio = float(params.get("dailyInvestRatio", 10)) / 100.0
        target_profit = float(params.get("targetProfit", 2.75)) / 100.0
        stop_loss_days = int(params.get("stopLossDays", 10))
        apply_fee = bool(params.get("applyFee", True))
        fee_rate = float(params.get("feeRate", 0.0025))

        cash = float(initial_capital)
        lots: list[TierPosition] = []
        trades: list[Trade] = []
        equity: list[dict[str, float]] = []
        cash_history: list[dict[str, float]] = []

        tracker = CompoundTracker(config=compound_config)
        tracker.init(initial_capital)

        def _apply_asymmetric(pnl: float, candle_time: int, day_idx: int) -> float:
            """매도 즉시 비대칭 비율 적용, cash 조정액 반환."""
            nonlocal cash
            rate = compound_config.profit_rate if pnl >= 0 else compound_config.loss_rate
            if abs(pnl) < 0.01:
                return 0.0
            reflected = pnl * rate
            if pnl >= 0:
                surplus = round(pnl - reflected, 2)
                injection = 0.0
            else:
                surplus = 0.0
                injection = round(abs(pnl) - abs(reflected), 2)
            tracker.events.append(RenewalEvent(
                time=candle_time, day_index=day_idx,
                rp_delta=round(pnl, 2), rate=rate,
                prev_capital=0.0, new_capital=0.0,
                surplus=surplus, injection=injection,
            ))
            cash -= surplus
            cash += injection
            return 0.0

        for i in range(n):
            close = float(closes[i])
            t = int(times[i])

            # buy_budget 산출 (전일 총자산평가금 기준)
            if i == 0:
                prev_total = initial_capital
            else:
                prev_close = float(closes[i - 1])
                prev_total = cash + sum(lot.quantity * prev_close for lot in lots)
            buy_budget = prev_total * daily_invest_ratio

            # 매도 판정 → 매도 즉시 비대칭 복리 적용
            sold_today = False
            remaining_lots: list[TierPosition] = []
            for lot in lots:
                profit = (close - lot.buy_price) / lot.buy_price
                days_held = i - lot.buy_day_index

                if profit >= target_profit:
                    sold_today = True
                    gross = lot.quantity * close
                    net = apply_sell_fee(gross, fee_rate, apply_fee)
                    pnl = net - lot.buy_value
                    cash += net
                    _apply_asymmetric(pnl, t, i)
                    trades.append(Trade(
                        time=t, type="sell", price=close,
                        quantity=lot.quantity, value=net,
                        cost_basis=lot.buy_price,
                    ))
                elif days_held >= stop_loss_days:
                    sold_today = True
                    gross = lot.quantity * close
                    net = apply_sell_fee(gross, fee_rate, apply_fee)
                    pnl = net - lot.buy_value
                    cash += net
                    _apply_asymmetric(pnl, t, i)
                    trades.append(Trade(
                        time=t, type="sell", price=close,
                        quantity=lot.quantity, value=net,
                        cost_basis=lot.buy_price,
                    ))
                else:
                    remaining_lots.append(lot)
            lots = remaining_lots

            # 매수
            is_last_day = i == n - 1
            if not is_last_day and not sold_today:
                actual_budget = min(buy_budget, cash)
                prev_c = float(closes[i - 1]) if i > 0 else close
                quantity = calc_buy_quantity(actual_budget, prev_c, fee_rate, apply_fee)
                if quantity >= 1:
                    total_cost = apply_buy_fee(quantity * close, fee_rate, apply_fee)
                    cash -= total_cost
                    lots.append(TierPosition(
                        tier=len(lots) + 1,
                        buy_price=close,
                        buy_day_index=i,
                        quantity=quantity,
                        buy_value=total_cost,
                        target_profit=target_profit,
                        stop_loss_days=stop_loss_days,
                    ))
                    trades.append(Trade(
                        time=t, type="buy", price=close,
                        quantity=quantity, value=total_cost,
                    ))

            # 마지막 날 강제 매도
            if is_last_day and lots:
                for lot in lots:
                    gross = lot.quantity * close
                    net = apply_sell_fee(gross, fee_rate, apply_fee)
                    cash += net
                    trades.append(Trade(
                        time=t, type="sell", price=close,
                        quantity=lot.quantity, value=net,
                        cost_basis=lot.buy_price,
                    ))
                lots = []

            holdings_value = sum(lot.quantity * close for lot in lots)
            total_value = cash + holdings_value
            equity.append({"time": t, "value": total_value})
            cash_history.append({"time": t, "value": cash})

        return self._build_result(
            trades, equity, cash_history,
            initial_capital, tracker, start_time,
        )

    # ===== moomae21 =====

    def _run_moomae21(
        self,
        data: pd.DataFrame,
        params: dict[str, Any],
        initial_capital: float,
        compound_config: CompoundConfig,
        market: str,
    ) -> AsymmetricResult:
        start_time = time_module.perf_counter()

        divisions = int(params.get("divisions", 40))
        big_number_percent = float(params.get("bigNumberPercent", 5))
        first_half_sell1_pct = float(params.get("firstHalfSell1Pct", 5))
        first_half_sell1_ratio = float(params.get("firstHalfSell1Ratio", 25))
        first_half_sell2_pct = float(params.get("firstHalfSell2Pct", 10))
        first_half_sell2_ratio = float(params.get("firstHalfSell2Ratio", 75))
        second_half_sell1_pct = float(params.get("secondHalfSell1Pct", 10))
        second_half_sell1_ratio = float(params.get("secondHalfSell1Ratio", 50))
        second_half_sell2_pct = float(params.get("secondHalfSell2Pct", 5))
        second_half_sell2_ratio = float(params.get("secondHalfSell2Ratio", 25))
        second_half_sell3_pct = float(params.get("secondHalfSell3Pct", 0))
        second_half_sell3_ratio = float(params.get("secondHalfSell3Ratio", 25))
        apply_fee = bool(params.get("applyFee", True))
        fee_rate = float(params.get("feeRate", DEFAULT_FEE_RATE))

        cycle_seed = initial_capital
        round_unit = cycle_seed / divisions
        accumulated_buy = 0.0
        cycle_just_ended = False

        cash = initial_capital
        avg_cost = 0.0
        total_qty = 0

        trades: list[Trade] = []
        equity: list[dict[str, float]] = []
        cash_history: list[dict[str, float]] = []

        times_arr = data["time"].values
        highs = data["high"].values
        closes = data["close"].values
        n = len(data)

        tracker = CompoundTracker(config=compound_config)
        tracker.init(initial_capital)

        def calculate_t_value() -> float:
            if round_unit <= 0:
                return 0.0
            raw = accumulated_buy / round_unit
            return math.ceil(raw * 100) / 100

        def is_first_half() -> bool:
            return calculate_t_value() < 20.0

        def should_quarter_cut() -> bool:
            return calculate_t_value() >= (divisions * 0.9775)

        @dataclass
        class SellOrder:
            target_pct: float
            qty: int
            order_type: str  # "limit" or "LOC"
            label: str

        for i in range(n):
            candle_time = int(times_arr[i])
            candle_high = float(highs[i])
            candle_close = float(closes[i])
            prev_close_m = float(closes[i - 1]) if i > 0 else candle_close

            if cycle_just_ended:
                cycle_just_ended = False

            # 비대칭 복리 갱신: cash + cycle_seed 조정
            has_position = total_qty > 0
            new_capital = tracker.check_renewal(i, candle_time, has_position)
            if new_capital is not None:
                last_event = tracker.events[-1]
                cash -= last_event.surplus
                cash += last_event.injection
                if total_qty == 0:
                    cycle_seed = new_capital
                    round_unit = cycle_seed / divisions

            qty_at_start = total_qty
            avg_cost_at_start = avg_cost

            sell_orders: list[SellOrder] = []

            if qty_at_start > 0 and avg_cost_at_start > 0:
                if should_quarter_cut():
                    sell_orders.append(SellOrder(
                        target_pct=-100,
                        qty=math.ceil(qty_at_start / 4),
                        order_type="LOC",
                        label="쿼터손절",
                    ))
                elif is_first_half():
                    if first_half_sell2_ratio > 0:
                        sell_orders.append(SellOrder(
                            target_pct=first_half_sell2_pct,
                            qty=int(qty_at_start * first_half_sell2_ratio / 100),
                            order_type="limit",
                            label="지정가",
                        ))
                    if first_half_sell1_ratio > 0:
                        sell_orders.append(SellOrder(
                            target_pct=first_half_sell1_pct,
                            qty=-1,
                            order_type="LOC",
                            label="LOC",
                        ))
                else:
                    if second_half_sell1_ratio > 0:
                        sell_orders.append(SellOrder(
                            target_pct=second_half_sell1_pct,
                            qty=int(qty_at_start * second_half_sell1_ratio / 100),
                            order_type="limit",
                            label="지정가1",
                        ))
                    if second_half_sell2_ratio > 0:
                        sell_orders.append(SellOrder(
                            target_pct=second_half_sell2_pct,
                            qty=int(qty_at_start * second_half_sell2_ratio / 100),
                            order_type="limit",
                            label="지정가2",
                        ))
                    if second_half_sell3_ratio > 0:
                        sell_orders.append(SellOrder(
                            target_pct=second_half_sell3_pct,
                            qty=-1,
                            order_type="LOC",
                            label="LOC",
                        ))

            # 1. limit 매도
            limit_orders = sorted(
                [o for o in sell_orders if o.order_type == "limit"],
                key=lambda o: -o.target_pct,
            )
            for order in limit_orders:
                if total_qty <= 0:
                    break
                target_price = avg_cost_at_start * (1 + order.target_pct / 100)
                if candle_high >= target_price:
                    result = execute_sell_core(
                        cash, avg_cost, total_qty,
                        order.qty, target_price,
                        fee_rate, apply_fee,
                    )
                    if result.sell_qty > 0:
                        pnl = result.sell_value - (avg_cost_at_start * result.sell_qty)
                        tracker.add_realized_pnl(pnl)
                        accumulated_buy = max(0, accumulated_buy - result.sell_value)
                        cash, avg_cost, total_qty = (
                            result.new_cash, result.new_avg_cost, result.new_total_qty
                        )
                        if total_qty <= 0:
                            accumulated_buy = 0.0
                        trades.append(create_sell_trade(candle_time, target_price, result))

            # 2. LOC 매도
            loc_orders = sorted(
                [o for o in sell_orders if o.order_type == "LOC"],
                key=lambda o: -o.target_pct,
            )
            for order in loc_orders:
                if total_qty <= 0:
                    break
                if order.label == "쿼터손절":
                    result = execute_sell_core(
                        cash, avg_cost, total_qty,
                        order.qty, candle_close,
                        fee_rate, apply_fee,
                    )
                    if result.sell_qty > 0:
                        pnl = result.sell_value - (avg_cost_at_start * result.sell_qty)
                        tracker.add_realized_pnl(pnl)
                        accumulated_buy = max(0, accumulated_buy - result.sell_value)
                        cash, avg_cost, total_qty = (
                            result.new_cash, result.new_avg_cost, result.new_total_qty
                        )
                        if total_qty <= 0:
                            accumulated_buy = 0.0
                        trades.append(create_sell_trade(candle_time, candle_close, result))
                    continue

                target_price = avg_cost_at_start * (1 + order.target_pct / 100)
                if candle_close >= target_price:
                    sell_qty = total_qty if order.qty == -1 else order.qty
                    result = execute_sell_core(
                        cash, avg_cost, total_qty,
                        sell_qty, candle_close,
                        fee_rate, apply_fee,
                    )
                    if result.sell_qty > 0:
                        pnl = result.sell_value - (avg_cost_at_start * result.sell_qty)
                        tracker.add_realized_pnl(pnl)
                        accumulated_buy = max(0, accumulated_buy - result.sell_value)
                        cash, avg_cost, total_qty = (
                            result.new_cash, result.new_avg_cost, result.new_total_qty
                        )
                        if total_qty <= 0:
                            accumulated_buy = 0.0
                        trades.append(create_sell_trade(candle_time, candle_close, result))

            # 3. 사이클 종료 체크
            if total_qty == 0 and qty_at_start > 0:
                cycle_just_ended = True

            # 4. 매수
            if total_qty == 0 and not cycle_just_ended:
                if len(trades) > 0:
                    cycle_seed = cash
                    # 비대칭 복리 적용된 capital 반영
                    if tracker.capital != tracker.prev_capital:
                        cycle_seed = tracker.capital
                    round_unit = cycle_seed / divisions
                    accumulated_buy = 0.0

                if cash >= round_unit:
                    result = execute_buy_core(
                        cash, avg_cost, total_qty,
                        round_unit, candle_close,
                        fee_rate, apply_fee,
                        qty_price=prev_close_m,
                    )
                    if result.quantity > 0:
                        accumulated_buy += result.total_cost
                        cash, avg_cost, total_qty = (
                            result.new_cash, result.new_avg_cost, result.new_total_qty
                        )
                        trades.append(create_buy_trade(candle_time, candle_close, result))

            elif total_qty > 0 and not should_quarter_cut():
                if is_first_half():
                    half_round_unit = round_unit / 2
                    if candle_close < avg_cost and cash >= half_round_unit:
                        result = execute_buy_core(
                            cash, avg_cost, total_qty,
                            half_round_unit, candle_close,
                            fee_rate, apply_fee,
                            qty_price=prev_close_m,
                        )
                        if result.quantity > 0:
                            accumulated_buy += result.total_cost
                            cash, avg_cost, total_qty = (
                                result.new_cash, result.new_avg_cost, result.new_total_qty
                            )
                            trades.append(create_buy_trade(candle_time, candle_close, result))

                    big_number_threshold = avg_cost * (1 + big_number_percent / 100)
                    if candle_close < big_number_threshold and cash >= half_round_unit:
                        result = execute_buy_core(
                            cash, avg_cost, total_qty,
                            half_round_unit, candle_close,
                            fee_rate, apply_fee,
                            qty_price=prev_close_m,
                        )
                        if result.quantity > 0:
                            accumulated_buy += result.total_cost
                            cash, avg_cost, total_qty = (
                                result.new_cash, result.new_avg_cost, result.new_total_qty
                            )
                            trades.append(create_buy_trade(candle_time, candle_close, result))
                else:
                    if candle_close < avg_cost and cash >= round_unit:
                        result = execute_buy_core(
                            cash, avg_cost, total_qty,
                            round_unit, candle_close,
                            fee_rate, apply_fee,
                            qty_price=prev_close_m,
                        )
                        if result.quantity > 0:
                            accumulated_buy += result.total_cost
                            cash, avg_cost, total_qty = (
                                result.new_cash, result.new_avg_cost, result.new_total_qty
                            )
                            trades.append(create_buy_trade(candle_time, candle_close, result))

            portfolio_value = calc_portfolio_value(cash, total_qty, candle_close)
            equity.append({"time": candle_time, "value": portfolio_value})
            cash_history.append({"time": candle_time, "value": cash})

        # 최종 청산
        if n > 0 and total_qty > 0:
            last_time = int(times_arr[-1])
            last_close = float(closes[-1])
            result = execute_sell_core(
                cash, avg_cost, total_qty,
                total_qty, last_close,
                fee_rate, apply_fee,
            )
            if result.sell_qty > 0:
                cash = result.new_cash
                trades.append(create_sell_trade(last_time, last_close, result))

        return self._build_result(
            trades, equity, cash_history,
            initial_capital, tracker, start_time,
        )

    # ===== wadaeri =====

    def _run_wadaeri(
        self,
        data: pd.DataFrame,
        params: dict[str, Any],
        initial_capital: float,
        compound_config: CompoundConfig,
        market: str,
        qqq_df: pd.DataFrame | None = None,
    ) -> AsymmetricResult:
        start_time = time_module.perf_counter()

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

        from app.services.qqq_data import load_qqq_weekly, calc_exponential_trendline

        if qqq_df is None:
            qqq_df = load_qqq_weekly()
        qqq_dates = qqq_df["date"].values
        qqq_closes = qqq_df["close"].values.astype(np.float64)

        times_arr = data["time"].values
        closes = data["close"].values.astype(np.float64)

        friday_indices = []
        for i in range(len(times_arr)):
            dt = datetime.fromtimestamp(int(times_arr[i]), tz=timezone.utc)
            if dt.weekday() == 4:
                friday_indices.append(i)

        if len(friday_indices) == 0:
            return AsymmetricResult(
                trades=[], equity=[], cash=[], metrics={},
                renewal_events=[], execution_time=0,
            )

        cash = initial_capital
        position = 0
        avg_cost = 0.0
        trades: list[Trade] = []

        prev_valuation = 0.0
        is_first_week = True

        tracker = CompoundTracker(config=compound_config)
        tracker.init(initial_capital)

        for fi in friday_indices:
            candle_time = int(times_arr[fi])
            price = float(closes[fi])
            date_str = datetime.fromtimestamp(candle_time, tz=timezone.utc).strftime("%Y-%m-%d")

            current_valuation = position * price

            # 비대칭 복리 갱신 (주간 단위): cash 조정 → prev_valuation에도 반영
            has_position = position > 0
            new_capital = tracker.check_renewal(fi, candle_time, has_position)
            if new_capital is not None:
                last_event = tracker.events[-1]
                cash -= last_event.surplus
                cash += last_event.injection
                # prev_valuation 보정: cash 변동분만큼 이전 평가금도 조정
                # (하지 않으면 change 계산이 cash 변동을 반영 못함)
                prev_valuation += (last_event.injection - last_event.surplus)

            if is_first_week:
                buy_budget = initial_capital * 0.5
                effective_price = price * (1 + fee_rate) if apply_fee else price
                quantity = int(buy_budget / effective_price) if effective_price > 0 else 0
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
                change = current_valuation - prev_valuation

                # QQQ 추세선 기반 구간 판단
                mask = qqq_dates <= date_str
                subset_closes = qqq_closes[mask]
                if len(subset_closes) < 10:
                    buy_rate, sell_rate = buy_rate_neutral, sell_rate_neutral
                else:
                    trend_value = calc_exponential_trendline(subset_closes, trend_period)
                    if trend_value <= 0:
                        buy_rate, sell_rate = buy_rate_neutral, sell_rate_neutral
                    else:
                        actual = float(subset_closes[-1])
                        deviation = ((actual - trend_value) / trend_value) * 100
                        if deviation > band_upper:
                            buy_rate, sell_rate = buy_rate_high, sell_rate_high
                        elif deviation < -band_lower:
                            buy_rate, sell_rate = buy_rate_low, sell_rate_low
                        else:
                            buy_rate, sell_rate = buy_rate_neutral, sell_rate_neutral

                if change < 0:
                    buy_amount = abs(change) * buy_rate
                    buy_amount = min(buy_amount, cash)
                    effective_price = price * (1 + fee_rate) if apply_fee else price
                    quantity = int(buy_amount / effective_price) if effective_price > 0 else 0
                    if quantity > 0:
                        cost = quantity * price
                        total_cost = cost * (1 + fee_rate) if apply_fee else cost
                        if total_cost <= cash:
                            new_total_qty = position + quantity
                            avg_cost = (
                                (avg_cost * position + price * quantity) / new_total_qty
                                if new_total_qty > 0 else 0.0
                            )
                            cash -= total_cost
                            position = new_total_qty
                            trades.append(Trade(
                                time=candle_time, type="buy", price=price,
                                quantity=quantity, value=total_cost,
                            ))
                elif change > 0:
                    sell_amount = change * sell_rate
                    sell_qty = int(sell_amount / price) if price > 0 else 0
                    sell_qty = min(sell_qty, position)
                    if sell_qty > 0:
                        gross_value = sell_qty * price
                        net_value = gross_value * (1 - fee_rate) if apply_fee else gross_value
                        pnl = net_value - (avg_cost * sell_qty)
                        tracker.add_realized_pnl(pnl)
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

        # 일봉 에쿼티 보간
        trade_map: dict[int, list[Trade]] = {}
        for tr in trades:
            trade_map.setdefault(tr.time, []).append(tr)

        replay_cash = initial_capital
        replay_pos = 0
        equity: list[dict[str, float]] = []
        cash_history: list[dict[str, float]] = []

        for i in range(len(times_arr)):
            ct = int(times_arr[i])
            if ct in trade_map:
                for tr in trade_map[ct]:
                    if tr.type == "buy":
                        replay_pos += int(tr.quantity)
                        replay_cash -= tr.value
                    elif tr.type == "sell":
                        replay_pos -= int(tr.quantity)
                        replay_cash += tr.value
            p = float(closes[i])
            equity.append({"time": ct, "value": replay_cash + replay_pos * p})
            cash_history.append({"time": ct, "value": replay_cash})

        return self._build_result(
            trades, equity, cash_history,
            initial_capital, tracker, start_time,
        )

    # ===== 결과 빌드 =====

    def _build_result(
        self,
        trades: list[Trade],
        equity: list[dict[str, float]],
        cash_history: list[dict[str, float]],
        initial_capital: float,
        tracker: CompoundTracker,
        start_time: float,
    ) -> AsymmetricResult:
        metrics = calculate_metrics(trades, equity, initial_capital)
        execution_time = (time_module.perf_counter() - start_time) * 1000

        return AsymmetricResult(
            trades=[
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
                for t in trades
            ],
            equity=[{"time": e["time"], "value": round(e["value"], 2)} for e in equity],
            cash=[{"time": c["time"], "value": round(c["value"], 2)} for c in cash_history],
            metrics={
                "totalReturn": metrics.total_return,
                "cagr": metrics.cagr,
                "mdd": metrics.mdd,
                "winRate": metrics.win_rate,
                "sharpeRatio": metrics.sharpe_ratio,
                "totalTrades": metrics.total_trades,
            },
            renewal_events=[
                {
                    "time": e.time,
                    "dayIndex": e.day_index,
                    "rpDelta": e.rp_delta,
                    "rate": e.rate,
                    "prevCapital": e.prev_capital,
                    "newCapital": e.new_capital,
                    "surplus": e.surplus,
                    "injection": e.injection,
                }
                for e in tracker.events
            ],
            execution_time=round(execution_time, 2),
        )
