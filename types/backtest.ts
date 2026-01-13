// OHLCV 데이터 타입
export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// 매매 신호 타입
export type Signal = 'buy' | 'sell' | 'hold';

// 거래 기록
export interface Trade {
  time: number;
  type: 'buy' | 'sell';
  price: number;
  quantity: number;
  value: number;
}

// 백테스트 결과
export interface BacktestResult {
  trades: Trade[];
  equity: { time: number; value: number }[];
  metrics: PerformanceMetrics;
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

// 전략 파라미터 정의
export interface ParameterDefinition {
  key: string;
  label: string;
  type: 'number' | 'select' | 'date';
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: any }[];
}

// 전략 인터페이스
export interface Strategy {
  id: string;
  name: string;
  description: string;
  parameters: ParameterDefinition[];
  execute: (data: OHLCV[], params: Record<string, any>) => BacktestResult;
}

// 백테스트 설정
export interface BacktestConfig {
  strategyId: string;
  dataFile: string;
  startDate?: string;
  endDate?: string;
  initialCapital: number;
  parameters: Record<string, any>;
}
