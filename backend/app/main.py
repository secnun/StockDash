"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import backtest, grid_search, strategies
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description="High-performance backtesting API with NumPy optimization",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
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
app.include_router(grid_search.router)


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
