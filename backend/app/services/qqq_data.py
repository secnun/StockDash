"""
QQQ 주봉 데이터 로더 (yahoo_fetcher가 생성한 qqq_1w.csv 활용)

위대리 전략에서 QQQ 장기 추세선 판단용으로 사용.
"""

import logging
from pathlib import Path

import numpy as np
import pandas as pd

from app.core.config import get_settings
from app.services.data_loader import load_csv_pandas

logger = logging.getLogger(__name__)


def load_qqq_weekly() -> pd.DataFrame:
    """
    QQQ 주봉 종가 데이터 로드 (qqq_1w.csv).

    load_csv_pandas를 통해 원본 close 가격이 사용됨.

    Returns:
        DataFrame with columns: date (str YYYY-MM-DD), close (float)
    """
    settings = get_settings()
    csv_path = Path(settings.data_dir) / "us" / "qqq" / "qqq_1w.csv"

    if not csv_path.exists():
        raise RuntimeError(f"QQQ 주봉 데이터 파일이 없습니다: {csv_path}")

    raw = load_csv_pandas(csv_path)

    # date 컬럼 생성 (timestamp → YYYY-MM-DD)
    df = pd.DataFrame({
        "date": pd.to_datetime(raw["time"], unit="s", utc=True).dt.strftime("%Y-%m-%d"),
        "close": raw["close"].values,
    })
    df = df.dropna(subset=["close"]).reset_index(drop=True)
    return df


def calc_exponential_trendline(
    closes: np.ndarray,
    period: int = 260,
) -> float:
    """
    QQQ 종가 배열에서 지수 추세선 값 계산.

    최근 period개 데이터로 지수 회귀(ln(price) = a + b*t)를 수행하고,
    마지막 시점의 추세값을 반환.

    Args:
        closes: QQQ 주봉 종가 배열
        period: 추세선 계산 기간 (주 단위, 기본 260주 = 5년)

    Returns:
        현재 시점의 지수 추세선 값
    """
    data = closes[-period:] if len(closes) >= period else closes
    n = len(data)
    if n < 2:
        return float(data[-1]) if n == 1 else 0.0

    # 지수 회귀: ln(price) = a + b*t
    t = np.arange(n, dtype=np.float64)
    ln_prices = np.log(data.astype(np.float64))

    # 최소자승법
    coeffs = np.polyfit(t, ln_prices, 1)  # [b, a]
    trend_value = np.exp(coeffs[1] + coeffs[0] * (n - 1))

    return float(trend_value)


def get_qqq_deviation_at_date(
    qqq_df: pd.DataFrame,
    target_date: str,
    trend_period: int = 260,
) -> tuple[float, str]:
    """
    특정 날짜에서 QQQ의 추세선 대비 이탈률 계산.

    Args:
        qqq_df: QQQ 주봉 데이터 (date, close)
        target_date: 기준 날짜 (YYYY-MM-DD)
        trend_period: 추세선 기간 (주)

    Returns:
        (이탈률(%), 구간 라벨 "overvalued"/"neutral"/"undervalued")
    """
    # target_date 이전까지의 데이터만 사용
    mask = qqq_df["date"] <= target_date
    subset = qqq_df[mask]

    if len(subset) < 2:
        return 0.0, "neutral"

    closes = subset["close"].values
    trend_value = calc_exponential_trendline(closes, trend_period)

    if trend_value <= 0:
        return 0.0, "neutral"

    actual = float(closes[-1])
    deviation = ((actual - trend_value) / trend_value) * 100

    return deviation, "overvalued" if deviation > 0 else "undervalued" if deviation < 0 else "neutral"
