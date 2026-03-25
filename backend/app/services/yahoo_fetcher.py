"""Yahoo Finance 데이터 fetcher — 일봉 OHLCV + Adj Close + 지표 계산."""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# 갱신 대상 티커 목록
# ticker: Yahoo Finance 심볼 (없으면 키를 그대로 사용)
# market: 저장 디렉터리 (data/stocks/{market}/{ticker_lower}/)
TICKERS: dict[str, dict] = {
    # 미장
    "QQQ": {"market": "us", "interval": "1d"},
    "QQQ_1w": {"market": "us", "interval": "1wk", "ticker": "QQQ"},
    "SOXL": {"market": "us", "interval": "1d"},
    "TQQQ": {"market": "us", "interval": "1d"},
    # 국장
    "KOSDAQ150": {"market": "ko", "interval": "1d", "ticker": "233740.KS"},
    "KOSPI200": {"market": "ko", "interval": "1d", "ticker": "122630.KS"},
}


def _compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """OHLCV 데이터에 기술적 지표를 계산하여 추가."""
    from app.services.indicators import calc_atr, calc_ma, calc_roc, calc_rsi, calc_slope

    c = df["close"].values
    h = df["high"].values
    l = df["low"].values

    df["MA_20"] = calc_ma(c, 20)
    df["MA_60"] = calc_ma(c, 60)
    df["RSI"] = calc_rsi(c, 14)
    df["Slope"] = calc_slope(calc_ma(c, 20), lookback=20)
    df["ROC"] = calc_roc(c, 20)
    df["ATR"] = calc_atr(h, l, c, 14)

    return df


def fetch_ticker(ticker: str, period: str = "max", interval: str = "1d") -> pd.DataFrame | None:
    """
    야후 파이낸스에서 단일 티커 데이터를 가져와 CSV-ready DataFrame 반환.

    Returns:
        time(unix), open, high, low, close, adj_close, volume + 지표 컬럼
    """
    try:
        t = yf.Ticker(ticker)
        hist = t.history(period=period, interval=interval, auto_adjust=False)

        if hist.empty:
            logger.warning("No data returned for %s", ticker)
            return None

        # 컬럼 정리
        df = pd.DataFrame()
        # timezone-aware → UTC unix timestamp (seconds)
        # datetime64[s] → int64 이미 초 단위이므로 추가 나눗셈 불필요
        df["time"] = hist.index.tz_convert("UTC").astype(np.int64)
        df["open"] = hist["Open"].values
        df["high"] = hist["High"].values
        df["low"] = hist["Low"].values
        df["close"] = hist["Close"].values
        df["adj_close"] = hist["Adj Close"].values if "Adj Close" in hist.columns else hist["Close"].values
        df["volume"] = hist["Volume"].values

        df = df.reset_index(drop=True)

        # close가 NaN인 행 제거 (장중 미완료 데이터)
        df = df.dropna(subset=["close"]).reset_index(drop=True)

        # 지표 계산
        df = _compute_indicators(df)


        return df

    except Exception:
        logger.exception("Failed to fetch %s from Yahoo Finance", ticker)
        return None


def _save_csv(df: pd.DataFrame, ticker: str, market: str, interval: str = "1d") -> Path:
    """DataFrame을 CSV로 저장하고 이전 파일 삭제."""
    settings = get_settings()
    ticker_lower = ticker.lower()
    ticker_dir = Path(settings.data_dir) / market / ticker_lower
    ticker_dir.mkdir(parents=True, exist_ok=True)

    # interval 정규화: 1wk → 1w
    interval_short = interval.replace("wk", "w")
    # 고정 파일명: {ticker}_{interval}.csv (예: soxl_1d.csv, qqq_1w.csv)
    file_path = ticker_dir / f"{ticker_lower}_{interval_short}.csv"

    # 같은 interval의 이전 파일만 삭제 (다른 interval 파일은 유지)
    for old_file in ticker_dir.glob(f"*_{interval_short}.csv"):
        if old_file != file_path:
            old_file.unlink()
            logger.info("Deleted old file: %s", old_file.name)

    df.to_csv(file_path, index=False)
    logger.info("Saved %s → %s (%d rows)", ticker, file_path, len(df))
    return file_path


def _get_save_name(key: str, config: dict) -> str:
    """저장용 티커명 반환. ticker가 Yahoo 심볼(233740.KS)이면 키(KOSDAQ150)를 사용."""
    real_ticker = config.get("ticker", key)
    # Yahoo 심볼에 '.'이 포함되면 키 이름을 저장명으로 사용
    if "." in real_ticker:
        return key
    return real_ticker


def refresh_all() -> dict[str, str]:
    """모든 티커 데이터를 갱신하고 결과 반환."""
    results: dict[str, str] = {}

    for key, config in TICKERS.items():
        real_ticker = config.get("ticker", key)
        save_name = _get_save_name(key, config)
        interval = config["interval"]
        df = fetch_ticker(real_ticker, interval=interval)
        if df is not None:
            path = _save_csv(df, save_name, config["market"], interval)
            results[key] = f"ok — {len(df)} rows → {path.name}"
        else:
            results[key] = "failed"

    return results


def refresh_ticker(key: str) -> str:
    """단일 티커 데이터 갱신. key는 TICKERS의 키 (예: QQQ, QQQ_1w, SOXL, KOSDAQ150)."""
    config = TICKERS.get(key.upper())
    if config is None:
        return f"Unknown ticker key: {key}"

    real_ticker = config.get("ticker", key.upper())
    save_name = _get_save_name(key.upper(), config)
    interval = config["interval"]
    df = fetch_ticker(real_ticker, interval=interval)
    if df is not None:
        path = _save_csv(df, save_name, config["market"], interval)
        return f"ok — {len(df)} rows → {path.name}"
    return "failed"
