<div align="center">

# StockDash

**시스템 트레이딩을 위한 웹 기반 백테스팅 플랫폼**

전략 백테스트 · 파라미터 최적화 · 실시간 성과 분석

[![Version](https://img.shields.io/badge/version-v2.0.0-blue?style=for-the-badge)](https://github.com/secnun/StockDash/releases)
[![License](https://img.shields.io/badge/license-Private-red?style=for-the-badge)](#)

<br />

[![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python_3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

</div>

<br />

<!-- 스크린샷이 있다면 아래 주석을 해제하세요
<p align="center">
  <img src="docs/screenshots/dashboard.png" width="800" alt="StockDash Dashboard" />
</p>
-->

## About

StockDash는 다양한 매매 전략을 과거 데이터로 검증하고, 파라미터를 자동 최적화하며, 연도별 성과를 분석할 수 있는 풀스택 백테스팅 플랫폼입니다.

미국·국내 주식, 레버리지 ETF, 암호화폐를 지원하며, TradingView 차트로 시각화하고 SSE 스트리밍으로 최적화 진행 상황을 실시간 확인할 수 있습니다.

<br />

## Features

- **멀티 전략 백테스트** — 단일 전략 실행 또는 Compare 모드로 여러 전략을 동시에 비교
- **파라미터 최적화** — Grid Search / Monte Carlo 알고리즘으로 최적 파라미터 자동 탐색
- **실시간 SSE 스트리밍** — 최적화 진행률을 실시간으로 확인하고 중간 취소 가능
- **연도별 독립 분석** — Seed Reset / Seed Carry 두 가지 모드로 연도·월별 성과 분석
- **멀티 마켓** — 미국 주식, 국내 주식, 레버리지 ETF, 암호화폐(BTC/ETH/SOL/XRP) 지원
- **성과 지표** — Total Return, CAGR, MDD, Win Rate, Sharpe Ratio 자동 산출
- **전략 추천 레이더** — 시장 상황 패턴 매칭 기반 전략 자동 추천 및 백테스트
- **동파 분석** — QQQ 추세선 기반 모드 전환 전략 시뮬레이션 및 최적화
- **비대칭 복리** — 비대칭 복리 갱신 전략 비교 분석
- **대시보드** — 전략별 히트맵 시각화
- **결과 캐싱** — CSV 기반 캐시로 이미 계산된 조합을 건너뛰어 재실행 속도 향상
- **K-Means 클러스터링** — 최적화 결과에서 다양한 특성의 대표 파라미터셋 자동 선별
- **다크 모드** — `next-themes` 기반 라이트/다크 테마 지원

<br />

## Tech Stack

| Layer | Technology |
|:--|:--|
| **Frontend** | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4 |
| **Backend** | Python 3.11+, FastAPI, Pydantic v2, NumPy, pandas |
| **Charts** | TradingView Lightweight Charts |
| **Optimization** | scikit-learn (K-Means), ProcessPoolExecutor |
| **Streaming** | Server-Sent Events (SSE) via sse-starlette |
| **Infra** | Docker, Gunicorn + Uvicorn Workers |

<br />

## Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **Python** >= 3.11
- OHLCV CSV 데이터 (아래 [Data Format](#data-format) 참고)

### Installation

```bash
# 1. Clone
git clone https://github.com/secnun/StockDash.git
cd StockDash

# 2. Frontend 의존성 설치
cd frontend && npm install

# 3. Backend 의존성 설치
cd ../backend && pip install -e ".[dev]"
```

### Running

```bash
# Terminal 1 — Backend (http://localhost:8000)
cd backend && uvicorn app.main:app --reload

# Terminal 2 — Frontend (http://localhost:3230)
cd frontend && npm run dev
```

브라우저에서 `http://localhost:3230` 접속

### Docker

```bash
cd backend
docker compose up -d
# API: http://localhost:8000
# Docs: http://localhost:8000/docs
```

<br />

## Data Format

`data/stocks/{market}/{ticker}/` 폴더에 OHLCV CSV 파일을 배치합니다.

```
data/
├── stocks/
│   ├── us/soxl/1d_20260108.csv
│   └── ko/samsung/1d_20260108.csv
└── crypto/{coin}/day/{market}/
```

**CSV 형식:**

```csv
time,open,high,low,close,volume
1704067200,25.50,26.00,25.30,25.80,1000000
```

| Column | Type | Description |
|:--|:--|:--|
| `time` | `int` | Unix timestamp (seconds) |
| `open` | `float` | 시가 |
| `high` | `float` | 고가 |
| `low` | `float` | 저가 |
| `close` | `float` | 종가 |
| `volume` | `int` | 거래량 |

<br />

## Project Structure

```
stockdash/
├── frontend/                    # Next.js 프론트엔드
│   ├── app/                     # App Router 페이지
│   │   ├── backtest/            #   ├── 미국·국내·레버리지 백테스트
│   │   ├── optimizer/           #   ├── 파라미터 최적화
│   │   ├── crypto-backtest/     #   ├── 암호화폐 백테스트 & 페어 비교
│   │   └── lab/                 #   └── 실험실 (전략추천, 동파, 비대칭복리)
│   ├── components/              # React 컴포넌트
│   ├── lib/                     # API 클라이언트, hooks, 유틸리티
│   └── types/                   # TypeScript 타입 정의
│
├── backend/                     # FastAPI 백엔드
│   └── app/
│       ├── api/                 # REST API 엔드포인트
│       │   ├── backtest.py      #   ├── 백테스트 실행
│       │   ├── optimizer.py     #   ├── 파라미터 최적화 (SSE)
│       │   ├── crypto_backtest.py #  ├── 암호화폐 백테스트
│       │   ├── dongpa.py        #   ├── 동파 분석
│       │   ├── lab.py           #   ├── 실험실 (비대칭복리, 전략추천)
│       │   └── dashboard.py     #   └── 대시보드
│       ├── services/            # 비즈니스 로직
│       │   ├── engine.py        #   ├── 백테스트 엔진
│       │   ├── metrics.py       #   ├── 성과 지표 (NumPy 가속)
│       │   ├── clustering.py    #   ├── K-Means 클러스터링
│       │   └── indicators.py    #   └── 기술적 지표 계산
│       ├── strategies/          # 매매 전략 (비공개)
│       └── core/                # 설정 및 공통 모듈
│
├── data/                        # 시세 데이터 (Git 제외)
└── scripts/                     # 데이터 수집 및 배치 스크립트
```

<br />

## API Endpoints

| Method | Endpoint | Description |
|:--|:--|:--|
| `GET` | `/api/strategies` | 전략 목록 조회 |
| `POST` | `/api/backtest/run` | 백테스트 실행 |
| `GET` | `/api/backtest/date-range/{ticker_id}` | 티커 날짜 범위 조회 |
| `POST` | `/api/optimizer/run` | 파라미터 최적화 (SSE) |
| `GET` | `/api/optimizer/cached/{strategy}/{ticker}` | 캐시된 최적화 결과 |
| `POST` | `/api/crypto/backtest/run` | 암호화폐 백테스트 |
| `GET` | `/api/crypto/pairs/price` | 암호화폐 페어 가격 비교 |
| `POST` | `/api/dongpa/backtest/run` | 동파 백테스트 |
| `POST` | `/api/dongpa/optimizer/run` | 동파 최적화 (SSE) |
| `POST` | `/api/lab/asymmetric-compound` | 비대칭 복리 분석 |
| `POST` | `/api/lab/strategy-recommend` | 전략 추천 |
| `GET` | `/api/dashboard/heatmap` | 전략 히트맵 |
| `GET` | `/docs` | Swagger UI |

<br />

## Scripts

```bash
# Frontend
npm run dev              # 개발 서버
npm run build            # 프로덕션 빌드
npm run lint             # ESLint 검사

# Backend
uvicorn app.main:app --reload    # 개발 서버
pytest                           # 테스트 실행
ruff check .                     # 린트
mypy .                           # 타입 체크
```

<br />

## Scoring Formula

최적화 결과의 composite score는 다음과 같이 산출됩니다:

```
base_score = avg_return / (max_mdd × (1 + CV))
score = base_score × positive_ratio²
```

- `CV` = 수익률 표준편차 / |평균 수익률| (변동계수)
- `positive_ratio` = 양수 수익 연도 비율 — 마이너스 연도가 많을수록 점수가 급격히 감소

<br />

## License

This project is **private** and not licensed for public use.

<br />

---

<div align="center">

Built with **Next.js**, **FastAPI**, and **TradingView Lightweight Charts**

</div>
