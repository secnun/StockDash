# 딥마이닝 (Deep Mining) 기능 구현 계획

> 작성일: 2026-01-15
> 상태: 기획 완료, 구현 대기

## 개요
백테스트 파라미터 그리드 서치 최적화 기능. 5,000개 조합을 Web Workers로 병렬 처리하여 최적의 파라미터 조합 Top 10을 3가지 기준으로 제시.

---

## 사용자 요구사항
- **결과 표시**: 복합점수(상단) + 수익률/MDD 우선 좌우 분할 테이블(하단)
- **탐색 범위**: 5,000개 조합 (정밀 탐색)
- **UI**: 별도 "딥마이닝" 탭

---

## 기술적 타당성

| 항목 | 분석 결과 |
|-----|---------|
| 단일 백테스트 속도 | 5-50ms |
| 5,000 조합 예상 시간 | 4-40분 (6 Workers 기준) |
| 메모리 사용량 | ~50MB (브라우저 한계 내) |
| 병렬화 방식 | Web Workers (4-8개) |

---

## 파일 구조

### 신규 생성 파일

```
types/
└── deepMining.ts              # 타입 정의

lib/deepMining/
├── gridGenerator.ts          # 파라미터 조합 생성
├── workerPool.ts             # Web Worker 풀 관리
├── resultRanker.ts           # 결과 순위 계산
└── useDeepMining.ts          # React 훅

public/workers/
└── deepMiningWorker.js       # Web Worker (병렬 백테스트 실행)

components/deepMining/
├── DeepMiningTab.tsx         # 메인 탭 컴포넌트
├── ParameterRangeInput.tsx   # 파라미터 범위 입력
├── ProgressBar.tsx           # 진행률 표시
├── ResultsTable.tsx          # 결과 테이블 (재사용)
└── RankingPanel.tsx          # 3분할 랭킹 패널
```

### 수정 파일

| 파일 | 변경 내용 |
|-----|---------|
| `app/backtest/page.tsx` | 탭 네비게이션 추가, DeepMiningTab 연동 |
| `next.config.ts` | Web Worker webpack 설정 (필요시) |

---

## 핵심 인터페이스

```typescript
// types/deepMining.ts

interface ParameterRange {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

interface GridConfig {
  strategyId: string;
  ticker: { id: string; name: string; file: string };
  startDate: string;
  endDate: string;
  initialCapital: number;
  applyFee: boolean;
  parameterRanges: ParameterRange[];
  workerCount: number;
}

interface GridResult {
  params: Record<string, number>;
  metrics: PerformanceMetrics;
  compositeScore: number;   // totalReturn / |MDD|
  profitScore: number;
  mddScore: number;
}

interface RankedResults {
  byComposite: GridResult[];  // Top 10
  byProfit: GridResult[];     // Top 10
  byMDD: GridResult[];        // Top 10
}

interface MiningProgress {
  total: number;
  completed: number;
  percentage: number;
  estimatedTimeRemaining: number;
}
```

---

## 기본 파라미터 범위 (~5,000 조합)

```typescript
const defaultRanges = [
  { key: 'dropPercent', min: 1.0, max: 4.0, step: 0.2 },    // 16개
  { key: 'targetProfit', min: 1.0, max: 8.0, step: 0.5 },   // 15개
  { key: 'stopLossDays', min: 5, max: 25, step: 1 },        // 21개
];
// 총: 16 × 15 × 21 = 5,040 조합
```

---

## UI 레이아웃

