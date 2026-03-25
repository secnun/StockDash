import { PerformanceMetrics, Trade } from './backtest';

export interface RecommendIndicators {
  maAlignment: boolean;
  ma20Slope: number;
  ma20Disparity: number;
  rsi: number;
  roc: number;
  volatility: number;
}

export interface ChartPoint {
  time: number;
  close: number;
  ma20: number;
  ma60: number;
}

export interface PatternBacktestResult {
  strategyId: string;
  strategyName: string;
  totalReturn: number;
  mdd: number;
}

export interface SimilarPattern {
  index: number;
  date: string;
  dateEnd: string;
  forwardStart: string;
  forwardEnd: string;
  similarity: number;
  indicators: RecommendIndicators;
  chartData: ChartPoint[];
  splitIndex: number;
  backtestResults: PatternBacktestResult[];
}

export interface PatternScoreDetail {
  patternDate: string;
  similarity: number;
  totalReturn: number;
  mdd: number;
}

export interface StrategyScore {
  strategyId: string;
  strategyName: string;
  compositeScore: number;
  patternResults: PatternScoreDetail[];
  excluded: boolean;
  excludeReason: string | null;
}

export interface RecommendResponse {
  currentDate: string;
  analysisStart: string;
  analysisEnd: string;
  currentIndicators: RecommendIndicators;
  currentChart: ChartPoint[];
  similarPatterns: SimilarPattern[];
  strategyScores: StrategyScore[];
  recommendation: string;
  recommendationName: string;
}

// ── 레이더 백테스트 ──

export interface RadarSwitchingEvent {
  time: number;
  dayIndex: number;
  fromStrategyId: string | null;
  fromStrategyName: string | null;
  toStrategyId: string;
  toStrategyName: string;
  portfolioValue: number;
  eventType: 'initial' | 'switch';
}

export interface RadarBacktestResponse {
  trades: Trade[];
  equity: Array<{ time: number; value: number }>;
  cash: Array<{ time: number; value: number }>;
  metrics: PerformanceMetrics;
  switchingEvents: RadarSwitchingEvent[];
  strategyTimeline: Array<{ time: number; strategyId: string }>;
  yearlyIndependent?: RadarYearlyIndependent;
  executionTime: number;
}

export interface RadarYearlyStats {
  label: string;
  startValue: number;
  endValue: number;
  totalReturn: number | null;  // null = skip (데이터 부족)
  mdd: number | null;
  totalTrades: number;
}

export interface RadarYearlyIndependent {
  granularity: 'yearly' | 'monthly';
  seedReset: RadarYearlyStats[];
  seedCarry: RadarYearlyStats[];
}
