"""지표 계산 및 조건 평가 (스위칭 엔진용)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.models.switching import IndicatorCondition, SwitchingTrigger


# ========== 지표 정의 ==========

AVAILABLE_INDICATORS = [
    {
        "id": "alignment",
        "label": "MA 배열",
        "type": "string",
        "operators": ["eq", "neq"],
        "values": ["정배열", "역배열"],
    },
    {
        "id": "deviation",
        "label": "20MA 이격도",
        "type": "number",
        "operators": ["gt", "gte", "lt", "lte"],
        "unit": "%",
    },
    {
        "id": "rsi",
        "label": "RSI",
        "type": "number",
        "operators": ["gt", "gte", "lt", "lte"],
        "unit": "",
    },
    {
        "id": "slope",
        "label": "Slope",
        "type": "number",
        "operators": ["gt", "gte", "lt", "lte"],
        "unit": "",
    },
    {
        "id": "roc",
        "label": "ROC",
        "type": "number",
        "operators": ["gt", "gte", "lt", "lte"],
        "unit": "",
    },
    {
        "id": "atr",
        "label": "ATR",
        "type": "number",
        "operators": ["gt", "gte", "lt", "lte"],
        "unit": "",
    },
]


# ========== 지표 계산 ==========

def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    CSV에 이미 있는 지표 컬럼은 재활용하고, 없는 것만 계산.
    파생 지표(alignment, deviation)는 항상 계산.
    """
    df = df.copy()
    close = df["close"]

    # MA20 / MA60
    if "MA_20" not in df.columns:
        df["MA_20"] = close.rolling(window=20, min_periods=20).mean()
    if "MA_60" not in df.columns:
        df["MA_60"] = close.rolling(window=60, min_periods=60).mean()

    # RSI (14)
    if "RSI" not in df.columns:
        delta = close.diff()
        gain = delta.clip(lower=0).rolling(window=14, min_periods=14).mean()
        loss = (-delta.clip(upper=0)).rolling(window=14, min_periods=14).mean()
        rs = gain / loss.replace(0, np.nan)
        df["RSI"] = 100 - (100 / (1 + rs))

    # Slope (MA20의 20일 기울기)
    if "Slope" not in df.columns:
        ma20 = df["MA_20"]
        df["Slope"] = (ma20 - ma20.shift(20)) / 20

    # ROC (Rate of Change, 20일)
    if "ROC" not in df.columns:
        df["ROC"] = close.pct_change(periods=20) * 100

    # ATR (14일)
    if "ATR" not in df.columns:
        high = df["high"]
        low = df["low"]
        prev_close = close.shift(1)
        tr = pd.concat([
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ], axis=1).max(axis=1)
        df["ATR"] = tr.rolling(window=14, min_periods=14).mean()

    # 파생 지표: alignment (항상 계산)
    ma20_vals = df["MA_20"]
    ma60_vals = df["MA_60"]
    conditions_pos = (close > ma20_vals) & (ma20_vals > ma60_vals)
    conditions_neg = (close < ma20_vals) & (ma20_vals < ma60_vals)
    df["alignment"] = np.where(
        conditions_pos, "정배열",
        np.where(conditions_neg, "역배열", None),
    )
    # NaN MA -> alignment도 NaN
    ma_nan = ma20_vals.isna() | ma60_vals.isna()
    df.loc[ma_nan, "alignment"] = None
    df["alignment"] = df["alignment"].ffill()  # 애매 구간은 이전 값 유지

    # 파생 지표: deviation (20MA 이격도, %)
    df["deviation"] = ((close - ma20_vals) / ma20_vals) * 100

    return df


def get_indicator_value(row: pd.Series, indicator_id: str) -> float | str | None:
    """행에서 지표 값 추출."""
    col_map = {
        "alignment": "alignment",
        "deviation": "deviation",
        "rsi": "RSI",
        "slope": "Slope",
        "roc": "ROC",
        "atr": "ATR",
    }
    col = col_map.get(indicator_id)
    if col is None or col not in row.index:
        return None
    val = row[col]
    if pd.isna(val):
        return None
    return val


def get_all_indicator_values(row: pd.Series) -> dict[str, float | str | None]:
    """행에서 모든 지표 값 추출 (이벤트 기록용)."""
    result: dict[str, float | str | None] = {}
    for ind in AVAILABLE_INDICATORS:
        val = get_indicator_value(row, ind["id"])
        if isinstance(val, float):
            result[ind["id"]] = round(val, 4)
        else:
            result[ind["id"]] = val
    return result


# ========== 조건 평가 ==========

def evaluate_condition(row: pd.Series, condition: IndicatorCondition) -> bool:
    """단일 조건 평가. NaN이면 False 반환."""
    val = get_indicator_value(row, condition.indicator)
    if val is None:
        return False

    target = condition.value
    op = condition.operator

    # 문자열 비교 (alignment)
    if isinstance(val, str):
        if op == "eq":
            return val == target
        if op == "neq":
            return val != target
        return False

    # 수치 비교
    try:
        target_num = float(target)
    except (ValueError, TypeError):
        return False

    val_num = float(val)

    if op == "gt":
        return val_num > target_num
    if op == "gte":
        return val_num >= target_num
    if op == "lt":
        return val_num < target_num
    if op == "lte":
        return val_num <= target_num
    if op == "eq":
        return abs(val_num - target_num) < 1e-9
    if op == "neq":
        return abs(val_num - target_num) >= 1e-9

    return False


def evaluate_trigger(row: pd.Series, trigger: SwitchingTrigger) -> bool:
    """AND/OR 로직으로 조건 결합 평가."""
    if not trigger.conditions:
        return False

    results = [evaluate_condition(row, c) for c in trigger.conditions]

    if trigger.logic == "and":
        return all(results)
    else:  # "or"
        return any(results)
