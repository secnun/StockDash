// OHLCV 데이터 타입
export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// 거래 기록
export interface Trade {
  time: number;
  type: 'buy' | 'sell';
  price: number;
  quantity: number;
  value: number;
  costBasis?: number; // 거래 시점의 평균 매수가 (이동평균)
  tier?: number; // 티어 번호 (1~7)
  tierSlots?: string; // 현재 보유 티어 상태 (예: "1,2,3")
}

// 기간별 독립 백테스트 통계
export interface PeriodIndependentStats {
  label: string;       // "2020" (연도) 또는 "2024-03" (월)
  startValue: number;
  endValue: number;
  totalReturn: number;
  mdd: number;
  totalTrades: number;
}

// 독립 백테스트 결과 (시드 리셋 + 시드 이월)
export interface PeriodIndependentResult {
  granularity: 'yearly' | 'monthly';
  seedReset: PeriodIndependentStats[];
  seedCarry: PeriodIndependentStats[];
}

// 백테스트 결과
export interface BacktestResult {
  trades: Trade[];
  equity: { time: number; value: number }[];
  cash?: { time: number; value: number }[];
  metrics: PerformanceMetrics;
  priceData?: OHLCV[]; // 백엔드 응답에 포함된 가격 데이터
  yearlyIndependent?: PeriodIndependentResult;
}

// 성과 지표
export interface PerformanceMetrics {
  totalReturn: number; // 총 수익률 (%)
  cagr: number; // 연평균 성장률 (%)
  mdd: number; // 최대 낙폭 (%)
  winRate: number; // 승률 (%)
  sharpeRatio: number; // 샤프 비율
  totalTrades: number; // 총 거래 횟수
}

// 파라미터 값 타입
export type ParameterValue = number | string | boolean;

// Compare 모드용 타입
export interface SelectedStrategy {
  id: string;           // 고유 키 (uuid)
  strategyId: string;   // 전략 ID
  params: Record<string, ParameterValue>;
}

// 다중 Equity 차트용 데이터
export interface StrategyEquityData {
  strategyId: string;
  strategyName: string;
  equity: { time: number; value: number }[];
  color: string;
}

// Compare 모드 결과
export interface CompareResult {
  strategyId: string;
  strategyName: string;
  result: BacktestResult;
  color: string;
}
