"""공용 기술적 지표 계산 모듈.

모든 지표 함수는 타임프레임에 무관하게 동작합니다.
일봉이면 period=20 → 20일, 주봉이면 period=20 → 20주.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def calc_ma(close: np.ndarray | pd.Series, period: int = 20) -> np.ndarray:
    """이동평균 (Simple Moving Average).

    min_periods=1 이므로 초기 구간에서도 값을 반환.
    """
    s = pd.Series(close, dtype=np.float64)
    return s.rolling(period, min_periods=1).mean().values


def calc_rsi(close: np.ndarray, period: int = 14) -> np.ndarray:
    """RSI (Wilder's Exponential Moving Average 방식).

    - period 이전 구간은 50으로 채움.
    - EMA smoothing: avg = (prev_avg * (period-1) + current) / period
    """
    c = np.asarray(close, dtype=np.float64)
    n = len(c)
    delta = np.diff(c, prepend=c[0])
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)

    avg_gain = np.zeros(n)
    avg_loss = np.zeros(n)

    if n > period:
        avg_gain[period] = gain[1 : period + 1].mean()
        avg_loss[period] = loss[1 : period + 1].mean()
        for i in range(period + 1, n):
            avg_gain[i] = (avg_gain[i - 1] * (period - 1) + gain[i]) / period
            avg_loss[i] = (avg_loss[i - 1] * (period - 1) + loss[i]) / period

    rs = np.where(avg_loss == 0, 100, avg_gain / np.where(avg_loss == 0, 1, avg_loss))
    rsi = 100 - 100 / (1 + rs)
    rsi[:period] = 50
    return np.round(rsi, 2)


def calc_roc(close: np.ndarray, period: int = 12) -> np.ndarray:
    """Rate of Change (%).

    roc[i] = (close[i] - close[i-period]) / close[i-period] * 100
    period 이전 구간은 0.
    """
    c = np.asarray(close, dtype=np.float64)
    n = len(c)
    roc = np.zeros(n)
    for i in range(period, n):
        if c[i - period] != 0:
            roc[i] = (c[i] - c[i - period]) / c[i - period] * 100
    return np.round(roc, 2)


def calc_slope(ma: np.ndarray, lookback: int = 10) -> np.ndarray:
    """MA 기울기 (변화율 %).

    slope[i] = (ma[i] - ma[i-lookback]) / ma[i-lookback] * 100
    lookback 이전 구간은 0.
    """
    m = np.asarray(ma, dtype=np.float64)
    n = len(m)
    slope = np.zeros(n)
    for i in range(lookback, n):
        if m[i - lookback] != 0:
            slope[i] = (m[i] - m[i - lookback]) / m[i - lookback] * 100
    return np.round(slope, 2)


def calc_disparity(close: np.ndarray, ma: np.ndarray) -> np.ndarray:
    """이격도 (%).

    disparity = (close - ma) / ma * 100
    """
    c = np.asarray(close, dtype=np.float64)
    m = np.asarray(ma, dtype=np.float64)
    safe_ma = np.where(m == 0, 1, m)
    return np.round((c - m) / safe_ma * 100, 2)


def calc_volatility(close: np.ndarray, period: int = 20) -> np.ndarray:
    """변동성 (일간 수익률의 rolling std × √period).

    period 이전 구간은 min_periods=1 로 채움.
    """
    c = np.asarray(close, dtype=np.float64)
    n = len(c)
    daily_ret = np.zeros(n)
    for i in range(1, n):
        if c[i - 1] != 0:
            daily_ret[i] = (c[i] - c[i - 1]) / c[i - 1]
    vol = pd.Series(daily_ret).rolling(period, min_periods=1).std().values * np.sqrt(period)
    return np.round(vol, 4)


def calc_mdd(equity_values: np.ndarray) -> float:
    """Maximum Drawdown (%).

    equity_values: 포트폴리오 가치 배열.
    """
    values = np.asarray(equity_values, dtype=np.float64)
    if len(values) == 0:
        return 0.0
    running_max = np.maximum.accumulate(values)
    safe_max = np.where(running_max == 0, 1, running_max)
    drawdowns = (running_max - values) / safe_max * 100
    return float(np.max(drawdowns))


def calc_atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14) -> np.ndarray:
    """Average True Range.

    period 이전 구간은 NaN.
    """
    h = np.asarray(high, dtype=np.float64)
    l = np.asarray(low, dtype=np.float64)
    c = np.asarray(close, dtype=np.float64)
    prev_c = np.roll(c, 1)
    prev_c[0] = c[0]
    tr = np.maximum(h - l, np.maximum(np.abs(h - prev_c), np.abs(l - prev_c)))
    return pd.Series(tr).rolling(window=period, min_periods=period).mean().values
