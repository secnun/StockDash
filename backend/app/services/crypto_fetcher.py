"""암호화폐 데이터 fetcher — ccxt 기반 바이낸스/업비트 4시간봉."""

from __future__ import annotations

import logging
import time
from pathlib import Path

import pandas as pd

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# 갱신 대상 코인 목록
COINS: list[dict] = [
    {"coin": "btc", "binance": "BTC/USDT", "upbit": "BTC/KRW"},
    {"coin": "eth", "binance": "ETH/USDT", "upbit": "ETH/KRW"},
    {"coin": "xrp", "binance": "XRP/USDT", "upbit": "XRP/KRW"},
    {"coin": "sol", "binance": "SOL/USDT", "upbit": "SOL/KRW"},
    {"coin": "doge", "binance": "DOGE/USDT", "upbit": "DOGE/KRW"},
]

TIMEFRAME = "4h"


def _fetch_all_ohlcv(exchange, symbol: str, timeframe: str) -> list[list]:
    """거래소에서 전체 히스토리를 페이지네이션으로 가져오기.

    업비트는 오래된 데이터 접근이 제한적이므로 연도별로 시작점을 나눠 요청.
    """
    all_candles: list[list] = []
    limit = 1000 if exchange.id == "binance" else 200

    if exchange.id == "upbit":
        # 업비트: 연도별 시작점으로 나눠서 수집 (히스토리 제한 우회)
        start_years = [f"{y}-01-01T00:00:00Z" for y in range(2017, 2027)]
        for start_str in start_years:
            since = exchange.parse8601(start_str)
            while True:
                try:
                    batch = exchange.fetch_ohlcv(symbol, timeframe, since=since, limit=limit)
                except Exception as e:
                    logger.warning("Fetch error %s %s: %s", exchange.id, symbol, e)
                    break
                if not batch:
                    break
                all_candles.extend(batch)
                if len(batch) < limit:
                    break
                since = batch[-1][0] + 1
                time.sleep(0.15)
    else:
        # 바이낸스: 단순 순방향 페이지네이션
        since = exchange.parse8601("2017-01-01T00:00:00Z")
        while True:
            try:
                batch = exchange.fetch_ohlcv(symbol, timeframe, since=since, limit=limit)
            except Exception as e:
                logger.warning("Fetch error %s %s: %s", exchange.id, symbol, e)
                break
            if not batch:
                break
            all_candles.extend(batch)
            if len(batch) < limit:
                break
            since = batch[-1][0] + 1
            time.sleep(0.1)

    return all_candles


def _candles_to_dataframe(candles: list[list]) -> pd.DataFrame:
    """ccxt 캔들 → DataFrame 변환."""
    df = pd.DataFrame(candles, columns=["time", "open", "high", "low", "close", "volume"])
    # ms → seconds (unix timestamp)
    df["time"] = (df["time"] // 1000).astype(int)
    # 중복 제거 (페이지네이션 경계)
    df = df.drop_duplicates(subset=["time"]).sort_values("time").reset_index(drop=True)
    return df


def _save_crypto_csv(df: pd.DataFrame, coin: str, exchange_name: str) -> Path:
    """암호화폐 CSV 저장."""
    settings = get_settings()
    base_dir = Path(settings.data_dir).parent / "crypto" / coin / exchange_name
    base_dir.mkdir(parents=True, exist_ok=True)

    file_path = base_dir / f"{coin}_4h.csv"
    df.to_csv(file_path, index=False)
    logger.info("Saved %s/%s → %s (%d rows)", coin, exchange_name, file_path, len(df))
    return file_path


def refresh_all_crypto() -> dict[str, str]:
    """모든 코인의 바이낸스/업비트 4시간봉 데이터를 갱신."""
    import ccxt

    binance = ccxt.binance({"enableRateLimit": True})
    upbit = ccxt.upbit({"enableRateLimit": True})

    results: dict[str, str] = {}

    for coin_config in COINS:
        coin = coin_config["coin"]

        # 바이낸스
        try:
            candles = _fetch_all_ohlcv(binance, coin_config["binance"], TIMEFRAME)
            if candles:
                df = _candles_to_dataframe(candles)
                path = _save_crypto_csv(df, coin, "binance")
                results[f"{coin}_binance"] = f"ok — {len(df)} rows → {path.name}"
            else:
                results[f"{coin}_binance"] = "no data"
        except Exception as e:
            logger.exception("Failed to fetch %s from Binance", coin)
            results[f"{coin}_binance"] = f"failed: {e}"

        # 업비트
        try:
            candles = _fetch_all_ohlcv(upbit, coin_config["upbit"], TIMEFRAME)
            if candles:
                df = _candles_to_dataframe(candles)
                path = _save_crypto_csv(df, coin, "upbit")
                results[f"{coin}_upbit"] = f"ok — {len(df)} rows → {path.name}"
            else:
                results[f"{coin}_upbit"] = "no data"
        except Exception as e:
            logger.exception("Failed to fetch %s from Upbit", coin)
            results[f"{coin}_upbit"] = f"failed: {e}"

    return results


def refresh_crypto_coin(coin: str, exchange_name: str = "binance") -> str:
    """단일 코인 데이터 갱신."""
    import ccxt

    coin_config = next((c for c in COINS if c["coin"] == coin.lower()), None)
    if coin_config is None:
        return f"Unknown coin: {coin}"

    if exchange_name == "binance":
        exchange = ccxt.binance({"enableRateLimit": True})
        symbol = coin_config["binance"]
    elif exchange_name == "upbit":
        exchange = ccxt.upbit({"enableRateLimit": True})
        symbol = coin_config["upbit"]
    else:
        return f"Unknown exchange: {exchange_name}"

    try:
        candles = _fetch_all_ohlcv(exchange, symbol, TIMEFRAME)
        if candles:
            df = _candles_to_dataframe(candles)
            path = _save_crypto_csv(df, coin.lower(), exchange_name)
            return f"ok — {len(df)} rows → {path.name}"
        return "no data"
    except Exception as e:
        return f"failed: {e}"
