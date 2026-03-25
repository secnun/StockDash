"""짭파법 v1 백테스트 엔진.

QQQ 주봉 RSI로 공세/안전 모드를 전환하고,
SOXL 일봉에서 7균등 분할 매수/매도, 비대칭 복리 투자금 갱신.
"""

from __future__ import annotations

import math
import time as time_module
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

import numpy as np
import pandas as pd

from app.services.metrics import calculate_metrics


@dataclass
class JjappaTierPosition:
    """개별 티어 포지션."""
    buy_price: float       # 매수 체결가 (수수료 미포함)
    quantity: int
    buy_time: int          # 매수 시 timestamp
    buy_day_index: int     # 매수 시 거래일 인덱스
    mode_at_buy: str       # 매수 시 모드 ('safe' or 'aggressive')
    target_profit: float   # 매수 시 모드의 목표수익률
    max_hold_days: int     # 매수 시 모드의 최대보유기간


@dataclass
class JjappaConfig:
    """짭파법 v1 설정."""
    rsi_threshold: float = 63.0
    # 안전모드
    safe_strategy: str = "dongpa"       # 'dongpa' or 'ddeolsapro3'
    safe_buy_max_rise: float = 3.0      # % (동파용)
    safe_drop_percent: float = 0.10     # % (떨사프로3용)
    safe_target_profit: float = 0.2     # %
    safe_max_hold_days: int = 30
    safe_stop_loss_day_buy: str = "allow"  # 'allow' or 'block' (떨사프로3용)
    # 공세모드
    aggr_strategy: str = "dongpa"       # 'dongpa' or 'ddeolsapro3'
    aggr_buy_max_rise: float = 5.0      # % (동파용)
    aggr_drop_percent: float = 0.10     # % (떨사프로3용)
    aggr_target_profit: float = 2.5     # %
    aggr_max_hold_days: int = 7
    aggr_stop_loss_day_buy: str = "allow"  # 'allow' or 'block' (떨사프로3용)
    # 투자금 갱신
    renewal_mode: str = "fixed_period"  # 'no_position', 'fixed_period', 'hybrid'
    renewal_period: int = 10            # 고정주기/혼합 모드 시
    profit_rate: float = 0.80
    loss_rate: float = 0.30
    # 수수료
    fee_rate: float = 0.0025
    apply_fee: bool = True
    # 초기 자본
    initial_capital: float = 100000.0
    # 분할 수
    num_tiers: int = 7


@dataclass
class JjappaModeEvent:
    """모드 전환 이벤트."""
    time: int
    day_index: int
    from_mode: str
    to_mode: str
    qqq_rsi: float
    qqq_prev_rsi: float
    portfolio_value: float


@dataclass
class JjappaRenewalEvent:
    """투자금 갱신 이벤트."""
    time: int
    day_index: int
    rp_delta: float
    rate: float
    prev_capital: float
    new_capital: float


@dataclass
class JjappaSegment:
    """모드 구간별 성과."""
    mode: str
    start_time: int
    end_time: int
    start_value: float
    end_value: float
    segment_return: float
    trade_count: int
    candle_count: int


def _is_monday(ts: int) -> bool:
    """timestamp가 월요일인지 확인."""
    return datetime.utcfromtimestamp(ts).weekday() == 0


def _is_tuesday(ts: int) -> bool:
    return datetime.utcfromtimestamp(ts).weekday() == 1


def _find_qqq_rsi_for_week(
    qqq_dates: list[str],
    qqq_rsi: list[float],
    target_date: str,
) -> tuple[float | None, float | None]:
    """target_date 이전 최근 2개 QQQ 주봉 RSI 반환 (직전 완성 주봉 기준)."""
    idx = None
    for i in range(len(qqq_dates) - 1, -1, -1):
        if qqq_dates[i] < target_date:
            idx = i
            break
    if idx is None:
        return None, None
    current = qqq_rsi[idx] if not np.isnan(qqq_rsi[idx]) else None
    previous = qqq_rsi[idx - 1] if idx > 0 and not np.isnan(qqq_rsi[idx - 1]) else None
    return current, previous


