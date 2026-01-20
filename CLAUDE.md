# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StockDash는 주식 시스템 트레이딩 백테스팅 플랫폼입니다. (v0.2)

## Commands

```bash
npm run dev      # 개발 서버 실행 (localhost:3000)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint 실행
```

## Architecture

### Tech Stack
- Next.js 16.1 (App Router) + React 19 + TypeScript 5
- Lightweight Charts (금융 차트), D3.js (지도 시각화)
- Tailwind CSS v4 + next-themes (다크모드)

### Key Directories
```
app/
├── page.tsx              # 대시보드 (M2 자금 흐름 지도)
├── backtest/page.tsx     # 백테스팅 페이지 (메인 기능)
└── api/tickers/route.ts  # 티커 목록 API

lib/
├── backtest/
│   ├── engine.ts         # BacktestEngine 클래스 (매매 실행)
│   ├── metrics.ts        # 성과 지표 (CAGR, MDD, Sharpe, 승률)
│   ├── dataLoader.ts     # CSV 파싱 및 로드
│   └── csvExport.ts      # 결과 CSV 내보내기
└── strategies/           # 매매 전략 (Git 제외, 비공개)
    ├── index.ts          # 전략 레지스트리
    └── ddeolsapro*.ts    # 떨사오팔 전략들

components/
├── backtest/Charts/
│   └── EquityChart.tsx   # 자산 추이 + Drawdown 차트
└── dashboard/
    └── WorldMap.tsx      # D3.js 세계지도

types/backtest.ts         # TypeScript 인터페이스 (OHLCV, Trade, Strategy)
public/data/              # CSV 데이터 (Git 제외)
```

### Data Flow
```
CSV 로드 → parseCSV() → Strategy.execute() → calculateMetrics() → 차트 렌더링
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
`@/*` → 프로젝트 루트 (예: `@/lib/backtest/engine`)

## Excluded Directories

다음 디렉토리는 `.gitignore`에 포함되어 있으며, 명시적 요청 없이 생성/수정/삭제하지 않음:

| 디렉토리 | 용도 |
|---------|------|
| `docs/` | 사용자 전용 문서 및 전략 메모 |
| `public/data/` | 시세 데이터 (용량/저작권) |
| `lib/strategies/` | 매매 전략 로직 (비공개) |

## Future Plans

- 딥마이닝: 파라미터 그리드 서치 (Web Workers 병렬 처리)
- 백엔드 확장 시 전략 팩토리 패턴 리팩토링 예정