```
┌────────────────────────────────────────────┐
│  [백테스트]  [딥마이닝]   ← 탭 네비게이션   │
├────────────────────────────────────────────┤
│  ┌─ 설정 패널 ─────────────────────────┐  │
│  │ 전략: [dropdown]  티커: [dropdown]  │  │
│  │ 기간: [start] ~ [end]               │  │
│  │ 초기자본: [input]  수수료: [toggle]  │  │
│  └───────────────────────────────────────┘  │
│  ┌─ 파라미터 범위 설정 ─────────────────┐  │
│  │ dropPercent:  [min] ~ [max] step [s] │  │
│  │ targetProfit: [min] ~ [max] step [s] │  │
│  │ stopLossDays: [min] ~ [max] step [s] │  │
│  │ 예상 조합 수: 5,040개                │  │
│  └───────────────────────────────────────┘  │
│  [ 딥마이닝 시작 ]  [ 중지 ]               │
│  ┌─ 진행률 ─────────────────────────────┐  │
│  │ ████████████░░░░░░ 65% (3,276/5,040) │  │
│  │ 예상 남은 시간: 2분 34초              │  │
│  └───────────────────────────────────────┘  │
│  ┌─ 복합 점수 Top 10 (수익률/MDD) ──────┐  │
│  │ # | dropPct | target | days | Ret | MDD │
│  │ 1 | 2.0     | 3.0    | 15   | 45% | -8% │
│  │ ...                                     │
│  └───────────────────────────────────────┘  │
│  ┌─ 수익률 Top 10 ─┐ ┌─ MDD Top 10 ────┐  │
│  │ #|params|Ret    │ │ #|params|MDD    │  │
│  │ 1|...   |52%    │ │ 1|...   |-5%    │  │
│  │ ...             │ │ ...             │  │
│  └─────────────────┘ └─────────────────┘  │
└────────────────────────────────────────────┘
```

---

## 구현 순서

### Step 1: 기반 구조
1. `types/deepMining.ts` - 인터페이스 정의
2. `lib/deepMining/gridGenerator.ts` - 조합 생성 유틸
3. `lib/deepMining/resultRanker.ts` - 순위 계산

### Step 2: Web Worker 시스템
4. `public/workers/deepMiningWorker.js` - 워커 구현
5. `lib/deepMining/workerPool.ts` - 워커 풀 관리

### Step 3: React 통합
6. `lib/deepMining/useDeepMining.ts` - 커스텀 훅
7. `components/deepMining/ProgressBar.tsx`
8. `components/deepMining/ParameterRangeInput.tsx`

### Step 4: UI 컴포넌트
9. `components/deepMining/ResultsTable.tsx`
10. `components/deepMining/RankingPanel.tsx`
11. `components/deepMining/DeepMiningTab.tsx`

### Step 5: 메인 페이지 통합
12. `app/backtest/page.tsx` - 탭 네비게이션 추가

---

## Worker 통신 프로토콜

```
Main Thread              Worker Pool (4-8)
    │                         │
    │── init (strategy, data) →│
    │←── ready ────────────────│
    │── batch (params[]) ─────→│
    │←── result (GridResult[]) │
    │   ... (반복) ...         │
    │←── complete ─────────────│
```

- 배치 크기: 100-200 조합/배치
- 워커 수: `navigator.hardwareConcurrency` 기반 (4-8개)

---

## 검증 방법

1. **단위 테스트**
   - gridGenerator: 조합 수 정확성 확인
   - resultRanker: 정렬 로직 검증

2. **통합 테스트**
   - 작은 그리드 (125개)로 빠른 검증
   - Worker 초기화/통신 확인

3. **E2E 테스트**
   - 브라우저에서 5,000개 조합 실행
   - 진행률 업데이트 확인
   - 결과 테이블 렌더링 확인
   - 예상 시간: 4-40분 내 완료 확인

---

## 성능 목표

| 지표 | 목표 |
|-----|-----|
| 단일 백테스트 | 5-50ms |
| 5,000 조합 (6 workers) | 5-42분 |
| 메모리 사용 | < 50MB |
| 결과 저장 | ~2.5MB (5,000 × 500B) |

---

## 주요 고려사항

1. **Web Worker 제약**: 직접 TS 임포트 불가 → 전략 로직 워커 내 복제 필요
2. **메모리 관리**: 전략 변경 시 이전 결과 클리어
3. **UX**: 시작 전 예상 조합 수 표시, 중간 중단 가능

---

## 향후 확장 가능성

### Phase 2: 서버 사이드
- API 엔드포인트 `/api/backtest/grid-search`
- Redis 캐싱
- 50,000+ 조합 지원

### Phase 3: 고급 최적화
- Bayesian Optimization (샘플 수 감소)
- Genetic Algorithm (다중 지표 최적화)
- ML 기반 파라미터 추천
