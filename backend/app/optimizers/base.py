"""Optimizer abstract base class."""

from abc import ABC, abstractmethod
from typing import Iterator


class Optimizer(ABC):
    """옵티마이저 추상 베이스 클래스."""

    id: str
    name: str
    description: str

    @abstractmethod
    def generate_candidates(
        self,
        param_ranges: dict[str, dict],
        config: dict,
    ) -> Iterator[dict]:
        """파라미터 후보 생성 (제너레이터)."""
        pass

    @abstractmethod
    def get_config_schema(self) -> list[dict]:
        """알고리즘별 설정 스키마 반환."""
        pass

    def estimate_total(
        self,
        param_ranges: dict[str, dict],
        config: dict,
    ) -> int:
        """예상 총 조합 수 반환."""
        return 0
