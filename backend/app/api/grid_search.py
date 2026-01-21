"""Grid search API with SSE streaming."""

import asyncio
import itertools
import json
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.core.config import get_settings
from app.models.backtest import (
    GridSearchDone,
    GridSearchProgress,
    GridSearchRequest,
    GridSearchResultItem,
    PerformanceMetrics,
)
from app.services.data_loader import date_to_timestamp, filter_by_date_range, load_csv_pandas
from app.strategies.base import StrategyRegistry

# Import strategies
from app.strategies import sample_sma  # noqa: F401

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


def _run_single_backtest(
    strategy_id: str,
    data_path: str,
    start_time: int | None,
    end_time: int | None,
    initial_capital: float,
    params: dict[str, float | int | str | bool],
) -> dict | None:
    """
    Run a single backtest (for multiprocessing).

    This function runs in a separate process.
    """
    try:
        # Re-import in worker process
        from app.services.data_loader import filter_by_date_range, load_csv_pandas
        from app.strategies import sample_sma  # noqa: F401
        from app.strategies.base import StrategyRegistry

        strategy = StrategyRegistry.get(strategy_id)
        if strategy is None:
            return None

        df = load_csv_pandas(Path(data_path))
        df = filter_by_date_range(df, start_time, end_time)

        if len(df) == 0:
            return None

        result = strategy.execute(df, params, initial_capital)

        return {
            "params": params,
            "metrics": result.metrics.model_dump(by_alias=True),
        }
    except Exception:
        return None


def _generate_param_combinations(
    param_ranges: dict[str, dict],
) -> list[dict[str, float]]:
    """Generate all parameter combinations from ranges."""
    keys = list(param_ranges.keys())
    values_list: list[list[float]] = []

    for key in keys:
        range_spec = param_ranges[key]
        min_val = range_spec["min"]
        max_val = range_spec["max"]
        step = range_spec["step"]

        values: list[float] = []
        current = min_val
        while current <= max_val:
            values.append(current)
            current += step

        values_list.append(values)

    combinations = list(itertools.product(*values_list))

    return [dict(zip(keys, combo)) for combo in combinations]


@router.post("/grid-search")
async def grid_search(request: GridSearchRequest) -> EventSourceResponse:
    """
    Run grid search with SSE progress streaming.

    Returns Server-Sent Events with:
    - event: progress - Progress updates
    - event: result - Top N results
    - event: done - Final summary
    """
    settings = get_settings()

    # Validate strategy
    strategy = StrategyRegistry.get(request.strategy_id)
    if strategy is None:
        raise HTTPException(
            status_code=404,
            detail=f"Strategy '{request.strategy_id}' not found",
        )

    # Validate data file
    data_path = Path(settings.data_dir) / f"{request.ticker_id}.csv"
    if not data_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Data file for ticker '{request.ticker_id}' not found",
        )

    # Generate parameter combinations
    param_combinations = _generate_param_combinations(
        {k: v.model_dump() for k, v in request.param_ranges.items()}
    )

    total = len(param_combinations)
    if total == 0:
        raise HTTPException(
            status_code=400,
            detail="No parameter combinations generated",
        )

    # Prepare date filters
    start_time = date_to_timestamp(request.start_date) if request.start_date else None
    end_time = date_to_timestamp(request.end_date) if request.end_date else None

    async def event_generator() -> AsyncGenerator[dict, None]:
        """Generate SSE events."""
        start_time_ms = time.perf_counter()
        results: list[dict] = []
        completed = 0

        # Use ProcessPoolExecutor for parallel execution
        max_workers = min(settings.max_workers, total)

        # Run in batches to provide progress updates
        batch_size = max(1, total // 20)  # ~5% progress updates
        loop = asyncio.get_event_loop()

        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            for i in range(0, total, batch_size):
                batch = param_combinations[i : i + batch_size]

                # Submit batch to executor
                futures = [
                    loop.run_in_executor(
                        executor,
                        _run_single_backtest,
                        request.strategy_id,
                        str(data_path),
                        start_time,
                        end_time,
                        request.initial_capital,
                        params,
                    )
                    for params in batch
                ]

                # Wait for batch results
                batch_results = await asyncio.gather(*futures)

                for result in batch_results:
                    if result is not None:
                        results.append(result)

                completed += len(batch)

                # Send progress update
                progress = GridSearchProgress(
                    completed=completed,
                    total=total,
                    percent=round(completed / total * 100, 1),
                )
                yield {
                    "event": "progress",
                    "data": progress.model_dump_json(),
                }

        # Sort by total return (descending)
        results.sort(
            key=lambda x: x["metrics"].get("totalReturn", 0),
            reverse=True,
        )

        # Send top N results
        top_results = results[: request.top_n]
        for rank, result in enumerate(top_results, 1):
            result_item = GridSearchResultItem(
                rank=rank,
                params=result["params"],
                metrics=PerformanceMetrics(**result["metrics"]),
            )
            yield {
                "event": "result",
                "data": result_item.model_dump_json(by_alias=True),
            }

        # Send completion event
        total_time = (time.perf_counter() - start_time_ms) * 1000
        done = GridSearchDone(
            total_time=round(total_time, 2),
            results_count=len(top_results),
        )
        yield {
            "event": "done",
            "data": done.model_dump_json(by_alias=True),
        }

    return EventSourceResponse(event_generator())
