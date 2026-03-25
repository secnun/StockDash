"""동파법 전용 지표 계산 모듈.

QQQ 주봉 데이터 기반 안전/공세 모드 판단용 지표.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.models.dongpa import DongpaTrigger


# 사용 가능한 QQQ 주봉 지표 (프론트엔드 룰 빌더용)
DONGPA_AVAILABLE_INDICATORS: list[dict] = [
    {
        "id": "qqq_ma_cross",
        "label": "QQQ MA 배열",
        "type": "string",
        "operators": ["eq", "neq"],
        "values": ["상향돌파", "하향돌파", "위", "아래"],
    },
    {
        "id": "qqq_trend_deviation",
        "label": "QQQ 추세이격도",
        "type": "number",
        "operators": ["gt", "gte", "lt", "lte"],
        "unit": "%",
    },
    {
        "id": "qqq_weekly_roc",
        "label": "QQQ 주봉 ROC",
        "type": "number",
        "operators": ["gt", "gte", "lt", "lte"],
        "unit": "%",
    },
    {
        "id": "qqq_ma_slope",
        "label": "QQQ MA 기울기",
        "type": "number",
        "operators": ["gt", "gte", "lt", "lte"],
        "unit": "%",
    },
]


def compute_qqq_indicators(
    qqq_df: pd.DataFrame,
    ma_period: int = 10,
) -> pd.DataFrame:
    """QQQ 주봉 데이터에 지표 컬럼 추가.

    Args:
        qqq_df: QQQ 주봉 데이터 (date, close)
        ma_period: 이동평균 기간 (주)

    Returns:
        지표가 추가된 DataFrame
    """
    from app.services.indicators import calc_disparity, calc_ma, calc_roc, calc_slope

    df = qqq_df.copy()
    closes = df["close"].values.astype(np.float64)

    # MA
    ma = calc_ma(closes, ma_period)
    df["qqq_ma"] = ma

    # MA 배열 (가격 vs MA) — 동파법 전용 크로스 라벨
    cross_labels = []
    for i in range(len(closes)):
        if i == 0:
            cross_labels.append("위" if closes[i] >= ma[i] else "아래")
            continue
        prev_above = closes[i - 1] >= ma[i - 1]
        curr_above = closes[i] >= ma[i]
        if curr_above and not prev_above:
            cross_labels.append("상향돌파")
        elif not curr_above and prev_above:
            cross_labels.append("하향돌파")
        elif curr_above:
            cross_labels.append("위")
        else:
            cross_labels.append("아래")
    df["qqq_ma_cross"] = cross_labels

    df["qqq_trend_deviation"] = calc_disparity(closes, ma)
    df["qqq_weekly_roc"] = calc_roc(closes, period=1)  # 주봉이므로 1주 전 대비
    df["qqq_ma_slope"] = calc_slope(ma, lookback=1)     # 주봉이므로 1주 전 대비

    return df


def evaluate_dongpa_trigger(
    qqq_row: pd.Series,
    trigger: DongpaTrigger,
) -> bool:
    """QQQ 주봉 행에서 동파법 트리거 평가."""
    results = []
    for cond in trigger.conditions:
        indicator_val = qqq_row.get(cond.indicator)
        if indicator_val is None:
            results.append(False)
            continue

        if cond.operator == "eq":
            results.append(str(indicator_val) == str(cond.value))
        elif cond.operator == "neq":
            results.append(str(indicator_val) != str(cond.value))
        elif cond.operator == "gt":
            results.append(float(indicator_val) > float(cond.value))
        elif cond.operator == "gte":
            results.append(float(indicator_val) >= float(cond.value))
        elif cond.operator == "lt":
            results.append(float(indicator_val) < float(cond.value))
        elif cond.operator == "lte":
            results.append(float(indicator_val) <= float(cond.value))
        else:
            results.append(False)

    if not results:
        return False
    return all(results) if trigger.logic == "and" else any(results)


def get_qqq_indicator_values(qqq_row: pd.Series) -> dict[str, float | str | None]:
    """QQQ 주봉 행에서 모든 지표값 추출."""
    indicators: dict[str, float | str | None] = {}
    for ind_def in DONGPA_AVAILABLE_INDICATORS:
        ind_id = ind_def["id"]
        val = qqq_row.get(ind_id)
        if val is not None and not (isinstance(val, float) and np.isnan(val)):
            indicators[ind_id] = val if isinstance(val, str) else round(float(val), 2)
        else:
            indicators[ind_id] = None
    return indicators
