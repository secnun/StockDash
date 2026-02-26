"""스위칭 백테스트 엔진.

전략 슬롯 간 스위칭 트리거에 따라 매 캔들마다 활성 전략을 전환하며
step_candle()을 호출해 백테스트를 수행합니다.
"""

from __future__ import annotations

import time as time_module

import numpy as np
import pandas as pd

from app.models.backtest import EquityPoint, OHLCV, PerformanceMetrics, Trade
from app.models.switching import (
    SegmentResult,
    SwitchingBacktestResponse,
    SwitchingConfig,
    SwitchingEvent,
    StrategySlot,
)
from app.services.indicators import (
    compute_indicators,
    evaluate_trigger,
    get_all_indicator_values,
)
from app.services.metrics import calculate_metrics
from app.strategies.base import TierPosition
from app.strategies.ddeolsapro_base import DdeolsaproBase, TieredStrategyState
from app.strategies.utils import (
    calc_portfolio_value,
    get_fee_rate_for_market,
    DEFAULT_FEE_RATE,
)


def _build_state_for_slot(
    slot: StrategySlot,
    initial_capital: float,
    fee_rate: float,
    apply_fee: bool,
) -> TieredStrategyState:
    """슬롯의 파라미터로 초기 상태 생성."""
    params = dict(slot.parameters)
    params["feeRate"] = fee_rate
    params["applyFee"] = apply_fee

    split_ratios = _get_split_ratios_for_slot(slot)
    max_tiers = len(split_ratios) + 1

    return TieredStrategyState(
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


def _get_split_ratios_for_slot(slot: StrategySlot) -> list[float]:
    """전략 ID에 따른 분할 비율 반환."""
    RATIOS: dict[str, list[float]] = {
        "ddeolsapro1": [0.05, 0.10, 0.15, 0.20, 0.25, 0.25],
        "ddeolsapro2": [0.10, 0.15, 0.20, 0.25, 0.20, 0.10],
    }

    if slot.strategy_id == "ddeolsapro_custom":
        divisions = int(slot.parameters.get("divisions", 6))
        divisions = max(2, min(10, divisions))
        default_pct = round(100 / divisions, 2)
        ratios = []
        for i in range(1, divisions + 1):
            pct = float(slot.parameters.get(f"splitPct{i}", default_pct))
            ratios.append(pct / 100)
        return ratios

    return list(RATIOS.get(slot.strategy_id, [0.05, 0.10, 0.15, 0.20, 0.25, 0.25]))


def _update_state_params(state: TieredStrategyState, slot: StrategySlot) -> None:
    """스위칭 시 state의 전략 파라미터만 교체 (포지션/자금은 유지)."""
    params = slot.parameters
    state.drop_percent = float(params.get("dropPercent", 0.01))
    state.target_profit = float(params.get("targetProfit", 0.01))
    state.stop_loss_days = int(params.get("stopLossDays", 10))
    state.no_stop_loss_day_buy = params.get("stopLossDayBuy", "allow") == "block"

    new_ratios = _get_split_ratios_for_slot(slot)
    state.split_ratios = new_ratios
    new_max = len(new_ratios) + 1

    # max_tiers가 변경되면 tier_positions 조정
    if new_max != state.max_tiers:
        if new_max > state.max_tiers:
            state.tier_positions.extend([None] * (new_max - state.max_tiers))
        else:
            # 축소 시 초과 슬롯의 포지션은 유지 (청산 시 자연 해소)
            pass
        state.max_tiers = max(new_max, len(state.tier_positions))


def _update_state_params_carry(state: TieredStrategyState, slot: StrategySlot) -> None:
    """carry 모드 스위칭: 포지션 유지, cycle_seed 리셋, ratios 재매핑."""
    # 1. 전략 파라미터 교체 (매수 조건용 — 매도 기준은 포지션별)
    params = slot.parameters
    state.drop_percent = float(params.get("dropPercent", 0.01))
    state.target_profit = float(params.get("targetProfit", 0.01))
    state.stop_loss_days = int(params.get("stopLossDays", 10))
    state.no_stop_loss_day_buy = params.get("stopLossDayBuy", "allow") == "block"

    # 2. cycle_seed = 남은 현금
    state.cycle_seed = state.cash

    # 3. ratios 재매핑: 점유 슬롯→0, 빈 슬롯→새 비율 순차 배정
    new_ratios = _get_split_ratios_for_slot(slot)
    filled_set = {i for i, p in enumerate(state.tier_positions) if p is not None}

    remapped: list[float] = []
    ratio_idx = 0
    for t in range(len(state.tier_positions)):
        if t in filled_set:
            remapped.append(0.0)
        elif ratio_idx < len(new_ratios):
            remapped.append(new_ratios[ratio_idx])
            ratio_idx += 1
        else:
            remapped.append(0.0)

    # 남은 비율이 있으면 슬롯 확장
    while ratio_idx < len(new_ratios):
        remapped.append(new_ratios[ratio_idx])
        state.tier_positions.append(None)
        ratio_idx += 1

    state.split_ratios = remapped
    state.max_tiers = len(remapped) + 1  # +1 for bonus

    # tier_positions 길이 맞추기
    while len(state.tier_positions) < state.max_tiers:
        state.tier_positions.append(None)


def _liquidate_all(state: TieredStrategyState, candle_time: int, price: float) -> None:
    """모든 포지션 강제 청산."""
    for t in range(len(state.tier_positions)):
        if state.tier_positions[t] is not None:
            DdeolsaproBase._sell_tier(state, t, candle_time, price)

    # cycle_seed 리셋
    state.cycle_seed = state.cash
    state.avg_cost = 0.0
    state.total_qty = 0


def _count_open_tiers(state: TieredStrategyState) -> int:
    """현재 열려있는 티어 수."""
    return sum(1 for p in state.tier_positions if p is not None)


def _calc_segment_mdd(equity_slice: list[dict[str, float]]) -> float:
    """구간 MDD 계산."""
    if len(equity_slice) < 2:
        return 0.0
    values = np.array([e["value"] for e in equity_slice], dtype=np.float64)
    running_max = np.maximum.accumulate(values)
    safe_max = np.where(running_max == 0, 1, running_max)
    drawdowns = (running_max - values) / safe_max * 100
    return float(np.max(drawdowns))


class SwitchingEngine:
    """스위칭 백테스트 엔진."""

    def _record_segment(
        self,
        state: TieredStrategyState,
        active_slot: StrategySlot,
        segment_start_idx: int,
        segment_start_value: float,
        segment_trades_start: int,
        candle_time: int,
        portfolio_value: float,
        times_arr: np.ndarray,
        n: int,
    ) -> None:
        """현재 구간의 성과를 기록."""
        segment_equity = state.equity[segment_start_idx:]
        segment_trades_count = len(state.trades) - segment_trades_start

        if segment_equity:
            seg = SegmentResult(
                slot_id=active_slot.slot_id,
                slot_name=active_slot.name,
                strategy_id=active_slot.strategy_id,
                start_time=int(times_arr[segment_start_idx]) if segment_start_idx < n else candle_time,
                end_time=candle_time,
                start_value=segment_start_value,
                end_value=portfolio_value,
                segment_return=((portfolio_value - segment_start_value) / segment_start_value * 100)
                if segment_start_value > 0
                else 0.0,
                segment_mdd=_calc_segment_mdd(segment_equity),
                trade_count=segment_trades_count,
                candle_count=len(segment_equity),
            )
            if not hasattr(self, "_segments"):
                self._segments: list[SegmentResult] = []
            self._segments.append(seg)

    def run(
        self,
        data: pd.DataFrame,
        config: SwitchingConfig,
        initial_capital: float,
        apply_fee: bool,
        market: str = "us",
    ) -> SwitchingBacktestResponse:
        start_time = time_module.perf_counter()

        fee_rate = get_fee_rate_for_market(market)

        # 슬롯 맵 생성
        slot_map: dict[str, StrategySlot] = {s.slot_id: s for s in config.strategy_slots}
        default_slot = slot_map[config.default_slot_id]

        # 지표 계산
        data = compute_indicators(data)

        # 초기 상태
        state = _build_state_for_slot(default_slot, initial_capital, fee_rate, apply_fee)
        active_slot = default_slot
        active_trigger = None  # 현재 활성 트리거 (None이면 디폴트 상태)
        last_switch_day = -config.cooldown_days  # 첫날부터 평가 가능

        # 결과 수집
        events: list[SwitchingEvent] = []
        timeline: list[dict] = []  # {time, slotId}

        # 구간 추적
        segment_start_idx = 0
        segment_start_value = initial_capital
        segment_trades_start = 0

        times_arr = data["time"].values
        closes_arr = data["close"].values
        n = len(data)

        # 트리거를 priority 내림차순 정렬
        sorted_triggers = sorted(config.rules, key=lambda r: r.priority, reverse=True)

        for i in range(n):
            candle_time = int(times_arr[i])
            close = float(closes_arr[i])
            prev_close = float(closes_arr[i - 1]) if i > 0 else None
            row = data.iloc[i]

            # 쿨다운 경과 시 모든 룰 평가 (현재 상태 무관, 양방향 전환)
            if i - last_switch_day >= config.cooldown_days:
                for trigger in sorted_triggers:
                    if evaluate_trigger(row, trigger):
                        target_slot = slot_map.get(trigger.strategy_slot_id)
                        if target_slot and target_slot.slot_id != active_slot.slot_id:
                            portfolio_value = calc_portfolio_value(state.cash, state.total_qty, close)

                            # 구간 완료 기록
                            self._record_segment(
                                state, active_slot, segment_start_idx, segment_start_value,
                                segment_trades_start, candle_time, portfolio_value, times_arr, n,
                            )

                            # 스위칭 이벤트 기록
                            events.append(
                                SwitchingEvent(
                                    time=candle_time,
                                    day_index=i,
                                    from_slot_id=active_slot.slot_id,
                                    to_slot_id=target_slot.slot_id,
                                    trigger_id=trigger.id,
                                    trigger_name=trigger.name,
                                    indicators=get_all_indicator_values(row),
                                    portfolio_value=round(portfolio_value, 2),
                                    open_tiers=_count_open_tiers(state),
                                    event_type="switch",
                                )
                            )

                            # 포지션 처리 + 파라미터 교체
                            if config.position_handling == "liquidate":
                                _liquidate_all(state, candle_time, close)
                                _update_state_params(state, target_slot)
                            else:
                                _update_state_params_carry(state, target_slot)

                            active_slot = target_slot
                            active_trigger = trigger
                            last_switch_day = i

                            # 새 구간 시작
                            segment_start_idx = len(state.equity)
                            segment_start_value = calc_portfolio_value(state.cash, state.total_qty, close)
                            segment_trades_start = len(state.trades)
                            break

            # ③ step_candle 호출
            DdeolsaproBase.step_candle(state, i, candle_time, close, prev_close)

            # 사이클 종료 감지: 모든 포지션 없음 + ratios에 0이 있음 (carry 스위칭 상태)
            if (not any(p is not None for p in state.tier_positions)
                    and any(r == 0.0 for r in state.split_ratios)):
                fresh_ratios = _get_split_ratios_for_slot(active_slot)
                state.split_ratios = fresh_ratios
                state.max_tiers = len(fresh_ratios) + 1
                state.tier_positions = [None] * state.max_tiers

            # ④ 타임라인 기록
            timeline.append({"time": candle_time, "slotId": active_slot.slot_id})

        # 마지막 구간 기록
        if n > 0:
            last_close = float(closes_arr[-1])
            portfolio_value = calc_portfolio_value(state.cash, state.total_qty, last_close)
            self._record_segment(
                state, active_slot, segment_start_idx, segment_start_value,
                segment_trades_start, int(times_arr[-1]), portfolio_value, times_arr, n,
            )

        # 최종 청산
        if n > 0:
            last_time = int(times_arr[-1])
            last_close = float(closes_arr[-1])
            for t in range(len(state.tier_positions)):
                if state.tier_positions[t] is not None:
                    DdeolsaproBase._sell_tier(state, t, last_time, last_close)

        # 메트릭 계산
        metrics = calculate_metrics(state.trades, state.equity, initial_capital)

        execution_time = (time_module.perf_counter() - start_time) * 1000

        # 가격 데이터 변환
        price_data = [
            OHLCV(
                time=int(row["time"]),
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row.get("volume", row.get("Volume", 0))),
            )
            for _, row in data.iterrows()
        ]

        segments = getattr(self, "_segments", [])
        self._segments = []  # 리셋

        return SwitchingBacktestResponse(
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
                for t in state.trades
            ],
            equity=[{"time": e["time"], "value": e["value"]} for e in state.equity],
            cash=[{"time": c["time"], "value": c["value"]} for c in state.cash_history],
            metrics={
                "totalReturn": metrics.total_return,
                "cagr": metrics.cagr,
                "mdd": metrics.mdd,
                "winRate": metrics.win_rate,
                "sharpeRatio": metrics.sharpe_ratio,
                "totalTrades": metrics.total_trades,
            },
            price_data=[
                {
                    "time": p.time,
                    "open": p.open,
                    "high": p.high,
                    "low": p.low,
                    "close": p.close,
                    "volume": p.volume,
                }
                for p in price_data
            ],
            execution_time=round(execution_time, 2),
            switching_events=events,
            segments=segments,
            active_strategy_timeline=timeline,
        )
