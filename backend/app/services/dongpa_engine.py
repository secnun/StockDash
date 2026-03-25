"""동파법 백테스트 엔진.

QQQ 주봉 데이터로 안전/공세 모드를 판단하고,
SOXL 일봉에서 해당 모드의 떨사프로 전략으로 매매합니다.
"""

from __future__ import annotations

import time as time_module
from datetime import datetime

import numpy as np
import pandas as pd

from app.models.backtest import OHLCV
from app.models.dongpa import (
    DongpaBacktestResponse,
    DongpaConfig,
    DongpaMode,
    DongpaModeEvent,
    DongpaSegmentResult,
)
from app.services.dongpa_indicators import (
    compute_qqq_indicators,
    evaluate_dongpa_trigger,
    get_qqq_indicator_values,
)
from app.services.metrics import calculate_metrics
from app.services.qqq_data import load_qqq_weekly
from app.strategies.base import TierPosition
from app.strategies.ddeolsapro_base import DdeolsaproBase, TieredStrategyState
from app.strategies import get_split_ratios
from app.strategies.utils import (
    calc_portfolio_value,
    get_fee_rate_for_market,
)


def _get_split_ratios_for_mode(mode: DongpaMode) -> list[float]:
    """전략 ID에 따른 분할 비율 반환."""
    if mode.strategy_id == "ddeolsapro_custom":
        divisions = int(mode.parameters.get("divisions", 6))
        divisions = max(2, min(10, divisions))
        default_pct = round(100 / divisions, 2)
        ratios = []
        for i in range(1, divisions + 1):
            pct = float(mode.parameters.get(f"splitPct{i}", default_pct))
            ratios.append(pct / 100)
        return ratios

    return get_split_ratios(mode.strategy_id)


def _build_state_for_mode(
    mode: DongpaMode,
    initial_capital: float,
    fee_rate: float,
    apply_fee: bool,
) -> TieredStrategyState:
    """모드 파라미터로 초기 상태 생성."""
    params = dict(mode.parameters)
    split_ratios = _get_split_ratios_for_mode(mode)
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


def _update_state_params_carry(state: TieredStrategyState, mode: DongpaMode) -> None:
    """carry 모드: 포지션 유지, cycle_seed 리셋, ratios 재매핑."""
    params = mode.parameters
    state.drop_percent = float(params.get("dropPercent", 0.01))
    state.target_profit = float(params.get("targetProfit", 0.01))
    state.stop_loss_days = int(params.get("stopLossDays", 10))
    state.no_stop_loss_day_buy = params.get("stopLossDayBuy", "allow") == "block"

    state.cycle_seed = state.cash

    new_ratios = _get_split_ratios_for_mode(mode)
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

    while ratio_idx < len(new_ratios):
        remapped.append(new_ratios[ratio_idx])
        state.tier_positions.append(None)
        ratio_idx += 1

    state.split_ratios = remapped
    state.max_tiers = len(remapped) + 1

    while len(state.tier_positions) < state.max_tiers:
        state.tier_positions.append(None)


def _liquidate_all(state: TieredStrategyState, candle_time: int, price: float) -> None:
    """모든 포지션 강제 청산."""
    price = round(price, 2)
    for t in range(len(state.tier_positions)):
        if state.tier_positions[t] is not None:
            DdeolsaproBase._sell_tier(state, t, candle_time, price)
    state.cycle_seed = state.cash
    state.avg_cost = 0.0
    state.total_qty = 0


def _update_state_params(state: TieredStrategyState, mode: DongpaMode) -> None:
    """스위칭 시 state의 전략 파라미터만 교체."""
    params = mode.parameters
    state.drop_percent = float(params.get("dropPercent", 0.01))
    state.target_profit = float(params.get("targetProfit", 0.01))
    state.stop_loss_days = int(params.get("stopLossDays", 10))
    state.no_stop_loss_day_buy = params.get("stopLossDayBuy", "allow") == "block"

    new_ratios = _get_split_ratios_for_mode(mode)
    state.split_ratios = new_ratios
    new_max = len(new_ratios) + 1

    if new_max != state.max_tiers:
        if new_max > state.max_tiers:
            state.tier_positions.extend([None] * (new_max - state.max_tiers))
        state.max_tiers = max(new_max, len(state.tier_positions))


