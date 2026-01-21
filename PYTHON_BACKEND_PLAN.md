# Python Backend Implementation Plan

## Summary

Python FastAPI 백엔드가 구현되었습니다. 핵심 기능:

- **NumPy 벡터화 엔진**: 고성능 백테스트 실행
- **SSE 기반 그리드 서치**: 실시간 진행률 스트리밍
- **ProcessPoolExecutor**: CPU 코어 병렬 처리
- **Pydantic v2**: 타입 안전성 및 자동 OpenAPI 문서

## 구현 완료 항목

### Phase 1: 프로젝트 구조 ✅
```
backend/
├── app/
│   ├── api/
│   │   ├── backtest.py      # POST /api/backtest/run
│   │   ├── grid_search.py   # POST /api/backtest/grid-search (SSE)
│   │   └── strategies.py    # GET /api/strategies
│   ├── core/
│   │   ├── config.py        # Pydantic Settings
│   │   └── dependencies.py  # FastAPI DI
│   ├── models/
│   │   ├── backtest.py      # Request/Response 모델
│   │   └── strategy.py      # 전략 모델
│   ├── services/
│   │   ├── engine.py        # NumPy 백테스트 엔진
│   │   ├── metrics.py       # 성과 지표 계산
│   │   └── data_loader.py   # Pandas CSV 로더
│   ├── strategies/
│   │   ├── base.py          # Strategy 추상 클래스
│   │   └── sample_sma.py    # SMA Crossover 예제
│   └── main.py              # FastAPI 앱
├── tests/
├── pyproject.toml
├── Dockerfile
└── docker-compose.yml
```

### Phase 2: 핵심 로직 ✅
- `engine.py`: NumPy 벡터화 백테스트 엔진
- `metrics.py`: CAGR, MDD, Sharpe, 승률 계산
- `data_loader.py`: Pandas 기반 CSV 로더

### Phase 3: API 엔드포인트 ✅
- `POST /api/backtest/run`: 단일 백테스트
- `POST /api/backtest/grid-search`: 딥마이닝 (SSE)
- `GET /api/strategies`: 전략 목록

### Phase 4: 프론트엔드 클라이언트 ✅
- `lib/api/client.ts`: API 클라이언트 구현
- SSE 파싱 및 콜백 처리

### Phase 5: Docker ✅
- `Dockerfile`: 멀티스테이지 빌드
- `docker-compose.yml`: 로컬 개발 환경

---

## 실행 방법

### 1. 백엔드 서버 시작

```bash
cd backend

# 의존성 설치
pip install uv
uv pip install -e ".[dev]"

# 환경 설정
cp .env.example .env

# 개발 서버 실행
uvicorn app.main:app --reload --port 8000
```

### 2. API 확인

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- Health Check: http://localhost:8000/health

### 3. 테스트

```bash
# 단일 백테스트 (전략 데이터 파일 필요)
curl -X POST http://localhost:8000/api/backtest/run \
  -H "Content-Type: application/json" \
  -d '{
    "strategyId": "sma_crossover",
    "tickerId": "AAPL",
    "initialCapital": 10000000,
    "parameters": {"shortPeriod": 10, "longPeriod": 30}
  }'

# 전략 목록
curl http://localhost:8000/api/strategies
```

### 4. Docker 실행

```bash
cd backend
docker-compose up --build
```

---

## 다음 단계

### 전략 마이그레이션
기존 TypeScript 전략을 Python으로 포팅:

```python
# app/strategies/ddeolsapro1.py
from app.strategies.base import Strategy, StrategyRegistry

class Ddeolsapro1Strategy(Strategy):
    id = "ddeolsapro1"
    name = "떨사오팔 1"
    # ... 구현

StrategyRegistry.register(Ddeolsapro1Strategy())
```

### 프론트엔드 통합
백엔드 API를 사용하도록 backtest 페이지 수정:

```typescript
// app/backtest/page.tsx
import { runBacktestAPI, checkBackendHealth } from '@/lib/api';

// 백엔드 가용 시 API 사용, 아니면 클라이언트 사이드 실행
const useBackend = await checkBackendHealth();
if (useBackend) {
  result = await runBacktestAPI(request);
} else {
  result = strategy.execute(data, params);
}
```

### 데이터 파일 설정
CSV 데이터를 `backend/data/stocks/` 에 배치:

```bash
# 예: AAPL.csv
cp public/data/AAPL.csv backend/data/stocks/
```

---

## 성능 기대치

| 항목 | 현재 (클라이언트) | 예상 (백엔드) |
|------|------------------|---------------|
| 단일 백테스트 | 225-970ms | <100ms |
| 그리드 서치 1,000개 | 불가능 | <30초 |
| 그리드 서치 5,000개 | 불가능 | <3분 |
| UI 블로킹 | 있음 | 없음 |

---

## 배포 옵션

| 플랫폼 | 비용/월 | 특징 |
|--------|---------|------|
| Railway | $5-15 | 간편한 배포, Redis 내장 |
| Render | $7-25 | 백그라운드 워커 지원 |
| Vercel + Modal | $0-20 | 서버리스 Python |

권장: Railway (초기), 확장 시 EC2
