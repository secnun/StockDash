import { OHLCV, PerformanceMetrics, Trade } from './backtest';

// 지표 조건
export interface IndicatorCondition {
  indicator: string; // 'alignment', 'deviation', 'rsi', 'slope', 'roc', 'atr'
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  value: number | string;
}

// 스위칭 트리거
export interface SwitchingTrigger {
  id: string;
  name: string;
  conditions: IndicatorCondition[];
  logic: 'and' | 'or';
  strategySlotId: string;
  priority: number;
}

// 전략 프리셋 슬롯
export interface StrategySlot {
  slotId: string; // 'A', 'B', 'C', 'D'
  name: string;
  strategyId: string;
  parameters: Record<string, number | string | boolean>;
}

// 스위칭 설정
export interface SwitchingConfig {
  strategySlots: StrategySlot[];
  rules: SwitchingTrigger[];
  defaultSlotId: string;
  cooldownDays: number;
  positionHandling: 'carry' | 'liquidate';
}

// 스위칭 백테스트 요청
export interface SwitchingBacktestRequest {
  tickerId: string;
  startDate?: string;
  endDate?: string;
  initialCapital: number;
  applyFee?: boolean;
  market?: string;
  switchingConfig: SwitchingConfig;
}

// 스위칭 이벤트
export interface SwitchingEvent {
  time: number;
  dayIndex: number;
  fromSlotId: string;
  toSlotId: string;
  triggerId: string;
  triggerName: string;
  indicators: Record<string, number | string | null>;
  portfolioValue: number;
  openTiers: number;
  eventType: 'switch' | 'revert';
}

// 구간 결과
export interface SegmentResult {
  slotId: string;
  slotName: string;
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

// 스위칭 백테스트 응답
export interface SwitchingBacktestResponse {
  trades: Trade[];
  equity: { time: number; value: number }[];
  cash: { time: number; value: number }[];
  metrics: PerformanceMetrics;
  priceData: OHLCV[];
  executionTime: number;
  switchingEvents: SwitchingEvent[];
  segments: SegmentResult[];
  activeStrategyTimeline: { time: number; slotId: string }[];
}

// 사용 가능한 지표 정보
export interface IndicatorInfo {
  id: string;
  label: string;
  type: 'string' | 'number';
  operators: string[];
  values?: string[];
  unit?: string;
}

// 슬롯 색상
export const SLOT_COLORS = {
  A: { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800', text: 'text-green-700 dark:text-green-300', badge: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200' },
  B: { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-300', badge: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200' },
  C: { bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-300', badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200' },
  D: { bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800', text: 'text-purple-700 dark:text-purple-300', badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200' },
} as const;

export type SlotId = keyof typeof SLOT_COLORS;

export const SLOT_IDS: SlotId[] = ['A', 'B', 'C', 'D'];

// 전략 옵션
export const STRATEGY_OPTIONS = [
  { id: 'ddeolsapro1', name: '떨사프로1', ratios: '5/10/15/20/25/25%' },
  { id: 'ddeolsapro2', name: '떨사프로2', ratios: '10/15/20/25/20/10%' },
  { id: 'ddeolsapro_custom', name: '떨사 커스텀', ratios: '사용자 정의' },
] as const;

// 전략별 파라미터 기본값 (백엔드 정의 기준)
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

// ===== 스위칭 옵티마이저 =====

export interface ConditionValueRange {
  ruleIndex: number;
  conditionIndex: number;
  indicator: string;
  operator: string;
  minValue?: number;
  maxValue?: number;
  step?: number;
  stringValues?: string[];
}

export interface CooldownRange {
  minValue: number;
  maxValue: number;
  step: number;
}

// 슬롯별 파라미터 범위 (Tier 2)
export interface SlotParameterRange {
  slotId: string;
  dropPercent?: { min: number; max: number; step: number };
  targetProfit?: { min: number; max: number; step: number };
  stopLossDays?: { min: number; max: number; step: number };
}

export type OptimizerAlgorithm = 'grid_search' | 'monte_carlo' | 'two_stage';

export interface SwitchingOptimizerRequest {
  tickerId: string;
  startDate?: string;
  endDate?: string;
  initialCapital: number;
  applyFee?: boolean;
  market?: string;
  switchingConfig: SwitchingConfig;
  conditionRanges: ConditionValueRange[];
  cooldownRange?: CooldownRange;
  topN?: number;
  algorithm?: OptimizerAlgorithm;
  slotParameterRanges?: SlotParameterRange[];
}

export interface ConditionValueMapping {
  ruleIndex: number;
  conditionIndex: number;
  value: number | string;
}

export interface SwitchingOptimizerResultItem {
  rank: number;
  conditionValues: ConditionValueMapping[];
  cooldownDays: number;
  totalReturn: number;
  cagr: number;
  mdd: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  switchCount: number;
  compositeScore: number;
}

export interface SwitchingOptimizerCallbacks {
  onStart?: (start: { jobId: string }) => void;
  onProgress?: (progress: { completed: number; total: number; percent: number; stage?: string }) => void;
  onResults?: (results: SwitchingOptimizerResultItem[]) => void;
  onDone?: (done: { totalTime: number; resultsCount: number }) => void;
  onCancelled?: (cancelled: { jobId: string; completed: number; total: number }) => void;
  onError?: (error: Error) => void;
}
