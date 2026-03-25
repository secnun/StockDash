"""떨사 Pro 추천 엔진.

현재 SOXL 장세를 분석하여 유사한 과거 패턴 Top 3를 찾고,
각 패턴에서 Pro1/2/3의 향후 성과를 시뮬레이션하여 최적 전략을 추천.

독립적 파일: 연구 종료 시 이 파일 + lab.py 엔드포인트만 제거하면 됨.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.strategies import StrategyRegistry, get_split_ratios


# ── 지표 계산 ──────────────────────────────────────────────

from app.services.indicators import (
    calc_disparity,
    calc_ma,
    calc_roc,
    calc_rsi,
    calc_slope,
    calc_volatility,
)


def _compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """SOXL 일봉 데이터에 추천용 지표 컬럼 추가."""
    out = df.copy()
    c = out["close"].values.astype(np.float64)

    out["ma20"] = calc_ma(c, 20)
    out["ma60"] = calc_ma(c, 60)

    # 정배열: MA20 > MA60
    out["ma_alignment"] = out["ma20"] > out["ma60"]
    out["ma_alignment_num"] = out["ma_alignment"].astype(float)

    out["ma20_slope"] = calc_slope(out["ma20"].values, lookback=10)
    out["ma20_disparity"] = calc_disparity(c, out["ma20"].values)
    out["rsi14"] = calc_rsi(c, 14)
    out["roc12"] = calc_roc(c, 12)
    out["volatility20"] = calc_volatility(c, 20)

    return out


# ── 유사도 계산 (윈도우 기반 + 지표 복합) ─────────────────


_INDICATOR_COLS = [
    "ma20_slope",
    "ma20_disparity",
    "rsi14",
    "roc12",
    "volatility20",
]

_WINDOW_SIZE = 20  # 약 1개월 거래일

# 지표별 유사도 가중치 (6일치 최적화: 기울기 중심)
_INDICATOR_WEIGHTS = np.array([0.7, 0.2, 0.1, 0.1, 0.07])  # slope, disparity, rsi, roc, vol
_RECENCY_WEIGHT = 0.02  # 최신성 보정 (오래된 패턴에 거리 패널티)


def _find_similar_patterns(
    df: pd.DataFrame,
    target_idx: int,
    top_n: int = 3,
    min_gap: int = 60,
    forward_days: int = 30,
    no_future: bool = False,
) -> list[dict]:
    """정배열 필터 + z-score 가중 유클리드 거리 기반 유사 패턴 Top N 검색.

    1. 현재와 동일한 정배열 상태인 날짜만 후보
    2. 5개 지표를 z-score 정규화 후 가중 유클리드 거리 계산

    Args:
        no_future: True이면 target_idx 이전 데이터만 검색 (백테스트용, look-ahead 방지)
    """
    valid_start = max(60, _WINDOW_SIZE)
    valid_end = len(df) - forward_days - 2  # forward가 idx+2에서 시작하므로 2일 추가 확보
    if no_future:
        valid_end = min(valid_end, target_idx - min_gap)

    target_aligned = bool(df.iloc[target_idx]["ma_alignment"])

    # z-score 정규화
    cols = _INDICATOR_COLS
    mat = df[cols].values.astype(np.float64)
    mean = np.nanmean(mat[valid_start:valid_end], axis=0)
    std = np.nanstd(mat[valid_start:valid_end], axis=0)
    std = np.where(std == 0, 1, std)
    norm = (mat - mean) / std
    target_vec = norm[target_idx]

    # 가중 유클리드 거리 + 최신성 보정 (정배열 필터 적용)
    distances = np.full(len(df), np.inf)
    total_len = max(target_idx - valid_start, 1)
    for i in range(valid_start, valid_end):
        if abs(i - target_idx) < min_gap:
            continue
        if bool(df.iloc[i]["ma_alignment"]) != target_aligned:
            continue
        diff = norm[i] - target_vec
        ind_dist = np.sqrt(np.sum(_INDICATOR_WEIGHTS * diff ** 2))
        age = (target_idx - i) / total_len  # 0=최근, 1=오래전
        distances[i] = ind_dist + _RECENCY_WEIGHT * age

    # Top N (겹치지 않도록 필터)
    sorted_indices = np.argsort(distances)
    selected = []
    for idx in sorted_indices:
        if distances[idx] == np.inf:
            break
        too_close = any(abs(idx - s) < min_gap for s in selected)
        if not too_close:
            selected.append(idx)
        if len(selected) >= top_n:
            break

    # 거리 → 유사도 % 변환
    results = []
    for idx in selected:
        dist = distances[idx]
        similarity = 100 / (1 + dist * 0.15)
        similarity = min(99.99, max(50.0, similarity))

        row = df.iloc[idx]
        results.append({
            "index": int(idx),
            "similarity": round(similarity, 2),
            "indicators": {
                "maAlignment": bool(row["ma_alignment"]),
                "ma20Slope": round(float(row["ma20_slope"]), 2),
                "ma20Disparity": round(float(row["ma20_disparity"]), 2),
                "rsi": round(float(row["rsi14"]), 2),
                "roc": round(float(row["roc12"]), 2),
                "volatility": round(float(row["volatility20"]), 4),
            },
        })

    return results


# ── 전략 시뮬레이션 ──────────────────────────────────────


_STRATEGIES = [
    ("ddeolsapro1", "떨사 Pro1"),
    ("ddeolsapro2", "떨사 Pro2"),
    ("ddeolsapro3", "떨사 Pro3"),
]

_DEFAULT_PARAMS = {
    "ddeolsapro1": {"dropPercent": 0.01, "targetProfit": 0.01, "stopLossDays": 10, "stopLossDayBuy": "allow"},
    "ddeolsapro2": {"dropPercent": 0.01, "targetProfit": 1.5, "stopLossDays": 10, "stopLossDayBuy": "allow"},
    "ddeolsapro3": {"dropPercent": 0.1, "targetProfit": 2.0, "stopLossDays": 12, "stopLossDayBuy": "allow"},
}


def _calendar_to_trading_days(forward_calendar_days: int) -> int:
    """캘린더일을 거래일로 변환 (주 5일 기준, 유사도 검색 valid_end용)."""
    return max(5, int(forward_calendar_days * 5 / 7))


def _find_forward_end_idx(
    df: pd.DataFrame,
    match_idx: int,
    forward_calendar_days: int,
) -> int:
    """매칭 인덱스 기준 forward_calendar_days 후의 인덱스를 찾는다.

    매칭일 timestamp + forward_calendar_days × 86400 이내의 마지막 거래일 인덱스를 반환.
    """
    match_ts = int(df.iloc[match_idx]["time"])
    # 타임존 보정: 데이터 timestamp가 ~10시간 빠르므로 +1일
    end_ts = match_ts + (forward_calendar_days + 1) * 86400
    # end_ts 이하인 마지막 인덱스 찾기
    times = df["time"].values
    candidates = np.where(times <= end_ts)[0]
    if len(candidates) == 0:
        return min(match_idx + 1, len(df))
    return int(candidates[-1]) + 1  # slice용 exclusive end


def _run_forward_backtest(
    df: pd.DataFrame,
    start_idx: int,
    forward_calendar_days: int,
    initial_capital: float = 10_000,
    market: str = "us",
    custom_params: dict[str, dict] | None = None,
) -> list[dict]:
    """start_idx+2부터 30캘린더일 이내의 실제 거래일로 Pro1/2/3 백테스트 실행.

    +2 오프셋: 매칭일 종가 확인 후 다음 거래일부터 실행 (타임존 보정 포함).
    """
    actual_start = start_idx + 2
    end_idx = _find_forward_end_idx(df, start_idx, forward_calendar_days)
    end_idx = min(end_idx, len(df))
    if actual_start >= end_idx:
        return []
    slice_df = df.iloc[actual_start:end_idx].copy().reset_index(drop=True)

    if len(slice_df) < 5:
        return []

    results = []

    for sid, sname in _STRATEGIES:
        strategy = StrategyRegistry.get(sid)
        if strategy is None:
            continue

        base = _DEFAULT_PARAMS.get(sid, {}).copy()
        if custom_params and sid in custom_params:
            base.update(custom_params[sid])
        params = {**base, "applyFee": False, "feeRate": 0}

        try:
            resp = strategy.execute(slice_df, params, initial_capital)
            total_return = resp.metrics.total_return
            mdd = resp.metrics.mdd
        except Exception:
            total_return = 0.0
            mdd = 0.0

        results.append({
            "strategyId": sid,
            "strategyName": sname,
            "totalReturn": round(total_return, 1),
            "mdd": round(-abs(mdd), 1),  # MDD는 음수로 표시
        })

    return results


# ── 종합 점수 계산 ──────────────────────────────────────


_MDD_WEIGHT = 0.0117  # MDD 지수 가중치 (5일치 역산 최적값)


def _compute_composite_scores(
    patterns: list[dict],
) -> list[dict]:
    """유사도 가중 종합 점수 계산.

    score = Σ (similarity_i × return_i × e^(mdd_i × _MDD_WEIGHT)) / Σ similarity_i

    MDD가 클수록 지수적으로 점수가 감소하여 안정적 전략을 선호.
    """
    strategy_data: dict[str, dict] = {}

    for sid, sname in _STRATEGIES:
        strategy_data[sid] = {
            "strategyId": sid,
            "strategyName": sname,
            "weightedSum": 0.0,
            "totalWeight": 0.0,
            "patternResults": [],
        }

    for pattern in patterns:
        sim = pattern["similarity"]
        for result in pattern.get("backtestResults", []):
            sid = result["strategyId"]
            if sid not in strategy_data:
                continue
            ret = result["totalReturn"]
            mdd = result["mdd"]  # 음수
            score_i = ret * np.exp(mdd * _MDD_WEIGHT)
            strategy_data[sid]["weightedSum"] += sim * score_i
            strategy_data[sid]["totalWeight"] += sim
            strategy_data[sid]["patternResults"].append({
                "patternDate": pattern.get("date", ""),
                "similarity": sim,
                "totalReturn": ret,
                "mdd": mdd,
            })

    scores = []
    for sid in strategy_data:
        d = strategy_data[sid]
        composite = (
            round(d["weightedSum"] / d["totalWeight"], 3)
            if d["totalWeight"] > 0
            else 0.0
        )
        scores.append({
            "strategyId": d["strategyId"],
            "strategyName": d["strategyName"],
            "compositeScore": composite,
            "patternResults": d["patternResults"],
            "excluded": False,
            "excludeReason": None,
        })

    return scores


# ── 메인 추천 함수 ──────────────────────────────────────


def recommend_strategy(
    df: pd.DataFrame,
    target_date: str | None = None,
    forward_days: int = 30,
    top_n: int = 3,
    alpha: float = -0.05,
    initial_capital: float = 10_000,
    market: str = "us",
    custom_params: dict[str, dict] | None = None,
) -> dict:
    """데이터를 분석하여 떨사 Pro 전략을 추천.

    Args:
        forward_days: 성과 확인 기간 (캘린더일, 기본 30일 ≈ 21거래일)
        custom_params: 전략별 파라미터 오버라이드 (예: {"ddeolsapro1": {"dropPercent": 0.02}})
    """
    from app.services.data_loader import timestamp_to_date

    # 캘린더일 → 거래일 변환
    trading_days = _calendar_to_trading_days(forward_days)

    df_ind = _compute_indicators(df)

    if target_date:
        from datetime import datetime
        target_ts = int(datetime.strptime(target_date, "%Y-%m-%d").timestamp())
        diffs = np.abs(df_ind["time"].values - target_ts)
        matched_idx = int(np.argmin(diffs))
        matched_ts = int(df_ind.iloc[matched_idx]["time"])
        # 전일 종가 기준: 기준일이 데이터에 있으면 전거래일(-1) 사용,
        # 기준일이 데이터에 없으면 가장 가까운 이전 날짜가 이미 전일
        if matched_ts >= target_ts:
            target_idx = max(0, matched_idx - 1)
        else:
            target_idx = matched_idx
    else:
        # 기본: 마지막 데이터 사용 (오늘 기준 = 가장 최근 종가가 이미 전일)
        target_idx = len(df_ind) - 1

    target_row = df_ind.iloc[target_idx]
    # 기준일 = 전일 데이터의 다음 거래일 (추천을 적용할 날)
    if target_idx + 1 < len(df_ind):
        current_date = timestamp_to_date(int(df_ind.iloc[target_idx + 1]["time"]))
    else:
        # 마지막 데이터면 다음 영업일 추정 (+1~3일)
        from datetime import datetime, timedelta
        last_dt = datetime.utcfromtimestamp(int(target_row["time"]))
        next_day = last_dt + timedelta(days=1)
        while next_day.weekday() >= 5:  # 주말 스킵
            next_day += timedelta(days=1)
        current_date = next_day.strftime("%Y-%m-%d")
    current_indicators = {
        "maAlignment": bool(target_row["ma_alignment"]),
        "ma20Slope": round(float(target_row["ma20_slope"]), 2),
        "ma20Disparity": round(float(target_row["ma20_disparity"]), 2),
        "rsi": round(float(target_row["rsi14"]), 2),
        "roc": round(float(target_row["roc12"]), 2),
        "volatility": round(float(target_row["volatility20"]), 4),
    }

    # 현재 장세 차트 데이터
    lookback = _WINDOW_SIZE
    chart_start = max(0, target_idx - lookback)
    current_chart = []
    for i in range(chart_start, target_idx + 1):
        row = df_ind.iloc[i]
        current_chart.append({
            "time": int(row["time"]),
            "close": round(float(row["close"]), 2),
            "ma20": round(float(row["ma20"]), 2),
            "ma60": round(float(row["ma60"]), 2),
        })

    analysis_start = timestamp_to_date(int(df_ind.iloc[chart_start]["time"]))
    analysis_end = timestamp_to_date(int(df_ind.iloc[target_idx]["time"]))

    # 유사 패턴 검색
    similar = _find_similar_patterns(
        df_ind, target_idx, top_n=top_n, forward_days=trading_days,
    )

    # 각 패턴에 대해 forward 백테스트 실행
    for pattern in similar:
        idx = pattern["index"]
        lookback_start = max(0, idx - lookback)
        pattern["date"] = timestamp_to_date(int(df_ind.iloc[lookback_start]["time"]))
        pattern["dateEnd"] = timestamp_to_date(int(df_ind.iloc[idx]["time"]))

        fwd_end_idx = min(_find_forward_end_idx(df_ind, idx, forward_days), len(df_ind)) - 1
        fwd_end_idx = max(fwd_end_idx, idx)
        pattern["forwardStart"] = timestamp_to_date(int(df_ind.iloc[idx]["time"]))
        pattern["forwardEnd"] = timestamp_to_date(int(df_ind.iloc[fwd_end_idx]["time"]))

        chart_end = fwd_end_idx + 1
        chart_data = []
        for i in range(lookback_start, chart_end):
            row = df_ind.iloc[i]
            chart_data.append({
                "time": int(row["time"]),
                "close": round(float(row["close"]), 2),
                "ma20": round(float(row["ma20"]), 2),
                "ma60": round(float(row["ma60"]), 2),
            })
        pattern["chartData"] = chart_data
        pattern["splitIndex"] = idx - lookback_start

        pattern["backtestResults"] = _run_forward_backtest(
            df_ind, idx, forward_days, initial_capital, market, custom_params,
        )

    # 종합 점수
    scores = _compute_composite_scores(similar)

    # 정배열 시 Pro1 제외
    is_aligned = current_indicators["maAlignment"]
    for s in scores:
        if s["strategyId"] == "ddeolsapro1" and is_aligned:
            s["excluded"] = True
            s["excludeReason"] = "정배열의 경우 제외"

    candidates = [s for s in scores if not s["excluded"]]
    if not candidates:
        candidates = scores

    best = max(candidates, key=lambda x: x["compositeScore"])

    return {
        "currentDate": current_date,
        "analysisStart": analysis_start,
        "analysisEnd": analysis_end,
        "currentIndicators": current_indicators,
        "currentChart": current_chart,
        "similarPatterns": similar,
        "strategyScores": scores,
        "recommendation": best["strategyId"],
        "recommendationName": best["strategyName"],
    }


# ── 레이더 백테스트 ──────────────────────────────────────




def _recommend_at_point(
    df_ind: pd.DataFrame,
    target_idx: int,
    forward_days: int = 30,
    top_n: int = 3,
    initial_capital: float = 10_000,
    market: str = "us",
    custom_params: dict[str, dict] | None = None,
    no_future: bool = False,
) -> tuple[str, str]:
    """지정 시점에서 레이더 추천 전략을 계산.

    Args:
        no_future: True이면 과거 데이터만으로 추천 (백테스트용)

    Returns:
        (strategy_id, strategy_name) 튜플
    """
    trading_days = _calendar_to_trading_days(forward_days)

    similar = _find_similar_patterns(
        df_ind, target_idx, top_n=top_n, forward_days=trading_days,
        no_future=no_future,
    )

    if not similar:
        return "ddeolsapro3", "떨사 Pro3"

    for pattern in similar:
        idx = pattern["index"]
        pattern["backtestResults"] = _run_forward_backtest(
            df_ind, idx, forward_days, initial_capital, market, custom_params,
        )

    scores = _compute_composite_scores(similar)

    # 정배열 시 Pro1 제외
    is_aligned = bool(df_ind.iloc[target_idx]["ma_alignment"])
    for s in scores:
        if s["strategyId"] == "ddeolsapro1" and is_aligned:
            s["excluded"] = True
            s["excludeReason"] = "정배열의 경우 제외"

    candidates = [s for s in scores if not s["excluded"]]
    if not candidates:
        candidates = scores

    best = max(candidates, key=lambda x: x["compositeScore"])
    return best["strategyId"], best["strategyName"]


def _build_radar_state(
    strategy_id: str,
    initial_capital: float,
    fee_rate: float,
    apply_fee: bool,
    custom_params: dict[str, dict] | None = None,
) -> "TieredStrategyState":
    """레이더 백테스트용 초기 상태 생성."""
    from app.strategies.ddeolsapro_base import TieredStrategyState

    base = _DEFAULT_PARAMS.get(strategy_id, _DEFAULT_PARAMS["ddeolsapro3"]).copy()
    if custom_params and strategy_id in custom_params:
        base.update(custom_params[strategy_id])

    ratios = list(get_split_ratios(strategy_id))
    max_tiers = len(ratios) + 1

    return TieredStrategyState(
        cash=initial_capital,
        cycle_seed=initial_capital,
        avg_cost=0.0,
        total_qty=0,
        tier_positions=[None] * max_tiers,
        fee_rate=fee_rate,
        apply_fee=apply_fee,
        drop_percent=float(base.get("dropPercent", 0.01)),
        target_profit=float(base.get("targetProfit", 0.01)),
        stop_loss_days=int(base.get("stopLossDays", 10)),
        no_stop_loss_day_buy=base.get("stopLossDayBuy", "allow") == "block",
        split_ratios=ratios,
        max_tiers=max_tiers,
    )


def _update_radar_state_params(
    state: "TieredStrategyState",
    strategy_id: str,
    custom_params: dict[str, dict] | None = None,
) -> None:
    """무포지션 전환 시 전략 파라미터 교체 (자금·포지션 유지)."""
    base = _DEFAULT_PARAMS.get(strategy_id, _DEFAULT_PARAMS["ddeolsapro3"]).copy()
    if custom_params and strategy_id in custom_params:
        base.update(custom_params[strategy_id])

    state.drop_percent = float(base.get("dropPercent", 0.01))
    state.target_profit = float(base.get("targetProfit", 0.01))
    state.stop_loss_days = int(base.get("stopLossDays", 10))
    state.no_stop_loss_day_buy = base.get("stopLossDayBuy", "allow") == "block"

    new_ratios = list(get_split_ratios(strategy_id))
    state.split_ratios = new_ratios
    state.max_tiers = len(new_ratios) + 1
    state.tier_positions = [None] * state.max_tiers


def _run_radar_period(
    df_ind: pd.DataFrame,
    start_idx: int,
    end_idx: int,
    capital: float,
    forward_days: int,
    top_n: int,
    market: str,
    custom_params: dict[str, dict] | None,
) -> tuple[float, float, int]:
    """단일 기간 레이더 백테스트 실행.

    Returns:
        (final_value, mdd, total_trades)
    """
    from app.services.metrics import _calculate_mdd
    from app.strategies.ddeolsapro_base import DdeolsaproBase
    from app.strategies.utils import calc_portfolio_value

    times = df_ind["time"].values
    closes = df_ind["close"].values

    # 초기 추천
    rec_id, _ = _recommend_at_point(
        df_ind, start_idx - 1, forward_days, top_n,
        capital, market, custom_params, no_future=True,
    )

    state = _build_radar_state(rec_id, capital, 0, False, custom_params)
    active_id = rec_id
    need_recommendation = False
    had_position_prev = False

    for i in range(start_idx, end_idx + 1):
        candle_time = int(times[i])
        close = float(closes[i])
        prev_close = float(closes[i - 1]) if i > 0 else None

        if need_recommendation:
            rec_id, _ = _recommend_at_point(
                df_ind, i - 1, forward_days, top_n,
                capital, market, custom_params, no_future=True,
            )
            _update_radar_state_params(state, rec_id, custom_params)
            active_id = rec_id
            need_recommendation = False

        DdeolsaproBase.step_candle(state, i, candle_time, close, prev_close)

        has_position = any(p is not None for p in state.tier_positions)
        if had_position_prev and not has_position:
            need_recommendation = True
        had_position_prev = has_position

    # 최종 청산
    last_time = int(times[end_idx])
    last_close = float(closes[end_idx])
    for t in range(len(state.tier_positions)):
        if state.tier_positions[t] is not None:
            DdeolsaproBase._sell_tier(state, t, last_time, last_close)

    # MDD 계산
    equity_values = np.array([e["value"] for e in state.equity]) if state.equity else np.array([capital])
    mdd = abs(_calculate_mdd(equity_values))

    final_value = calc_portfolio_value(state.cash, state.total_qty, last_close)
    return final_value, mdd, len(state.trades)


def _build_yearly_independent(
    df_ind: pd.DataFrame,
    initial_capital: float,
    forward_days: int,
    top_n: int,
    market: str,
    custom_params: dict[str, dict] | None,
) -> dict:
    """연도별 독립 레이더 백테스트 (시드 리셋 + 시드 이월).

    각 연도를 독립적으로 실행하며, 유사 패턴 매칭에는 전체 데이터를 활용.
    패턴 매칭 데이터가 부족한 초기 연도(global index < 120)는 skip.
    """
    times = df_ind["time"].values
    years_arr = pd.to_datetime(times, unit="s").year.values
    unique_years = sorted(set(years_arr))

    min_start = max(60, _WINDOW_SIZE)
    # 패턴 매칭에 충분한 히스토리 필요: 약 2년(504거래일) 이상
    # valid_start(60) + 충분한 후보 범위 + min_gap(60) = ~500
    min_pattern_idx = 500

    seed_reset: list[dict] = []
    seed_carry: list[dict] = []
    carry_capital = initial_capital

    for year in unique_years:
        year_mask = years_arr == year
        year_indices = np.where(year_mask)[0]
        if len(year_indices) == 0:
            continue

        year_start = int(year_indices[0])
        year_end = int(year_indices[-1])

        effective_start = max(year_start, min_start)

        # 패턴 매칭 데이터 부족 → skip
        if effective_start < min_pattern_idx or effective_start > year_end:
            seed_reset.append({
                "label": str(year),
                "startValue": round(initial_capital, 2),
                "endValue": round(initial_capital, 2),
                "totalReturn": None,  # skip 표시
                "mdd": None,
                "totalTrades": 0,
            })
            seed_carry.append({
                "label": str(year),
                "startValue": round(carry_capital, 2),
                "endValue": round(carry_capital, 2),
                "totalReturn": None,
                "mdd": None,
                "totalTrades": 0,
            })
            continue

        # 시드 리셋
        reset_final, reset_mdd, reset_trades = _run_radar_period(
            df_ind, effective_start, year_end,
            initial_capital, forward_days, top_n, market, custom_params,
        )
        reset_return = ((reset_final - initial_capital) / initial_capital) * 100

        seed_reset.append({
            "label": str(year),
            "startValue": round(initial_capital, 2),
            "endValue": round(reset_final, 2),
            "totalReturn": round(reset_return, 2),
            "mdd": round(reset_mdd, 2),
            "totalTrades": reset_trades,
        })

        # 시드 이월
        carry_final, carry_mdd, carry_trades = _run_radar_period(
            df_ind, effective_start, year_end,
            carry_capital, forward_days, top_n, market, custom_params,
        )
        carry_return = ((carry_final - carry_capital) / carry_capital) * 100 if carry_capital > 0 else 0.0

        seed_carry.append({
            "label": str(year),
            "startValue": round(carry_capital, 2),
            "endValue": round(carry_final, 2),
            "totalReturn": round(carry_return, 2),
            "mdd": round(carry_mdd, 2),
            "totalTrades": carry_trades,
        })

        carry_capital = carry_final

    return {
        "granularity": "yearly",
        "seedReset": seed_reset,
        "seedCarry": seed_carry,
    }


def run_radar_backtest(
    df: pd.DataFrame,
    start_date: str | None = None,
    end_date: str | None = None,
    initial_capital: float = 10_000,
    forward_days: int = 30,
    top_n: int = 3,
    market: str = "us",
    custom_params: dict[str, dict] | None = None,
) -> dict:
    """레이더 추천 기반 백테스트.

    무포지션 시점마다 레이더가 추천하는 전략으로 전환하여 매매.
    """
    import time as time_module

    from app.services.data_loader import timestamp_to_date
    from app.services.metrics import calculate_metrics
    from app.strategies.ddeolsapro_base import DdeolsaproBase
    from app.strategies.utils import calc_portfolio_value

    start_time = time_module.perf_counter()

    # 전체 데이터에 지표 계산 (한 번만)
    df_ind = _compute_indicators(df)

    # 시작/종료 인덱스 결정
    min_start = max(60, _WINDOW_SIZE)

    if start_date:
        from datetime import datetime

        start_ts = int(datetime.strptime(start_date, "%Y-%m-%d").timestamp())
        start_idx = int(np.argmin(np.abs(df_ind["time"].values - start_ts)))
    else:
        start_idx = min_start

    if end_date:
        from datetime import datetime

        end_ts = int(datetime.strptime(end_date, "%Y-%m-%d").timestamp())
        end_idx = int(np.argmin(np.abs(df_ind["time"].values - end_ts)))
    else:
        end_idx = len(df_ind) - 1

    start_idx = max(start_idx, min_start)

    times = df_ind["time"].values
    closes = df_ind["close"].values

    # 초기 추천 (전일 종가 기준: 당일 종가는 아직 모르므로 i-1 사용)
    rec_id, rec_name = _recommend_at_point(
        df_ind, start_idx - 1, forward_days, top_n,
        initial_capital, market, custom_params, no_future=True,
    )

    # 초기 상태 생성 (수수료 없음)
    state = _build_radar_state(rec_id, initial_capital, 0, False, custom_params)
    active_id = rec_id
    active_name = rec_name

    switching_events: list[dict] = []
    strategy_timeline: list[dict] = []
    need_recommendation = False
    had_position_prev = False

    switching_events.append({
        "time": int(times[start_idx]),
        "dayIndex": 0,
        "fromStrategyId": None,
        "fromStrategyName": None,
        "toStrategyId": active_id,
        "toStrategyName": active_name,
        "portfolioValue": initial_capital,
        "eventType": "initial",
    })

    # 캔들별 실행
    for i in range(start_idx, end_idx + 1):
        candle_time = int(times[i])
        close = float(closes[i])
        prev_close = float(closes[i - 1]) if i > 0 else None
        local_idx = i - start_idx

        # 무포지션 전환 감지 → 새 추천 (전일 종가 기준)
        if need_recommendation:
            old_id, old_name = active_id, active_name

            rec_id, rec_name = _recommend_at_point(
                df_ind, i - 1, forward_days, top_n,
                initial_capital, market, custom_params, no_future=True,
            )

            _update_radar_state_params(state, rec_id, custom_params)
            active_id, active_name = rec_id, rec_name
            need_recommendation = False

            portfolio_value = calc_portfolio_value(state.cash, state.total_qty, close)
            switching_events.append({
                "time": candle_time,
                "dayIndex": local_idx,
                "fromStrategyId": old_id,
                "fromStrategyName": old_name,
                "toStrategyId": rec_id,
                "toStrategyName": rec_name,
                "portfolioValue": round(portfolio_value, 2),
                "eventType": "switch",
            })

        # step_candle (global index로 stop-loss 계산 정확)
        DdeolsaproBase.step_candle(state, i, candle_time, close, prev_close)

        # 사이클 종료 감지 (포지션 있음 → 없음 전환)
        has_position = any(p is not None for p in state.tier_positions)
        if had_position_prev and not has_position:
            need_recommendation = True
        had_position_prev = has_position

        strategy_timeline.append({
            "time": candle_time,
            "strategyId": active_id,
        })

    # 최종 청산
    if end_idx >= start_idx:
        last_time = int(times[end_idx])
        last_close = round(float(closes[end_idx]), 2)
        for t in range(len(state.tier_positions)):
            if state.tier_positions[t] is not None:
                DdeolsaproBase._sell_tier(state, t, last_time, last_close)

    # 메트릭 계산
    metrics = calculate_metrics(state.trades, state.equity, initial_capital)

    # 연도별 독립 실행
    yearly_independent = _build_yearly_independent(
        df_ind, initial_capital, forward_days, top_n, market, custom_params,
    )

    execution_time = (time_module.perf_counter() - start_time) * 1000

    return {
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
            for t in state.trades
        ],
        "equity": state.equity,
        "cash": state.cash_history,
        "metrics": {
            "totalReturn": metrics.total_return,
            "cagr": metrics.cagr,
            "mdd": metrics.mdd,
            "winRate": metrics.win_rate,
            "sharpeRatio": metrics.sharpe_ratio,
            "totalTrades": metrics.total_trades,
        },
        "switchingEvents": switching_events,
        "strategyTimeline": strategy_timeline,
        "yearlyIndependent": yearly_independent,
        "executionTime": round(execution_time, 2),
    }
