# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StockDash는 주식 시스템 트레이딩 백테스팅 및 글로벌 M2 자금 흐름 시각화 플랫폼입니다.

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
app/                    # Next.js App Router 페이지
├── page.tsx           # 대시보드 (M2 자금 흐름 지도)
├── backtest/page.tsx  # 백테스팅 페이지
lib/
├── backtest/          # 백테스트 핵심 로직
│   ├── engine.ts      # BacktestEngine 클래스
│   ├── metrics.ts     # 성과 지표 계산 (CAGR, MDD, 샤프비율)
│   └── dataLoader.ts  # CSV 파싱 및 로드
├── strategies/        # 매매 전략 구현
│   ├── index.ts       # 전략 레지스트리
│   ├── maCross.ts     # 이동평균 크로스
│   ├── rsi.ts         # RSI
│   ├── bollinger.ts   # 볼린저 밴드
│   └── macd.ts        # MACD
components/
├── backtest/Charts/   # PriceChart, EquityChart, DrawdownChart
└── dashboard/         # WorldMap (D3.js 세계지도)
types/backtest.ts      # TypeScript 인터페이스 (OHLCV, Trade, Strategy 등)
public/data/           # CSV 데이터 파일
├── stocks/us/{ticker}/1d_{YYYYMMDD}.csv  # 미국 주식 (SOXL, TQQQ 등)
└── crypto/            # 암호화폐 데이터
```

### Strategy Plugin Pattern

새 전략 추가 방법:
1. `lib/strategies/_TEMPLATE.md` 참고하여 전략 설계
2. `lib/strategies/새전략.ts`에 Strategy 인터페이스 구현
3. `lib/strategies/index.ts`의 strategies 객체에 등록
4. UI 드롭다운에 자동 노출

Strategy 인터페이스 핵심:
```typescript
interface Strategy {
  id: string;
  name: string;
  description: string;
  parameters: ParameterDefinition[];
  execute: (data: OHLCV[], params: Record<string, any>) => BacktestResult;
}
```

### Data Flow
CSV 로드 → parseCSV() → Strategy.execute() → BacktestEngine 실행 → calculateMetrics() → 차트 렌더링

### Path Alias
`@/*`는 프로젝트 루트를 가리킴 (예: `@/lib/backtest/engine`)

### Excluded Directories

다음 디렉토리는 사용자가 직접 관리하며, 명시적 요청 없이 생성/수정/삭제하지 않음:
- `docs/` - 사용자 전용 문서 및 전략 메모
