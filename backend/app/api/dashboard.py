"""Dashboard API endpoints."""

from fastapi import APIRouter

from app.models.dashboard import HeatmapResponse
from app.services.dashboard_service import get_heatmap_data

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap() -> HeatmapResponse:
    """Get strategy performance heatmap data (YTD)."""
    return await get_heatmap_data()
