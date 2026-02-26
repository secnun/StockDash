"""CSV caching utilities for optimizer results."""

import csv
import json
import logging
import time
from pathlib import Path

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def get_cache_path(strategy_id: str, ticker_id: str) -> Path:
    """Get the cache file path for optimizer results."""
    settings = get_settings()
    cache_dir = Path(settings.optimizer_result_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{strategy_id}_{ticker_id}_yearly.csv"


def get_rankings_path(strategy_id: str, ticker_id: str) -> Path:
    """Get the rankings JSON snapshot path."""
    settings = get_settings()
    cache_dir = Path(settings.optimizer_result_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{strategy_id}_{ticker_id}_rankings.json"


def save_rankings_snapshot(
    rankings_path: Path,
    ranked_items: list[dict],
    total_count: int,
) -> None:
    """Save pre-computed rankings to JSON for fast loading."""
    snapshot = {
        "totalCount": total_count,
        "lastUpdated": int(time.time()),
        "results": ranked_items,
    }
    rankings_path.write_text(json.dumps(snapshot, ensure_ascii=False))


def load_rankings_snapshot(rankings_path: Path) -> dict | None:
    """Load rankings snapshot if it exists."""
    if not rankings_path.exists():
        return None
    try:
        return json.loads(rankings_path.read_text(encoding="utf-8"))
    except Exception:
        return None


def params_to_tuple(params: dict) -> tuple:
    """Convert params dict to hashable tuple for comparison."""
    return tuple(sorted((k, v) for k, v in params.items()))


def get_param_keys_from_cache(cache_path: Path) -> list[str]:
    """Read param keys from CSV header (all columns except known metric columns)."""
    if not cache_path.exists():
        return []

    known_columns = {
        "yearly_results",
        "weighted_return",
        "avg_return",
        "std_return",
        "max_mdd",
        "composite_score",
        "cumulative_return",
        "total_trades",
        "timestamp",
    }

    try:
        with open(cache_path, newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader, None)
            if not header:
                return []
            return [col for col in header if col not in known_columns]
    except Exception:
        return []


def load_cached_results(cache_path: Path, param_keys: list[str]) -> dict[tuple, dict]:
    """Load existing yearly results from CSV cache."""
    cached = {}
    if not cache_path.exists():
        return cached

    try:
        with open(cache_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Extract params from row
                params = {}
                for key in param_keys:
                    if key in row:
                        # Try to parse as number
                        try:
                            val = float(row[key])
                            params[key] = int(val) if val == int(val) else val
                        except (ValueError, TypeError):
                            params[key] = row[key]

                # Extract yearly results (JSON encoded)
                yearly_results_json = row.get("yearly_results", "[]")
                try:
                    yearly_results = json.loads(yearly_results_json)
                except json.JSONDecodeError:
                    yearly_results = []

                # Extract yearly metrics (fallback from old weighted_return for legacy cache)
                avg_return = row.get("avg_return")
                if avg_return is not None:
                    avg_return = float(avg_return)
                else:
                    avg_return = float(row.get("weighted_return", 0))

                result = {
                    "params": params,
                    "yearly_results": yearly_results,
                    "avg_return": avg_return,
                    "std_return": float(row.get("std_return", 0)),
                    "max_mdd": float(row.get("max_mdd", 0)),
                    "composite_score": float(row.get("composite_score", 0)),
                    "total_trades": int(float(row.get("total_trades", 0))),
                }

                param_tuple = params_to_tuple(params)
                cached[param_tuple] = result
    except Exception as e:
        logger.warning("Failed to load cache %s: %s", cache_path, e)
        return {}

    return cached


def save_results_to_cache(
    cache_path: Path,
    results: list[dict],
    param_keys: list[str],
    append: bool = False,
) -> None:
    """Save yearly results to CSV cache."""
    if not results:
        return

    mode = "a" if append else "w"
    write_header = not append or not cache_path.exists()

    fieldnames = param_keys + [
        "yearly_results",
        "avg_return",
        "std_return",
        "max_mdd",
        "composite_score",
        "total_trades",
        "timestamp",
    ]

    try:
        with open(cache_path, mode, newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            if write_header:
                writer.writeheader()

            for r in results:
                row = {**r["params"]}
                row.update(
                    {
                        "yearly_results": json.dumps(r.get("yearly_results", [])),
                        "avg_return": r.get("avg_return", 0),
                        "std_return": r.get("std_return", 0),
                        "max_mdd": r.get("max_mdd", 0),
                        "composite_score": r.get("composite_score", 0),
                        "total_trades": r.get("total_trades", 0),
                        "timestamp": int(time.time()),
                    }
                )
                writer.writerow(row)
    except Exception as e:
        logger.warning("Failed to save cache %s: %s", cache_path, e)
