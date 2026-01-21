# StockDash Backend

High-performance Python backend for backtesting with FastAPI and NumPy.

## Quick Start

### Local Development

```bash
# Install dependencies (using uv)
pip install uv
uv pip install -e ".[dev]"

# Copy environment file
cp .env.example .env

# Run development server
uvicorn app.main:app --reload --port 8000
```

### Docker

```bash
# Build and run
docker-compose up --build

# Or run just the API
docker build -t stockdash-backend .
docker run -p 8000:8000 stockdash-backend
```

## API Documentation

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API Endpoints

### Strategies

- `GET /api/strategies` - List all strategies
- `GET /api/strategies/{id}` - Get strategy details

### Backtest

- `POST /api/backtest/run` - Run single backtest
- `POST /api/backtest/grid-search` - Run grid search (SSE)

## Development

```bash
# Run tests
pytest

# Run linter
ruff check app/ tests/

# Run type checker
mypy app/
```

## Project Structure

```
backend/
├── app/
│   ├── api/           # API routes
│   ├── core/          # Configuration
│   ├── models/        # Pydantic models
│   ├── services/      # Business logic
│   ├── strategies/    # Trading strategies
│   └── main.py        # FastAPI app
├── tests/             # Test files
├── data/stocks/       # CSV data
└── pyproject.toml     # Dependencies
```
