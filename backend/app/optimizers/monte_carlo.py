"""Monte Carlo optimizer implementation."""

import random
from typing import Iterator

from .base import Optimizer
from .registry import OptimizerRegistry
from .utils import get_decimal_places, round_to_step


class MonteCarloOptimizer(Optimizer):
    """무작위 샘플링으로 파라미터 공간을 탐색하는 옵티마이저."""

    id = "monte_carlo"
    name = "Monte Carlo"
    description = "무작위 샘플링으로 효율적 탐색"

    def generate_candidates(
        self,
        param_ranges: dict[str, dict],
        config: dict,
    ) -> Iterator[dict]:
        """무작위 파라미터 조합 생성."""
        n_samples = config.get("n_samples", 100)

        for _ in range(n_samples):
            params = {}
            for key, range_spec in param_ranges.items():
                min_val = range_spec["min"]
                max_val = range_spec["max"]
                step = range_spec["step"]

                raw_value = random.uniform(min_val, max_val)
                snapped = round_to_step(raw_value, step)
                snapped = max(min_val, min(max_val, snapped))  # 범위 클램핑

                if get_decimal_places(step) == 0:
                    snapped = int(snapped)
                params[key] = snapped
            yield params

    def get_config_schema(self) -> list[dict]:
        """Monte Carlo 설정 스키마."""
        return [
            {
                "key": "n_samples",
                "label": "샘플링 횟수",
                "type": "number",
                "default": 10000,
                "min": 10,
                "max": 100000,
            }
        ]

    def estimate_total(
        self,
        param_ranges: dict[str, dict],
        config: dict,
    ) -> int:
        """예상 샘플 수 반환."""
        return config.get("n_samples", 100)


# 자동 등록
OptimizerRegistry.register(MonteCarloOptimizer())