def _count_open_tiers(state: TieredStrategyState) -> int:
    return sum(1 for p in state.tier_positions if p is not None)


def _calc_segment_mdd(equity_slice: list[dict[str, float]]) -> float:
    if len(equity_slice) < 2:
        return 0.0
    from app.services.indicators import calc_mdd

    values = np.array([e["value"] for e in equity_slice], dtype=np.float64)
    return calc_mdd(values)


def _find_qqq_week_for_date(qqq_dates: list[str], target_date: str) -> int | None:
    """SOXL 일봉 날짜에 해당하는 QQQ 주봉 인덱스 찾기 (해당 주 이전 최근 주봉)."""
    for i in range(len(qqq_dates) - 1, -1, -1):
        if qqq_dates[i] <= target_date:
            return i
    return None


class DongpaEngine:
    """동파법 백테스트 엔진."""

    def __init__(self) -> None:
        self._segments: list[DongpaSegmentResult] = []

    def _record_segment(
        self,
        state: TieredStrategyState,
        active_mode: DongpaMode,
        segment_start_idx: int,
        segment_start_value: float,
        segment_trades_start: int,
        candle_time: int,
        portfolio_value: float,
    ) -> None:
        segment_equity = state.equity[segment_start_idx:]
        segment_trades_count = len(state.trades) - segment_trades_start

        if segment_equity:
            seg = DongpaSegmentResult(
                mode_id=active_mode.mode_id,
                mode_name=active_mode.name,
                strategy_id=active_mode.strategy_id,
                start_time=segment_equity[0]["time"] if segment_equity else candle_time,
                end_time=candle_time,
                start_value=segment_start_value,
                end_value=portfolio_value,
                segment_return=(
                    (portfolio_value - segment_start_value) / segment_start_value * 100
                    if segment_start_value > 0
                    else 0.0
                ),
                segment_mdd=_calc_segment_mdd(segment_equity),
                trade_count=segment_trades_count,
                candle_count=len(segment_equity),
            )
            self._segments.append(seg)

    def run(
        self,
        soxl_data: pd.DataFrame,
        config: DongpaConfig,
        initial_capital: float,
        apply_fee: bool,
        market: str = "us",
    ) -> DongpaBacktestResponse:
        start_time = time_module.perf_counter()

        fee_rate = get_fee_rate_for_market(market)

        # QQQ 주봉 데이터 로드 및 지표 계산
        qqq_raw = load_qqq_weekly()
        qqq_df = compute_qqq_indicators(qqq_raw, ma_period=config.qqq_ma_period)
        qqq_dates = qqq_df["date"].tolist()

        # 모드 맵 생성
        mode_map: dict[str, DongpaMode] = {m.mode_id: m for m in config.modes}
        default_mode = mode_map[config.default_mode_id]

        # 초기 상태
        state = _build_state_for_mode(default_mode, initial_capital, fee_rate, apply_fee)
        active_mode = default_mode

        # 결과 수집
        events: list[DongpaModeEvent] = []
        timeline: list[dict] = []

        # 구간 추적
        segment_start_idx = 0
        segment_start_value = initial_capital
        segment_trades_start = 0

        times_arr = soxl_data["time"].values
        closes_arr = soxl_data["close"].values
        n = len(soxl_data)

        # 트리거 우선순위 정렬
        sorted_triggers = sorted(config.triggers, key=lambda t: t.priority, reverse=True)

        # 마지막으로 모드 전환한 QQQ 주봉 인덱스 (중복 전환 방지)
        last_switch_qqq_idx = -1

        for i in range(n):
            candle_time = int(times_arr[i])
            close = float(closes_arr[i])
            prev_close = float(closes_arr[i - 1]) if i > 0 else None

            # SOXL 일봉 날짜 → QQQ 주봉 매핑
            soxl_date = datetime.utcfromtimestamp(candle_time).strftime("%Y-%m-%d")
            qqq_idx = _find_qqq_week_for_date(qqq_dates, soxl_date)

            # 새로운 주봉이 갱신되었을 때만 모드 전환 평가
            if qqq_idx is not None and qqq_idx > last_switch_qqq_idx:
                qqq_row = qqq_df.iloc[qqq_idx]

                for trigger in sorted_triggers:
                    if evaluate_dongpa_trigger(qqq_row, trigger):
                        target_mode = mode_map.get(trigger.target_mode_id)
                        if target_mode and target_mode.mode_id != active_mode.mode_id:
                            portfolio_value = calc_portfolio_value(state.cash, state.total_qty, close)

                            # 구간 완료 기록
                            self._record_segment(
                                state, active_mode, segment_start_idx, segment_start_value,
                                segment_trades_start, candle_time, portfolio_value,
                            )

                            # 모드 전환 이벤트
                            events.append(
                                DongpaModeEvent(
                                    time=candle_time,
                                    day_index=i,
                                    from_mode_id=active_mode.mode_id,
                                    to_mode_id=target_mode.mode_id,
                                    trigger_id=trigger.id,
                                    trigger_name=trigger.name,
                                    qqq_indicators=get_qqq_indicator_values(qqq_row),
                                    portfolio_value=round(portfolio_value, 2),
                                    open_tiers=_count_open_tiers(state),
                                )
                            )

                            # 포지션 처리
                            if config.position_handling == "liquidate":
                                _liquidate_all(state, candle_time, close)
                                _update_state_params(state, target_mode)
                            else:
                                _update_state_params_carry(state, target_mode)

                            active_mode = target_mode
                            last_switch_qqq_idx = qqq_idx

                            # 새 구간 시작
                            segment_start_idx = len(state.equity)
                            segment_start_value = calc_portfolio_value(state.cash, state.total_qty, close)
                            segment_trades_start = len(state.trades)
                            break

            # step_candle 호출
            DdeolsaproBase.step_candle(state, i, candle_time, close, prev_close)

            # carry 사이클 종료 감지
            if (
                not any(p is not None for p in state.tier_positions)
                and any(r == 0.0 for r in state.split_ratios)
            ):
                fresh_ratios = _get_split_ratios_for_mode(active_mode)
                state.split_ratios = fresh_ratios
                state.max_tiers = len(fresh_ratios) + 1
                state.tier_positions = [None] * state.max_tiers

            timeline.append({"time": candle_time, "modeId": active_mode.mode_id})

        # 마지막 구간 기록
        if n > 0:
            last_close = float(closes_arr[-1])
            portfolio_value = calc_portfolio_value(state.cash, state.total_qty, last_close)
            self._record_segment(
                state, active_mode, segment_start_idx, segment_start_value,
                segment_trades_start, int(times_arr[-1]), portfolio_value,
            )

        # 최종 청산
        if n > 0:
            last_time = int(times_arr[-1])
            last_close = round(float(closes_arr[-1]), 2)
            for t in range(len(state.tier_positions)):
                if state.tier_positions[t] is not None:
                    DdeolsaproBase._sell_tier(state, t, last_time, last_close)

        # 메트릭 계산
        metrics = calculate_metrics(state.trades, state.equity, initial_capital)

        execution_time = (time_module.perf_counter() - start_time) * 1000

        # 가격 데이터 변환
        price_data = [
            {
                "time": int(row["time"]),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row.get("volume", row.get("Volume", 0))),
            }
            for _, row in soxl_data.iterrows()
        ]

        # QQQ 주봉 데이터 (차트용)
        qqq_chart_data = [
            {
                "date": row["date"],
                "close": round(float(row["close"]), 2),
                "ma": round(float(row["qqq_ma"]), 2) if not np.isnan(row["qqq_ma"]) else None,
                "maCross": row["qqq_ma_cross"],
                "trendDeviation": round(float(row["qqq_trend_deviation"]), 2),
                "weeklyRoc": round(float(row["qqq_weekly_roc"]), 2),
                "maSlope": round(float(row["qqq_ma_slope"]), 2),
            }
            for _, row in qqq_df.iterrows()
        ]

        segments = self._segments
        self._segments = []

        return DongpaBacktestResponse(
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
            price_data=price_data,
            execution_time=round(execution_time, 2),
            mode_events=events,
            segments=segments,
            active_mode_timeline=timeline,
            qqq_weekly_data=qqq_chart_data,
        )


