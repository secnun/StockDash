import { OHLCV, PerformanceMetrics, Trade } from './backtest';

// QQQ 주봉 기반 모드 전환 규칙
export interface DongpaModeRule {
  indicator: string; // 'qqq_ma_cross', 'qqq_trend_deviation', 'qqq_weekly_roc', 'qqq_ma_slope'
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  value: number | string;
}

// 안전/공세 모드 정의
export interface DongpaMode {
  modeId: string; // 'safe', 'aggressive'
  name: string;
  strategyId: string;
  parameters: Record<string, number | string | boolean>;
}

// 모드 전환 트리거
export interface DongpaTrigger {
  id: string;
  name: string;
  conditions: DongpaModeRule[];
  logic: 'and' | 'or';
  targetModeId: string;
  priority: number;
}

// 동파법 설정
export interface DongpaConfig {
  modes: DongpaMode[];
  triggers: DongpaTrigger[];
  defaultModeId: string;
  qqqMaPeriod: number;
  positionHandling: 'carry' | 'liquidate';
}

// 모드 전환 이벤트
export interface DongpaModeEvent {
  time: number;
  dayIndex: number;
  fromModeId: string;
  toModeId: string;
  triggerId: string;
  triggerName: string;
  qqqIndicators: Record<string, number | string | null>;
  portfolioValue: number;
  openTiers: number;
}

// 모드 구간별 성과
export interface DongpaSegmentResult {
  modeId: string;
  modeName: string;
  strategyId: string;
  startTime: number;
  endTime: number;
  startValue: number;
  endValue: number;
  segmentReturn: number;
  segmentMdd: number;
  tradeCount: number;
  candleCount: number;
}

// QQQ 주봉 차트 데이터
export interface QQQWeeklyPoint {
  date: string;
  close: number;
  ma: number | null;
  maCross: string;
  trendDeviation: number;
  weeklyRoc: number;
  maSlope: number;
}

// 백테스트 요청/응답
export interface DongpaBacktestRequest {
  tickerId: string;
  startDate?: string;
  endDate?: string;
  initialCapital: number;
  applyFee?: boolean;
  market?: string;
  dongpaConfig: DongpaConfig;
}

export interface DongpaBacktestResponse {
  trades: Trade[];
  equity: { time: number; value: number }[];
  cash: { time: number; value: number }[];
  metrics: PerformanceMetrics;
  priceData: OHLCV[];
  executionTime: number;
  modeEvents: DongpaModeEvent[];
  segments: DongpaSegmentResult[];
  activeModeTimeline: { time: number; modeId: string }[];
  qqqWeeklyData: QQQWeeklyPoint[];
}

// 지표 정보
export interface DongpaIndicatorInfo {
  id: string;
  label: string;
  type: 'string' | 'number';
  operators: string[];
  values?: string[];
  unit?: string;
}

// 모드 색상
export const MODE_COLORS = {
  safe: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200',
  },
  aggressive: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-300',
    badge: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200',
  },
} as const;

export type ModeId = keyof typeof MODE_COLORS;

// 전략 옵션 (스위칭과 공유)
export const STRATEGY_OPTIONS = [
  { id: 'ddeolsapro1', name: '떨사프로1', ratios: '5/10/15/20/25/25%' },
  { id: 'ddeolsapro2', name: '떨사프로2', ratios: '10/15/20/25/20/10%' },
  { id: 'ddeolsapro_custom', name: '떨사 커스텀', ratios: '사용자 정의' },
] as const;

export const STRATEGY_DEFAULTS: Record<string, Record<string, number | string | boolean>> = {
  ddeolsapro1: { dropPercent: 0.01, targetProfit: 0.01, stopLossDays: 10, stopLossDayBuy: 'allow' },
  ddeolsapro2: { dropPercent: 0.01, targetProfit: 1.5, stopLossDays: 10, stopLossDayBuy: 'allow' },
  ddeolsapro_custom: { dropPercent: 0.01, targetProfit: 0.01, stopLossDays: 10, stopLossDayBuy: 'allow', divisions: 6 },
};

// 연산자 라벨
export const OPERATOR_LABELS: Record<string, string> = {
  eq: '==',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

// ===== 옵티마이저 =====

export interface DongpaConditionRange {
  triggerIndex: number;
  conditionIndex: number;
  indicator: string;
  operator: string;
  minValue?: number;
  maxValue?: number;
  step?: number;
}

export interface DongpaOptimizerRequest {
  tickerId: string;
  startDate?: string;
  endDate?: string;
  initialCapital: number;
  applyFee?: boolean;
  market?: string;
  dongpaConfig: DongpaConfig;
  conditionRanges: DongpaConditionRange[];
  topN?: number;
  algorithm?: 'grid_search' | 'monte_carlo';
  modeParameterRanges?: DongpaModeParameterRange[];
}

export interface DongpaModeParameterRange {
  modeId: string;
  dropPercent?: { min: number; max: number; step: number };
  targetProfit?: { min: number; max: number; step: number };
  stopLossDays?: { min: number; max: number; step: number };
}

export interface DongpaOptimizerResultItem {
  rank: number;
  conditionValues: { triggerIndex: number; conditionIndex: number; value: number | string }[];
  totalReturn: number;
  cagr: number;
  mdd: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  switchCount: number;
  compositeScore: number;
}

export interface DongpaOptimizerCallbacks {
  onStart?: (start: { jobId: string }) => void;
  onProgress?: (progress: { completed: number; total: number; percent: number }) => void;
  onResults?: (results: DongpaOptimizerResultItem[]) => void;
  onDone?: (done: { totalTime: number; resultsCount: number }) => void;
  onCancelled?: (cancelled: { jobId: string; completed: number; total: number }) => void;
  onError?: (error: Error) => void;
}
