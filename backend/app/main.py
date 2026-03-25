"""FastAPI application entry point."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import backtest, crypto_backtest, dashboard, dongpa, lab, optimizer, strategies
from app.core.config import get_settings
from app.services.yahoo_fetcher import refresh_all, refresh_ticker

logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup: 야후 데이터 갱신을 백그라운드에서 실행 (서버 즉시 가동)
    async def _background_refresh():
        try:
            results = await asyncio.to_thread(refresh_all)
            logger.info("Yahoo data refresh complete: %s", results)
        except Exception:
            logger.exception("Yahoo startup refresh failed")

    logger.info("Server starting (Yahoo refresh running in background)...")
    asyncio.create_task(_background_refresh())
    yield


app = FastAPI(
    title=settings.app_name,
    description="High-performance backtesting API with NumPy optimization",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(strategies.router)
app.include_router(backtest.router)
app.include_router(crypto_backtest.router)
app.include_router(optimizer.router)
app.include_router(dongpa.router)
app.include_router(lab.router)
app.include_router(dashboard.router)


@app.get("/")
async def root() -> dict:
    """Health check endpoint."""
    return {
        "name": settings.app_name,
        "version": "0.1.0",
        "status": "ok",
    }


@app.get("/health")
async def health() -> dict:
    """Health check endpoint."""
    return {"status": "healthy"}


@app.post("/api/yahoo/refresh")
async def yahoo_refresh_all() -> dict:
    """전체 티커 야후 데이터 수동 갱신."""
    results = await asyncio.to_thread(refresh_all)
    return {"status": "ok", "results": results}


@app.post("/api/yahoo/refresh/{ticker}")
async def yahoo_refresh_single(ticker: str) -> dict:
    """단일 티커 야후 데이터 수동 갱신."""
    result = await asyncio.to_thread(refresh_ticker, ticker)
    return {"ticker": ticker.upper(), "result": result}