# ===== 옵티마이저 헬퍼 함수 =====


def build_dongpa_combinations(
    condition_ranges: list,
    dongpa_config: "DongpaConfig",
) -> list[list[list]]:
    """조건 값 조합 생성.

    Args:
        condition_ranges: DongpaConditionRange 목록
        dongpa_config: 기본 DongpaConfig
    """
    import itertools
    from app.optimizers.utils import generate_range_values

    per_condition_values: list[list[list]] = []
    for cr in condition_ranges:
        ti = cr.trigger_index
        ci = cr.condition_index
        if cr.min_value is not None and cr.max_value is not None and cr.step is not None:
            per_condition_values.append(
                [[ti, ci, v] for v in generate_range_values(cr.min_value, cr.max_value, cr.step)]
            )
        else:
            triggers = dongpa_config.triggers
            if ti < len(triggers) and ci < len(triggers[ti].conditions):
                val = triggers[ti].conditions[ci].value
            else:
                val = 0
            per_condition_values.append([[ti, ci, val]])

    combinations: list[list[list]] = []
    for cond_combo in itertools.product(*per_condition_values):
        combinations.append(list(cond_combo))

    return combinations


def compute_dongpa_score(
    metrics: dict,
    switch_count: int,
    candle_count: int,
) -> float:
    """복합 점수 계산."""
    total_return = metrics.get("totalReturn", 0.0)
    mdd = metrics.get("mdd", 0.0)
    sharpe = metrics.get("sharpeRatio", 0.0)

    return_factor = total_return / 100.0
    mdd_penalty = max(1.0, abs(mdd) / 10.0)
    annual_switch_freq = (switch_count / max(1, candle_count)) * 252
    switch_penalty = 1.0 + 0.1 * annual_switch_freq

    numerator = sharpe + return_factor
    denominator = mdd_penalty * switch_penalty

    return numerator / max(0.001, denominator)


