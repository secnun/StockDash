"""공유 Pydantic 검증기 믹스인."""

from pydantic import field_validator


class PositiveCapitalValidator:
    """initial_capital > 0 검증 믹스인."""

    @field_validator("initial_capital")
    @classmethod
    def initial_capital_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("initial_capital must be greater than 0")
        return v
