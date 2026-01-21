"""Tests for API endpoints."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    """Create test client."""
    return TestClient(app)


class TestHealthEndpoints:
    """Test health check endpoints."""

    def test_root(self, client: TestClient) -> None:
        """Test root endpoint."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"

    def test_health(self, client: TestClient) -> None:
        """Test health endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"


class TestStrategiesAPI:
    """Test strategies endpoints."""

    def test_list_strategies(self, client: TestClient) -> None:
        """Test list strategies endpoint."""
        response = client.get("/api/strategies")
        assert response.status_code == 200
        data = response.json()
        assert "strategies" in data
        assert len(data["strategies"]) > 0

    def test_get_strategy(self, client: TestClient) -> None:
        """Test get strategy endpoint."""
        response = client.get("/api/strategies/sma_crossover")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "sma_crossover"
        assert "parameters" in data

    def test_get_strategy_not_found(self, client: TestClient) -> None:
        """Test get strategy with invalid ID."""
        response = client.get("/api/strategies/nonexistent")
        assert response.status_code == 404


class TestBacktestAPI:
    """Test backtest endpoints."""

    def test_backtest_missing_data(self, client: TestClient) -> None:
        """Test backtest with missing data file."""
        response = client.post(
            "/api/backtest/run",
            json={
                "strategyId": "sma_crossover",
                "tickerId": "NONEXISTENT",
                "initialCapital": 1000000,
                "parameters": {"shortPeriod": 10, "longPeriod": 30},
            },
        )
        assert response.status_code == 404

    def test_backtest_invalid_strategy(self, client: TestClient) -> None:
        """Test backtest with invalid strategy."""
        response = client.post(
            "/api/backtest/run",
            json={
                "strategyId": "nonexistent",
                "tickerId": "AAPL",
                "initialCapital": 1000000,
                "parameters": {},
            },
        )
        assert response.status_code == 404
