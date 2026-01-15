# StockDash Backtest

주식 시스템 트레이딩 백테스팅 플랫폼

## 프로젝트 소개

StockDash는 다양한 매매 전략을 백테스트하고 성과를 분석할 수 있는 웹 기반 플랫폼입니다.

### 주요 기능

- 전략 기반 백테스팅 실행
- 자산 추이 및 Drawdown 시각화
- 성과 지표 분석 (총 수익률, CAGR, MDD, 승률)
- CSV 결과 다운로드

### 기술 스택

| 분류 | 기술 |
|------|------|
| 프레임워크 | Next.js 16, React 19 |
| 언어 | TypeScript 5 |
| 스타일링 | Tailwind CSS 4 |
| 차트 | Lightweight Charts (TradingView) |

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 데이터 준비

프로젝트는 `public/data/` 폴더의 CSV 데이터를 사용합니다. 이 폴더는 Git에서 제외되어 있으므로 직접 생성해야 합니다.

#### 폴더 구조 생성

```bash
mkdir -p public/data/stocks/us/{티커명}
```

예시:
```bash
mkdir -p public/data/stocks/us/soxl
mkdir -p public/data/stocks/us/tqqq
mkdir -p public/data/stocks/us/spy
```

#### CSV 파일 형식

각 티커 폴더에 OHLCV 데이터가 포함된 CSV 파일을 배치합니다.

**파일명 예시:** `1d_20260108.csv`

**CSV 형식:**
```csv
time,open,high,low,close,volume
1704067200,25.50,26.00,25.30,25.80,1000000
1704153600,25.80,26.20,25.60,26.10,1200000
...
```

| 컬럼 | 설명 | 형식 |
|------|------|------|
| time | 타임스탬프 | Unix timestamp (초) |
| open | 시가 | 숫자 |
| high | 고가 | 숫자 |
| low | 저가 | 숫자 |
| close | 종가 | 숫자 |
| volume | 거래량 | 숫자 |

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속

### 4. 백테스트 실행

1. `/backtest` 페이지로 이동
2. 티커, 기간, 초기 자산 설정
3. 전략 선택 및 파라미터 조정
4. "실행" 버튼 클릭

## 프로젝트 구조

```
├── app/                    # Next.js 페이지
│   ├── api/tickers/        # 티커 목록 API
│   ├── backtest/           # 백테스트 페이지
│   └── page.tsx            # 메인 페이지
├── components/             # React 컴포넌트
│   └── backtest/Charts/    # 차트 컴포넌트
├── lib/                    # 비즈니스 로직
│   ├── backtest/           # 백테스트 엔진
│   └── strategies/         # 전략 구현
├── types/                  # TypeScript 타입
└── public/data/            # CSV 데이터 (Git 제외)
```

## Git에서 제외된 항목

다음 항목들은 `.gitignore`에 포함되어 있습니다:

| 항목 | 이유 |
|------|------|
| `/docs` | 개인 문서 및 전략 메모 |
| `/public/data` | 시세 데이터 (용량/저작권) |
| `/.claude/` | Claude Code 설정 |

## 스크립트

```bash
npm run dev      # 개발 서버 실행
npm run build    # 프로덕션 빌드
npm run start    # 프로덕션 서버 실행
npm run lint     # ESLint 검사
```

## 전략 추가 방법

1. `lib/strategies/` 폴더에 새 전략 파일 생성
2. `Strategy` 인터페이스 구현
3. `lib/strategies/index.ts`에 등록

참고: `lib/strategies/_TEMPLATE.md`
