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
| 프론트엔드 | Next.js 16, React 19, TypeScript 5 |
| 백엔드 | Python FastAPI |
| 스타일링 | Tailwind CSS 4 |
| 차트 | Lightweight Charts (TradingView) |

## 시작하기

### 1. 의존성 설치

```bash
# Frontend
cd frontend && npm install

# Backend
cd backend && pip install -r requirements.txt
```

### 2. 데이터 준비

프로젝트는 루트의 `data/` 폴더에서 CSV 데이터를 로드합니다. 이 폴더는 Git에서 제외되어 있으므로 직접 생성해야 합니다.

#### 폴더 구조 생성

```bash
mkdir -p data/stocks/us/{티커명}
```

예시:
```bash
mkdir -p data/stocks/us/soxl
mkdir -p data/stocks/us/tqqq
mkdir -p data/stocks/us/spy
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
# Backend (터미널 1)
cd backend && uvicorn app.main:app --reload
# http://localhost:8000

# Frontend (터미널 2)
cd frontend && npm run dev
# http://localhost:3000
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속

### 4. 백테스트 실행

1. `/backtest` 페이지로 이동
2. 티커, 기간, 초기 자산 설정
3. 전략 선택 및 파라미터 조정
4. "실행" 버튼 클릭

## 프로젝트 구조

```
├── data/                       # CSV 시세 데이터 (Git 제외)
│   └── stocks/us/{ticker}/     # 티커별 OHLCV 데이터
├── frontend/                   # Next.js 프론트엔드
│   ├── app/                    # 페이지 및 API 라우트
│   ├── components/             # React 컴포넌트
│   ├── lib/                    # 유틸리티 함수
│   └── types/                  # TypeScript 타입
└── backend/                    # Python FastAPI 백엔드
    ├── app/api/                # API 엔드포인트
    ├── app/services/           # 데이터 로딩 서비스
    └── app/strategies/         # 매매 전략 (비공개)
```

## Git에서 제외된 항목

다음 항목들은 `.gitignore`에 포함되어 있습니다:

| 항목 | 이유 |
|------|------|
| `/docs` | 개인 문서 및 전략 메모 |
| `/data` | 시세 데이터 (용량/저작권) |
| `/backend/app/strategies` | 매매 전략 로직 (비공개) |
| `/.claude/` | Claude Code 설정 |

## 스크립트

```bash
# Frontend
cd frontend && npm run dev      # 개발 서버 실행 (localhost:3000)
cd frontend && npm run build    # 프로덕션 빌드
cd frontend && npm run lint     # ESLint 검사

# Backend
cd backend && uvicorn app.main:app --reload  # 개발 서버 (localhost:8000)
```

## 전략 추가 방법

1. `backend/app/strategies/` 폴더에 새 전략 파일 생성
2. `BaseStrategy` 클래스 상속 및 구현
3. `backend/app/strategies/__init__.py`에 등록