class JjappaEngine:
    """짭파법 v1 엔진."""

    def run(
        self,
        soxl_df: pd.DataFrame,
        qqq_df: pd.DataFrame,
        config: JjappaConfig,
    ) -> dict:
        start_perf = time_module.perf_counter()

        fee_rate = config.fee_rate if config.apply_fee else 0.0
        n_tiers = config.num_tiers

        # QQQ 데이터 준비
        qqq_dates = qqq_df["date"].tolist() if "date" in qqq_df.columns else [
            datetime.utcfromtimestamp(int(t)).strftime("%Y-%m-%d")
            for t in qqq_df["time"].values
        ]
        qqq_rsi_arr = qqq_df["RSI"].values.astype(float)

        # SOXL 데이터
        times = soxl_df["time"].values.astype(int)
        closes = soxl_df["close"].values.astype(float)
        opens = soxl_df["open"].values.astype(float)
        highs = soxl_df["high"].values.astype(float)
        lows = soxl_df["low"].values.astype(float)
        volumes = soxl_df["Volume"].values if "Volume" in soxl_df.columns else np.zeros(len(times))
        n = len(times)

        # 상태 초기화
        capital = config.initial_capital
        cash = config.initial_capital
        tiers: list[JjappaTierPosition | None] = [None] * n_tiers
        current_mode = "safe"
        trades: list[dict] = []
        equity: list[dict] = []
        cash_history: list[dict] = []
        mode_events: list[dict] = []
        renewal_events: list[dict] = []
        timeline: list[dict] = []
        segments: list[dict] = []

        # 투자금 갱신 추적
        realized_pnl = 0.0
        prev_renewal_rp = 0.0
        prev_capital = capital
        days_since_renewal = 0
        first_buy_done = False

        # 구간 추적
        seg_start_idx = 0
        seg_start_value = capital
        seg_trades_start = 0

        # 마지막 모드 평가한 월요일 (중복 방지)
        last_eval_monday_ts = -1

        for i in range(n):
            candle_time = int(times[i])
            close = float(closes[i])
            prev_close = float(closes[i - 1]) if i > 0 else None
            soxl_date = datetime.utcfromtimestamp(candle_time).strftime("%Y-%m-%d")

            total_qty = sum(t.quantity for t in tiers if t is not None)
            portfolio_value = cash + total_qty * close

            # ===== 0순위: 투자금 갱신 =====
            if first_buy_done:
                days_since_renewal += 1
                do_renewal = False
                open_count = sum(1 for t in tiers if t is not None)

                if config.renewal_mode == "no_position":
                    do_renewal = open_count == 0
                elif config.renewal_mode == "fixed_period":
                    do_renewal = days_since_renewal >= config.renewal_period
                elif config.renewal_mode == "hybrid":
                    do_renewal = (open_count == 0) or (days_since_renewal >= config.renewal_period)

                if do_renewal:
                    rp_delta = realized_pnl - prev_renewal_rp
                    rate = config.profit_rate if rp_delta >= 0 else config.loss_rate
                    new_capital = prev_capital + rp_delta * rate
                    cash_adj = new_capital - prev_capital
                    cash += cash_adj

                    renewal_events.append({
                        "time": candle_time,
                        "dayIndex": i,
                        "rpDelta": round(rp_delta, 2),
                        "rate": rate,
                        "prevCapital": round(prev_capital, 2),
                        "newCapital": round(new_capital, 2),
                    })

                    capital = new_capital
                    prev_capital = new_capital
                    prev_renewal_rp = realized_pnl
                    days_since_renewal = 0

            # ===== 모드 전환 (매주 월요일) =====
            is_monday = _is_monday(candle_time)
            # 공휴일 대응: 이번 주 첫 거래일이 화요일이면 화요일에 평가
            is_eval_day = is_monday
            if not is_monday and _is_tuesday(candle_time) and i > 0:
                prev_day = datetime.utcfromtimestamp(int(times[i - 1]))
                # 전 거래일이 금요일이면 월요일이 휴장 → 화요일에 평가
                if prev_day.weekday() == 4:  # Friday
                    is_eval_day = True

            if is_eval_day and candle_time != last_eval_monday_ts:
                rsi_curr, rsi_prev = _find_qqq_rsi_for_week(qqq_dates, qqq_rsi_arr, soxl_date)
                if rsi_curr is not None and rsi_prev is not None:
                    new_mode = current_mode
                    if rsi_curr < config.rsi_threshold and rsi_curr > rsi_prev:
                        new_mode = "aggressive"
                    elif rsi_curr > config.rsi_threshold and rsi_curr < rsi_prev:
                        new_mode = "safe"

                    if new_mode != current_mode:
                        pv = cash + total_qty * close
                        mode_events.append({
                            "time": candle_time,
                            "dayIndex": i,
                            "fromMode": current_mode,
                            "toMode": new_mode,
                            "qqqRsi": round(rsi_curr, 2),
                            "qqqPrevRsi": round(rsi_prev, 2),
                            "portfolioValue": round(pv, 2),
                        })

                        # 구간 기록
                        segments.append({
                            "modeId": current_mode,
                            "modeName": "안전" if current_mode == "safe" else "공세",
                            "strategyId": "jjappa_v1",
                            "startTime": int(times[seg_start_idx]) if seg_start_idx < n else candle_time,
                            "endTime": candle_time,
                            "startValue": round(seg_start_value, 2),
                            "endValue": round(pv, 2),
                            "segmentReturn": round((pv - seg_start_value) / seg_start_value * 100, 2) if seg_start_value > 0 else 0,
                            "segmentMdd": 0,
                            "tradeCount": len(trades) - seg_trades_start,
                            "candleCount": i - seg_start_idx,
                        })
                        seg_start_idx = i
                        seg_start_value = pv
                        seg_trades_start = len(trades)

                        current_mode = new_mode

                last_eval_monday_ts = candle_time

            # 현재 모드 파라미터
            if current_mode == "safe":
                mode_strategy = config.safe_strategy
                buy_max_rise = config.safe_buy_max_rise
                drop_percent = config.safe_drop_percent
                target_profit = config.safe_target_profit / 100.0
                max_hold_days = config.safe_max_hold_days
                stop_loss_day_buy = config.safe_stop_loss_day_buy
            else:
                mode_strategy = config.aggr_strategy
                buy_max_rise = config.aggr_buy_max_rise
                drop_percent = config.aggr_drop_percent
                target_profit = config.aggr_target_profit / 100.0
                max_hold_days = config.aggr_max_hold_days
                stop_loss_day_buy = config.aggr_stop_loss_day_buy

            # 매도 전 빈 슬롯 기록 (같은 날 매도+매수 시 매도 전 빈 슬롯만 매수 가능)
            empty_before_sell = {t_idx for t_idx in range(n_tiers) if tiers[t_idx] is None}

            # ===== 1순위: 손절 매도 =====
            for t_idx in range(n_tiers):
                pos = tiers[t_idx]
                if pos is None:
                    continue
                holding_days = i - pos.buy_day_index
                if holding_days >= pos.max_hold_days:
                    proceeds = pos.quantity * close * (1 - fee_rate)
                    total_cost = pos.buy_price * pos.quantity * (1 + fee_rate)
                    pnl = proceeds - total_cost
                    realized_pnl += pnl
                    cash += proceeds
                    trades.append({
                        "time": candle_time,
                        "type": "sell",
                        "price": close,
                        "quantity": pos.quantity,
                        "value": round(proceeds, 2),
                        "costBasis": round(pos.buy_price, 4),
                        "tier": t_idx + 1,
                        "tierSlots": f"T{t_idx + 1}(손절)",
                    })
                    tiers[t_idx] = None

            # ===== 2순위: 익절 매도 =====
            for t_idx in range(n_tiers):
                pos = tiers[t_idx]
                if pos is None:
                    continue
                if close >= pos.buy_price * (1 + pos.target_profit):
                    proceeds = pos.quantity * close * (1 - fee_rate)
                    total_cost = pos.buy_price * pos.quantity * (1 + fee_rate)
                    pnl = proceeds - total_cost
                    realized_pnl += pnl
                    cash += proceeds
                    trades.append({
                        "time": candle_time,
                        "type": "sell",
                        "price": close,
                        "quantity": pos.quantity,
                        "value": round(proceeds, 2),
                        "costBasis": round(pos.buy_price, 4),
                        "tier": t_idx + 1,
                        "tierSlots": f"T{t_idx + 1}(익절)",
                    })
                    tiers[t_idx] = None

            # ===== 3순위: 신규 매수 =====
            if prev_close is not None:
                # 매수 조건 판단: 전략별 분기
                should_buy = False
                if mode_strategy == "ddeolsapro3":
                    # 떨사프로3: 전일 대비 하락률 >= dropPercent 이면 매수
                    daily_drop = (prev_close - close) / prev_close * 100
                    should_buy = daily_drop >= drop_percent
                    # 손절일 매수 차단 옵션
                    if should_buy and stop_loss_day_buy == "block":
                        # 오늘 손절이 발생한 날이면 매수 차단
                        today_stop_loss = any(
                            t["time"] == candle_time and t["type"] == "sell" and "(손절)" in t.get("tierSlots", "")
                            for t in trades[-n_tiers:]
                        )
                        if today_stop_loss:
                            should_buy = False
                else:
                    # 동파: 일일상승률 < buyMaxRise 이면 매수
                    daily_rise = (close - prev_close) / prev_close * 100
                    should_buy = daily_rise < buy_max_rise

                if should_buy:
                    # 빈 슬롯 중 매도 전부터 비어있던 슬롯만 매수 가능, 낮은 번호 우선
                    for t_idx in range(n_tiers):
                        if tiers[t_idx] is None and t_idx in empty_before_sell:
                            budget = capital / n_tiers
                            budget_net = budget / (1 + fee_rate) if fee_rate > 0 else budget
                            qty = math.floor(budget_net / close)
                            if qty < 1:
                                break  # 1주 미만이면 매수 불가
                            actual_cost = qty * close * (1 + fee_rate)
                            if actual_cost > cash:
                                break  # 현금 부족
                            cash -= actual_cost
                            tiers[t_idx] = JjappaTierPosition(
                                buy_price=close,
                                quantity=qty,
                                buy_time=candle_time,
                                buy_day_index=i,
                                mode_at_buy=current_mode,
                                target_profit=target_profit,
                                max_hold_days=max_hold_days,
                            )
                            trades.append({
                                "time": candle_time,
                                "type": "buy",
                                "price": close,
                                "quantity": qty,
                                "value": round(actual_cost, 2),
                                "costBasis": round(actual_cost, 2),
                                "tier": t_idx + 1,
                                "tierSlots": f"T{t_idx + 1}",
                            })
                            if not first_buy_done:
                                first_buy_done = True
                            break  # 하루 최대 1티어

            # 기록
            total_qty = sum(t.quantity for t in tiers if t is not None)
            pv = cash + total_qty * close
            equity.append({"time": candle_time, "value": round(pv, 2)})
            cash_history.append({"time": candle_time, "value": round(cash, 2)})
            timeline.append({"time": candle_time, "modeId": current_mode})

        # 마지막 구간 기록
        if n > 0:
            last_pv = cash + sum(t.quantity for t in tiers if t is not None) * float(closes[-1])
            segments.append({
                "modeId": current_mode,
                "modeName": "안전" if current_mode == "safe" else "공세",
                "strategyId": "jjappa_v1",
                "startTime": int(times[seg_start_idx]) if seg_start_idx < n else int(times[-1]),
                "endTime": int(times[-1]),
                "startValue": round(seg_start_value, 2),
                "endValue": round(last_pv, 2),
                "segmentReturn": round((last_pv - seg_start_value) / seg_start_value * 100, 2) if seg_start_value > 0 else 0,
                "segmentMdd": 0,
                "tradeCount": len(trades) - seg_trades_start,
                "candleCount": n - seg_start_idx,
            })

        # 최종 청산 (메트릭 계산용)
        if n > 0:
            last_close = float(closes[-1])
            last_time = int(times[-1])
            for t_idx in range(n_tiers):
                pos = tiers[t_idx]
                if pos is not None:
                    proceeds = pos.quantity * last_close * (1 - fee_rate)
                    cash += proceeds
                    trades.append({
                        "time": last_time,
                        "type": "sell",
                        "price": last_close,
                        "quantity": pos.quantity,
                        "value": round(proceeds, 2),
                        "costBasis": round(pos.buy_price, 4),
                        "tier": t_idx + 1,
                        "tierSlots": f"T{t_idx + 1}(최종청산)",
                    })
                    tiers[t_idx] = None

        # 메트릭 계산
        from app.models.backtest import Trade as TradeModel
        trade_models = [
            TradeModel(
                time=t["time"],
                type=t["type"],
                price=t["price"],
                quantity=t["quantity"],
                value=t["value"],
                cost_basis=t.get("costBasis"),
                tier=t.get("tier"),
                tier_slots=t.get("tierSlots"),
            )
            for t in trades
        ]
        metrics = calculate_metrics(trade_models, equity, config.initial_capital)

        # 가격 데이터
        price_data = [
            {
                "time": int(times[i]),
                "open": float(opens[i]),
                "high": float(highs[i]),
                "low": float(lows[i]),
                "close": float(closes[i]),
                "volume": float(volumes[i]),
            }
            for i in range(n)
        ]

        execution_time = (time_module.perf_counter() - start_perf) * 1000

        return {
            "trades": trades,
            "equity": equity,
            "cash": cash_history,
            "metrics": {
                "totalReturn": metrics.total_return,
                "cagr": metrics.cagr,
                "mdd": metrics.mdd,
                "winRate": metrics.win_rate,
                "sharpeRatio": metrics.sharpe_ratio,
                "totalTrades": metrics.total_trades,
            },
            "priceData": price_data,
            "executionTime": round(execution_time, 2),
            "modeEvents": mode_events,
            "segments": segments,
            "activeModeTimeline": timeline,
            "renewalEvents": renewal_events,
            "qqqWeeklyData": [],  # 프론트에서 별도 로드
        }
