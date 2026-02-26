"""Grid Search optimizer implementation."""

import itertools
from typing import Iterator

from .base import Optimizer
from .registry import OptimizerRegistry
from .utils import generate_range_values


class GridSearchOptimizer(Optimizer):
    """모든 파라미터 조합을 전수 탐색하는 옵티마이저."""

    id = "grid_search"
    name = "Grid Search"
    description = "모든 파라미터 조합을 전수 탐색"

    def generate_candidates(
        self,
        param_ranges: dict[str, dict],
        config: dict,
    ) -> Iterator[dict]:
        """그리드 서치 파라미터 조합 생성."""
        keys = list(param_ranges.keys())
        values_list: list[list[float]] = []

        for key in keys:
            range_spec = param_ranges[key]
            min_val = range_spec["min"]
            max_val = range_spec["max"]
            step = range_spec["step"]

            values = generate_range_values(min_val, max_val, step)
            values_list.append(values)

        for combo in itertools.product(*values_list):
            yield dict(zip(keys, combo))

    def get_config_schema(self) -> list[dict]:
        """Grid Search 설정 스키마."""
        return [
            {
                "key": "max_combinations",
                "label": "조합 수",
                "type": "number",
                "default": 10000,
                "min": 10,
                "max": 1000000,
            }
        ]

    def estimate_total(
        self,
        param_ranges: dict[str, dict],
        config: dict,
    ) -> int:
        """예상 총 조합 수 계산."""
        total = 1
        for range_spec in param_ranges.values():
            count = round((range_spec["max"] - range_spec["min"]) / range_spec["step"]) + 1
            total *= max(1, count)
        return total


# 자동 등록
OptimizerRegistry.register(GridSearchOptimizer())
