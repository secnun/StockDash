"""Application configuration using Pydantic Settings."""

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    app_name: str = "StockDash Backend"
    debug: bool = False

    # CORS
    cors_origins: list[str] = ["http://localhost:3230", "http://127.0.0.1:3230"]

    # Data paths (relative to backend directory)
    data_dir: Path = Path("../data/stocks")
    optimizer_result_dir: Path = Path("../data/optimizer_result")

    # Worker settings
    max_workers: int = 6


@lru_cache
def _get_cached_settings() -> Settings:
    """Get cached settings instance (for production)."""
    return Settings()


def get_settings() -> Settings:
    """Get settings instance. Bypasses cache in debug mode."""
    if os.getenv("DEBUG", "false").lower() == "true":
        return Settings()
    return _get_cached_settings()
