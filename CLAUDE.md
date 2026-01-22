# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StockDash는 주식 시스템 트레이딩 백테스팅 플랫폼입니다. (v0.2)

## Commands

```bash
# Frontend
cd frontend && npm run dev      # 개발 서버 실행 (localhost:3000)
cd frontend && npm run build    # 프로덕션 빌드
cd frontend && npm run lint     # ESLint 실행

# Backend
cd backend && uvicorn app.main:app --reload  # 백엔드 서버 (localhost:8000)
```

## Architecture

### Tech Stack
- Next.js 16.1 (App Router) + React 19 + TypeScript 5
- Lightweight Charts (금융 차트), D3.js (지도 시각화)
- Tailwind CSS v4 + next-themes (다크모드)

### Key Directories
```
data/                         # CSV 시세 데이터 (Git 제외)
└── stocks/us/{ticker}/       # 티커별 OHLCV 데이터

frontend/
├── app/
│   ├── page.tsx              # 대시보드 (M2 자금 흐름 지도)
│   ├── backtest/page.tsx     # 백테스팅 페이지 (메인 기능)
│   └── api/tickers/route.ts  # 티커 목록 API
├── lib/
│   ├── backtest/
│   │   ├── csvExport.ts          # 결과 CSV 내보내기
│   │   └── useBackendBacktest.ts # 백엔드 API 통신 Hook
│   └── api/
│       └── client.ts             # API 클라이언트
├── components/
│   ├── backtest/Charts/
│   │   └── EquityChart.tsx   # 자산 추이 + Drawdown 차트
│   └── dashboard/
│       └── WorldMap.tsx      # D3.js 세계지도
└── types/backtest.ts         # TypeScript 인터페이스 (OHLCV, Trade, Strategy)

backend/app/                  # Python FastAPI 백엔드
├── api/                      # API 엔드포인트
├── services/                 # 데이터 로딩 서비스
├── strategies/               # 매매 전략 (비공개)
└── core/                     # 설정 및 공통 모듈
```

### Data Flow
```
백테스트:  프론트엔드 API 요청 → Python 백엔드 (CSV 로드 + 전략 실행) → 결과 + priceData 반환 → 차트 렌더링
날짜범위: /api/backtest/date-range → 백엔드에서 CSV 파싱 → 사용 가능한 날짜 범위 반환
```

### Strategy Interface
```typescript
interface Strategy {
  id: string;
  name: string;
  description: string;
  parameters: ParameterDefinition[];
  execute: (data: OHLCV[], params: Record<string, any>) => BacktestResult;
}
```

### Path Alias
`@/*` → frontend 폴더 루트 (예: `@/lib/api/client`)

### Backend API

| 엔드포인트 | 메서드 | 용도 |
|-----------|--------|------|
| `/api/strategies` | GET | 사용 가능한 전략 목록 |
| `/api/backtest/run` | POST | 백테스트 실행 |
| `/api/backtest/date-range` | GET | 티커의 사용 가능한 날짜 범위 |

## Excluded Directories

다음 디렉토리는 `.gitignore`에 포함되어 있으며, 명시적 요청 없이 생성/수정/삭제하지 않음:

| 디렉토리 | 용도 |
|---------|------|
| `docs/` | 사용자 전용 문서 및 전략 메모 |
| `data/` | 시세 데이터 (용량/저작권) |
| `backend/app/strategies/` | 매매 전략 로직 (비공개) |

## Future Plans

- 딥마이닝: 파라미터 그리드 서치 (Python 백엔드 병렬 처리)