def run_dongpa_single_worker(
    data_path: str,
    start_date: str | None,
    end_date: str | None,
    initial_capital: float,
    apply_fee: bool,
    market: str,
    config_dict: dict,
    condition_mappings: list[list],
) -> dict | None:
    """단일 동파법 백테스트 (ProcessPoolExecutor 워커용)."""
    import logging as _logging
    from pathlib import Path as _Path

    _logger = _logging.getLogger(__name__)

    try:
        from app.models.dongpa import DongpaConfig as _DongpaConfig
        from app.services.data_loader import filter_by_date_range as _filter, load_csv_pandas as _load

        config = _DongpaConfig(**config_dict)
        for mapping in condition_mappings:
            ti, ci, val = mapping[0], mapping[1], mapping[2]
            if ti < len(config.triggers) and ci < len(config.triggers[ti].conditions):
                config.triggers[ti].conditions[ci].value = val

        df = _load(_Path(data_path))
        df = _filter(df, start_date, end_date)
        if len(df) == 0:
            return None

        engine = DongpaEngine()
        result = engine.run(
            soxl_data=df,
            config=config,
            initial_capital=initial_capital,
            apply_fee=apply_fee,
            market=market,
        )

        metrics = result.metrics
        composite_score = compute_dongpa_score(
            metrics, len(result.mode_events), len(df),
        )

        condition_values = [
            {"triggerIndex": m[0], "conditionIndex": m[1], "value": m[2]}
            for m in condition_mappings
        ]

        return {
            "condition_values": condition_values,
            "total_return": round(metrics.get("totalReturn", 0.0), 2),
            "cagr": round(metrics.get("cagr", 0.0), 2),
            "mdd": round(metrics.get("mdd", 0.0), 2),
            "sharpe_ratio": round(metrics.get("sharpeRatio", 0.0), 4),
            "win_rate": round(metrics.get("winRate", 0.0), 2),
            "total_trades": metrics.get("totalTrades", 0),
            "switch_count": len(result.mode_events),
            "composite_score": round(composite_score, 4),
        }
    except Exception:
        _logger.error(
            "Dongpa single backtest failed: mappings=%s",
            condition_mappings, exc_info=True,
        )
        return None
