"""CSV data loader using Pandas."""

from pathlib import Path

import numpy as np
import pandas as pd

from app.models.backtest import OHLCV


def parse_csv(csv_text: str) -> list[OHLCV]:
    """
    Parse CSV text to OHLCV data.

    Args:
        csv_text: Raw CSV content

    Returns:
        List of OHLCV objects
    """
    lines = csv_text.strip().split("\n")

    # Check if first line is header
    first_line_lower = lines[0].lower()
    has_header = "time" in first_line_lower or "open" in first_line_lower
    start_index = 1 if has_header else 0

    data: list[OHLCV] = []

    for line in lines[start_index:]:
        line = line.strip()
        if not line:
            continue

        values = [v.strip() for v in line.split(",")]
        if len(values) < 6:
            continue

        try:
            ohlcv = OHLCV(
                time=int(float(values[0])),
                open=float(values[1]),
                high=float(values[2]),
                low=float(values[3]),
                close=float(values[4]),
                volume=float(values[5]),
            )
            if not np.isnan(ohlcv.close):
                data.append(ohlcv)
        except (ValueError, IndexError):
            continue

    return data


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

    return df


def filter_by_date_range(
    df: pd.DataFrame,
    start_time: int | None = None,
    end_time: int | None = None,
) -> pd.DataFrame:
    """
    Filter DataFrame by date range.

    Args:
        df: OHLCV DataFrame
        start_time: Start timestamp (optional)
        end_time: End timestamp (optional)

    Returns:
        Filtered DataFrame
    """
    mask = pd.Series(True, index=df.index)

    if start_time is not None:
        mask &= df["time"] >= start_time
    if end_time is not None:
        mask &= df["time"] <= end_time

    return df[mask].copy()


def timestamp_to_date(timestamp: int) -> str:
    """Convert Unix timestamp to YYYY-MM-DD string."""
    return pd.Timestamp(timestamp, unit="s").strftime("%Y-%m-%d")


def date_to_timestamp(date_string: str) -> int:
    """Convert YYYY-MM-DD string to Unix timestamp."""
    return int(pd.Timestamp(date_string).timestamp())
