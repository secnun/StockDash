"""Optimizer registry for managing optimizer implementations."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .base import Optimizer


class OptimizerRegistry:
    """옵티마이저 레지스트리."""

    _optimizers: dict[str, "Optimizer"] = {}

    @classmethod
    def register(cls, optimizer: "Optimizer") -> None:
        """옵티마이저 등록."""
        cls._optimizers[optimizer.id] = optimizer

    @classmethod
    def get(cls, optimizer_id: str) -> "Optimizer | None":
        """ID로 옵티마이저 조회."""
        return cls._optimizers.get(optimizer_id)

    @classmethod
    def list_all(cls) -> list["Optimizer"]:
        """등록된 모든 옵티마이저 반환."""
        return list(cls._optimizers.values())
