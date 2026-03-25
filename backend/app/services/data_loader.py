"""CSV data loader using Pandas."""

import re
from pathlib import Path

import numpy as np
import pandas as pd

from app.core.config import get_settings
from app.models.backtest import OHLCV


# market 파라미터 → 실제 디렉토리명 매핑
MARKET_DIR_MAP: dict[str, str] = {
    "kr": "ko",
}


def find_data_file(ticker_id: str, market: str = "us") -> Path | None:
    """티커의 데이터 파일 경로를 찾아 반환."""
    if not re.match(r'^[a-zA-Z0-9_-]+$', ticker_id):
        return None
    if not re.match(r'^[a-zA-Z0-9_-]+$', market):
        return None

    settings = get_settings()
    ticker_lower = ticker_id.lower()
    data_dir = Path(settings.data_dir)
    market_dir = MARKET_DIR_MAP.get(market, market)

    possible_paths = [
        data_dir / market_dir / ticker_lower / f"{ticker_lower}_1d.csv",
        data_dir / market_dir / ticker_lower / f"1d_*.csv",
        data_dir / f"{ticker_id}.csv",
        data_dir / f"{ticker_lower}.csv",
    ]

    for pattern in possible_paths:
        if "*" in str(pattern):
            matches = sorted(pattern.parent.glob(pattern.name))
            if matches:
                return matches[-1]
        elif pattern.exists():
            return pattern

    return None


def find_crypto_data_file(coin: str, exchange: str, timeframe: str = "4h") -> Path | None:
    """암호화폐 데이터 파일 경로를 찾아 반환.

    Args:
        coin: 코인 ID (e.g., 'btc')
        exchange: 거래소 ID (e.g., 'binance', 'upbit')
        timeframe: 타임프레임 (e.g., '4h', '1h', '1d')
    """
    if not re.match(r'^[a-zA-Z0-9_-]+$', coin) or not re.match(r'^[a-zA-Z0-9_-]+$', exchange):
        return None

    settings = get_settings()
    base_data_dir = Path(settings.data_dir).parent
    coin_lower = coin.lower()
    exchange_lower = exchange.lower()

    # 새 구조: crypto/{coin}/{exchange}/{coin}_{timeframe}.csv
    new_path = base_data_dir / "crypto" / coin_lower / exchange_lower
    if new_path.exists():
        # 1) 정확한 타임프레임 파일 매칭
        exact_file = new_path / f"{coin_lower}_{timeframe}.csv"
        if exact_file.exists():
            return exact_file

        # 2) 폴백: 첫 번째 CSV 파일
        csv_files = list(new_path.glob("*.csv"))
        if csv_files:
            return csv_files[0]

    # 레거시 호환: crypto/{coin}/day/{market}/*.csv
    legacy_path = base_data_dir / "crypto" / coin_lower / "day" / exchange_lower
    if legacy_path.exists():
        csv_files = list(legacy_path.glob("*.csv"))
        if csv_files:
            return csv_files[0]

    return None


# 거래소별 기본 수수료율
CRYPTO_FEE_RATES: dict[str, float] = {
    "binance": 0.001,   # 0.1%
    "upbit": 0.0005,    # 0.05%
}


def get_crypto_fee_rate(exchange: str) -> float:
    """거래소별 기본 수수료율 반환."""
    return CRYPTO_FEE_RATES.get(exchange.lower(), 0.001)


def df_to_ohlcv(df: pd.DataFrame) -> list[OHLCV]:
    """DataFrame을 OHLCV 리스트로 변환."""
    return [
        OHLCV(time=int(t), open=float(o), high=float(h), low=float(l), close=float(c), volume=float(v))
        for t, o, h, l, c, v in zip(
            df["time"].values, df["open"].values, df["high"].values,
            df["low"].values, df["close"].values, df["volume"].values,
        )
    ]


def load_csv_pandas(file_path: Path) -> pd.DataFrame:
    """
    Load CSV file using Pandas for high performance.

    Args:
        file_path: Path to CSV file

    Returns:
        DataFrame with OHLCV columns
    """
    # Try to detect if file has header
    with open(file_path, encoding="utf-8") as f:
        first_line = f.readline().lower()
        has_header = "time" in first_line or "open" in first_line

    df = pd.read_csv(
        file_path,
        header=0 if has_header else None,
        names=["time", "open", "high", "low", "close", "volume"] if not has_header else None,
    )

    # Ensure correct column names
    if has_header:
        df.columns = [col.lower().strip() for col in df.columns]

    # Convert time to int
    df["time"] = df["time"].astype(np.int64)

    # close 원본 사용 (adj_close가 있어도 원본 종가 유지)


    return df


def filter_by_date_range(
    df: pd.DataFrame,
    start_date: str | None = None,
    end_date: str | None = None,
    include_prev_close: bool = False,
) -> pd.DataFrame:
    """
    Filter DataFrame by date range.

    Args:
        df: OHLCV DataFrame
        start_date: Start date string YYYY-MM-DD (optional)
        end_date: End date string YYYY-MM-DD (optional)
        include_prev_close: True면 시작일 직전 1거래일을 포함 (LOC 매수 수량 계산용)

    Returns:
        Filtered DataFrame
    """
    mask = pd.Series(True, index=df.index)

    if start_date is not None or end_date is not None:
        dates = pd.to_datetime(df["time"], unit="s", utc=True).dt.strftime("%Y-%m-%d")
        if start_date is not None:
            if include_prev_close:
                # 시작일 이전 데이터 중 마지막 1거래일 포함
                before_start = df.index[dates < start_date]
                in_range = df.index[dates >= start_date]
                if len(before_start) > 0:
                    prev_idx = before_start[-1:]
                    selected = prev_idx.append(in_range)
                    mask = df.index.isin(selected)
                else:
                    mask &= dates >= start_date
            else:
                mask &= dates >= start_date
        if end_date is not None:
            mask &= dates <= end_date

    return df[mask].copy()


def timestamp_to_date(timestamp: int) -> str:
    """Convert Unix timestamp to YYYY-MM-DD string."""
    return pd.Timestamp(timestamp, unit="s").strftime("%Y-%m-%d")


def date_to_timestamp(date_string: str) -> int:
    """Convert YYYY-MM-DD string to Unix timestamp."""
    return int(pd.Timestamp(date_string, tz="UTC").timestamp())
