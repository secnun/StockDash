"""Pydantic models for strategy API."""

from typing import Literal

from pydantic import BaseModel, Field


class ParameterOption(BaseModel):
    """Option for select-type parameters."""

    label: str
    value: float | int | str | bool


class ParameterDefinition(BaseModel):
    """Strategy parameter definition."""

    key: str
    label: str
    type: Literal["number", "select", "date"]
    default: float | int | str | bool
    min: float | None = None
    max: float | None = None
    step: float | None = None
    options: list[ParameterOption] | None = None


class StrategyInfo(BaseModel):
    """Strategy information for API response."""

    id: str
    name: str
    description: str
    parameters: list[ParameterDefinition]


class StrategyListResponse(BaseModel):
    """Response model for strategy list."""

    strategies: list[StrategyInfo]
