/**
 * API Client for StockDash Backend
 *
 * Communicates with the Python FastAPI backend for:
 * - Single backtest execution
 * - Optimizer with SSE progress
 * - Strategy listing
 */

import { BacktestResult, OHLCV, ParameterValue, PeriodIndependentResult } from '@/types/backtest';
import {
  DongpaBacktestRequest,
  DongpaBacktestResponse,
  DongpaIndicatorInfo,
  DongpaOptimizerCallbacks,
  DongpaOptimizerRequest,
  DongpaOptimizerResultItem,
  QQQWeeklyPoint,
} from '@/types/dongpa';

// Backend API base URL - can be overridden via environment variable
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Generic SSE stream parser.
 * Reads from a ReadableStreamDefaultReader and dispatches parsed events to handlers.
 */
async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: Record<string, (data: unknown) => void>,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data) {
            try {
              const parsed = JSON.parse(data);
              handlers[currentEvent]?.(parsed);
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * API Request/Response Types
 */
export interface BacktestRequest {
  strategyId: string;
  tickerId: string;
  startDate?: string;
  endDate?: string;
  initialCapital: number;
  parameters: Record<string, ParameterValue>;
  applyFee?: boolean;
  market?: string;
}

export interface BacktestResponse {
  trades: Array<{
    time: number;
    type: 'buy' | 'sell';
    price: number;
    quantity: number;
    value: number;
    costBasis?: number;
    tier?: number;
    tierSlots?: string;
  }>;
  equity: Array<{ time: number; value: number }>;
  cash?: Array<{ time: number; value: number }>;
  metrics: {
    totalReturn: number;
    cagr: number;
    mdd: number;
    winRate: number;
    sharpeRatio: number;
    totalTrades: number;
  };
  priceData: OHLCV[];
  executionTime: number;
  yearlyIndependent?: PeriodIndependentResult;
}

export interface DateRangeResponse {
  min: string;
  max: string;
}

export interface ParamRange {
  min: number | '';
  max: number | '';
  step: number | '';
}

export interface GridSearchProgress {
  completed: number;
  total: number;
  percent: number;
}

export interface GridSearchDone {
  totalTime: number;
  resultsCount: number;
}

export interface GridSearchCacheInfo {
  cachedCount: number;
  newCount: number;
  totalCount: number;
}

export interface YearlyResult {
  year: number;
  totalReturn: number;
  mdd: number;
}

export interface YearlyRankedResultItem {
  rank: number;
  params: Record<string, ParameterValue>;
  yearlyResults: YearlyResult[];
  avgReturn: number;
  stdReturn: number;
  maxMdd: number;
  compositeScore: number;
  totalTrades: number;
  allPositive: boolean;
}

export interface YearlyRankings {
  results: YearlyRankedResultItem[];
}

export interface StrategyInfo {
  id: string;
  name: string;
  description: string;
  parameters: Array<{
    key: string;
    label: string;
    type: 'number' | 'select' | 'date';
    default: ParameterValue;
    min?: number;
    max?: number;
    step?: number;
    options?: Array<{ label: string; value: ParameterValue }>;
  }>;
}

/**
 * Check if backend is available
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get list of strategies from backend
 */
export async function fetchStrategies(): Promise<StrategyInfo[]> {
  const response = await fetch(`${API_BASE_URL}/api/strategies`);
  if (!response.ok) {
    throw new Error(`전략 목록을 불러올 수 없습니다: ${response.statusText}`);
  }
  const data = await response.json();
  return data.strategies;
}

/**
 * Get date range for a ticker
 */
export async function fetchDateRange(tickerId: string, market: string = 'us'): Promise<DateRangeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/backtest/date-range/${tickerId}?market=${encodeURIComponent(market)}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || '날짜 범위를 불러올 수 없습니다');
  }
  return response.json();
}

/**
 * Run single backtest via backend API
 */
export async function runBacktestAPI(request: BacktestRequest): Promise<BacktestResult> {
  const response = await fetch(`${API_BASE_URL}/api/backtest/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || '백테스트 실행에 실패했습니다');
  }

  const data: BacktestResponse = await response.json();

  // Convert to BacktestResult format
  return {
    trades: data.trades,
    equity: data.equity,
    cash: data.cash,
    metrics: data.metrics,
    priceData: data.priceData,
    yearlyIndependent: data.yearlyIndependent,
  };
}

export interface OptimizerStartResponse {
  jobId: string;
}

export interface OptimizerCancelled {
  jobId: string;
  completed: number;
  total: number;
}

/**
 * Grid search event types for SSE callbacks
 */
export interface GridSearchCallbacks {
  onStart?: (start: OptimizerStartResponse) => void;
  onProgress?: (progress: GridSearchProgress) => void;
  onYearlyRankings?: (rankings: YearlyRankings) => void;
  onDone?: (done: GridSearchDone) => void;
  onCacheInfo?: (cacheInfo: GridSearchCacheInfo) => void;
  onCancelled?: (cancelled: OptimizerCancelled) => void;
  onError?: (error: Error) => void;
}

/**
 * Crypto Backtest API
 */

export interface CryptoBacktestRequest {
  coin: string;
  market: string;
  strategyId: string;
  initialCapital: number;
  startDate?: string;
  endDate?: string;
  applyFee?: boolean;
  timeframe?: string;
  parameters?: Record<string, ParameterValue>;
}

/**
 * Get list of crypto strategies from backend
 */
export async function fetchCryptoStrategies(): Promise<StrategyInfo[]> {
  const response = await fetch(`${API_BASE_URL}/api/crypto/strategies`);
  if (!response.ok) {
    throw new Error(`암호화폐 전략 목록을 불러올 수 없습니다: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get date range for a crypto pair (via backend)
 */
export async function fetchCryptoDateRange(coin: string, market: string, timeframe: string = '4h'): Promise<DateRangeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/crypto/date-range?coin=${encodeURIComponent(coin)}&market=${encodeURIComponent(market)}&timeframe=${encodeURIComponent(timeframe)}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || '날짜 범위를 불러올 수 없습니다');
  }
  return response.json();
}

/**
 * Run crypto backtest via backend API
 */
export async function runCryptoBacktestAPI(request: CryptoBacktestRequest): Promise<BacktestResult> {
  const params = new URLSearchParams({
    coin: request.coin,
    market: request.market,
    strategy_id: request.strategyId,
    initial_capital: request.initialCapital.toString(),
  });

  if (request.startDate) params.set('start_date', request.startDate);
  if (request.endDate) params.set('end_date', request.endDate);
  if (request.applyFee !== undefined) params.set('apply_fee', request.applyFee.toString());
  if (request.timeframe) params.set('timeframe', request.timeframe);

  // Note: parameters are passed as query params for simplicity
  // A proper implementation would use POST body

  const response = await fetch(`${API_BASE_URL}/api/crypto/backtest/run?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: request.parameters ? JSON.stringify(request.parameters) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || '암호화폐 백테스트 실행에 실패했습니다');
  }

  const data: BacktestResponse = await response.json();

  return {
    trades: data.trades,
    equity: data.equity,
    cash: data.cash,
    metrics: data.metrics,
    priceData: data.priceData,
    yearlyIndependent: data.yearlyIndependent,
  };
}

/**
 * Pairs Mode API
 */

export interface PricePoint {
  time: number;
  price: number;
  changePercent: number;
}

export interface PairPriceResponse {
  coin: string;
  market: string;
  data: PricePoint[];
  startPrice: number;
  endPrice: number;
  totalChange: number;
}

/**
 * Get price data for pairs comparison
 */
export async function fetchPairPriceData(
  coin: string,
  market: string,
  startDate?: string,
  endDate?: string,
): Promise<PairPriceResponse> {
  const params = new URLSearchParams({
    coin,
    market,
  });
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);

  const response = await fetch(`${API_BASE_URL}/api/crypto/pairs/price?${params.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || '가격 데이터를 불러올 수 없습니다');
  }
  return response.json();
}

/**
 * Cached optimizer results
 */
export interface CachedResultsResponse {
  exists: boolean;
  results: YearlyRankedResultItem[];
  totalCount: number;
  lastUpdated: number | null;
}

/**
 * Optimizer API
 */

export interface OptimizerConfigOption {
  label: string;
  value: number;
}

export interface OptimizerInfo {
  id: string;
  name: string;
  description: string;
  configSchema: Array<{
    key: string;
    label: string;
    type: string;
    default: number;
    min?: number;
    max?: number;
    options?: OptimizerConfigOption[];
  }>;
}

export interface OptimizerRequest {
  optimizerId: string;
  optimizerConfig: Record<string, number>;
  strategyId: string;
  tickerId: string;
  paramRanges: Record<string, ParamRange>;
  selectParams?: Record<string, string[]>;
  initialCapital: number;
  topN?: number;
  startDate?: string;
  endDate?: string;
  applyFee?: boolean;
  market?: string;
}

/**
 * Get list of available optimizers
 */
export async function fetchOptimizers(): Promise<OptimizerInfo[]> {
  const response = await fetch(`${API_BASE_URL}/api/optimizer/list`);
  if (!response.ok) {
    throw new Error(`옵티마이저 목록을 불러올 수 없습니다: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Cancel optimizer execution
 */
export async function cancelOptimizer(jobId: string): Promise<{ status: string; jobId: string }> {
  const response = await fetch(`${API_BASE_URL}/api/optimizer/cancel/${jobId}`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('옵티마이저 취소에 실패했습니다');
  }

  return response.json();
}

/**
 * Get cached optimizer results
 */
export async function fetchCachedResults(
  strategyId: string,
  tickerId: string,
  topN: number = 50,
): Promise<CachedResultsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/optimizer/cached/${strategyId}/${tickerId}?top_n=${topN}`,
  );
  if (!response.ok) {
    throw new Error(`캐시된 결과를 불러올 수 없습니다: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Run optimizer with SSE progress streaming
 */
export async function runOptimizerAPI(
  request: OptimizerRequest,
  callbacks: GridSearchCallbacks
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/optimizer/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || '옵티마이저 실행에 실패했습니다');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('응답 데이터를 읽을 수 없습니다');
  }

  await parseSSEStream(reader, {
    start: (data) => callbacks.onStart?.(data as OptimizerStartResponse),
    progress: (data) => callbacks.onProgress?.(data as GridSearchProgress),
    yearly_rankings: (data) => callbacks.onYearlyRankings?.(data as YearlyRankings),
    done: (data) => callbacks.onDone?.(data as GridSearchDone),
    cache_info: (data) => callbacks.onCacheInfo?.(data as GridSearchCacheInfo),
    cancelled: (data) => callbacks.onCancelled?.(data as OptimizerCancelled),
    error: (data) => callbacks.onError?.(new Error((data as { message?: string }).message ?? 'Optimizer error')),
  });
}

// ===== 짭파법 v1 API =====

export interface JjappaConfig {
  rsiThreshold: number;
  // 안전모드
  safeStrategy: 'dongpa' | 'ddeolsapro3';
  safeBuyMaxRise: number;
  safeDropPercent: number;
  safeTargetProfit: number;
  safeMaxHoldDays: number;
  safeStopLossDayBuy: 'allow' | 'block';
  // 공세모드
  aggrStrategy: 'dongpa' | 'ddeolsapro3';
  aggrBuyMaxRise: number;
  aggrDropPercent: number;
  aggrTargetProfit: number;
  aggrMaxHoldDays: number;
  aggrStopLossDayBuy: 'allow' | 'block';
  // 투자금 갱신
  renewalMode: 'no_position' | 'fixed_period' | 'hybrid';
  renewalPeriod: number;
  profitRate: number;
  lossRate: number;
  feeRate: number;
  applyFee: boolean;
}

export interface JjappaRequest {
  startDate?: string;
  endDate?: string;
  initialCapital: number;
  config: JjappaConfig;
}

export async function runJjappaBacktest(request: JjappaRequest): Promise<DongpaBacktestResponse> {
  const response = await fetch(`${API_BASE_URL}/api/dongpa/jjappa/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail || '짭파법 백테스트에 실패했습니다');
  }
  return response.json();
}

// ===== 동파법 API =====

/**
 * Fetch QQQ weekly data with indicators
 */
export async function fetchQQQWeeklyData(): Promise<{
  weeklyData: QQQWeeklyPoint[];
  latest: QQQWeeklyPoint;
}> {
  const response = await fetch(`${API_BASE_URL}/api/dongpa/qqq-weekly`);
  if (!response.ok) throw new Error('QQQ 주봉 데이터를 불러올 수 없습니다');
  return response.json();
}

/**
 * Fetch dongpa available indicators
 */
export async function fetchDongpaIndicators(): Promise<DongpaIndicatorInfo[]> {
  const response = await fetch(`${API_BASE_URL}/api/dongpa/indicators`);
  if (!response.ok) throw new Error('동파법 지표를 불러올 수 없습니다');
  return response.json();
}

/**
 * Run dongpa backtest
 */
export async function runDongpaBacktest(
  request: DongpaBacktestRequest,
): Promise<DongpaBacktestResponse> {
  const response = await fetch(`${API_BASE_URL}/api/dongpa/backtest/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail || '동파법 백테스트에 실패했습니다');
  }

  return response.json();
}

/**
 * Run dongpa optimizer with SSE streaming
 */
export async function runDongpaOptimizerAPI(
  request: DongpaOptimizerRequest,
  callbacks: DongpaOptimizerCallbacks,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/dongpa/optimizer/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail || '동파법 옵티마이저에 실패했습니다');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('SSE 스트림을 읽을 수 없습니다');

  await parseSSEStream(reader, {
    start: (data) => callbacks.onStart?.(data as { jobId: string }),
    progress: (data) => callbacks.onProgress?.(data as { completed: number; total: number; percent: number }),
    results: (data) => callbacks.onResults?.(data as DongpaOptimizerResultItem[]),
    done: (data) => callbacks.onDone?.(data as { totalTime: number; resultsCount: number }),
    cancelled: (data) => callbacks.onCancelled?.(data as { jobId: string; completed: number; total: number }),
  });
}

/**
 * Cancel dongpa optimizer
 */
export async function cancelDongpaOptimizer(
  jobId: string,
): Promise<{ status: string; jobId: string }> {
  const response = await fetch(`${API_BASE_URL}/api/dongpa/optimizer/cancel/${jobId}`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('동파법 옵티마이저 취소에 실패했습니다');
  return response.json();
}

// ===== 떨사 Pro 추천 API =====

import { HeatmapResponse } from '@/types/dashboard';
import { RecommendResponse, RadarBacktestResponse } from '@/types/recommend';

export interface StrategyParamsOverride {
  dropPercent?: number;
  targetProfit?: number;
  stopLossDays?: number;
  stopLossDayBuy?: string;
}

export async function fetchStrategyRecommendation(
  targetDate?: string,
  forwardDays: number = 30,
  topN: number = 6,
  alpha: number = -0.05,
  initialCapital: number = 100000,
  strategyParams?: Record<string, StrategyParamsOverride>,
): Promise<RecommendResponse> {
  const response = await fetch(`${API_BASE_URL}/api/lab/strategy-recommend/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetDate: targetDate || null,
      forwardDays,
      topN,
      alpha,
      initialCapital,
      strategyParams: strategyParams || null,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail || '전략 추천 분석에 실패했습니다');
  }
  return response.json();
}

// ===== 레이더 백테스트 API =====

export interface RadarBacktestRequest {
  startDate?: string;
  endDate?: string;
  initialCapital: number;
  forwardDays?: number;
  topN?: number;
  alpha?: number;
  strategyParams?: Record<string, StrategyParamsOverride>;
}

export async function runRadarBacktest(
  request: RadarBacktestRequest,
): Promise<RadarBacktestResponse> {
  const response = await fetch(`${API_BASE_URL}/api/lab/strategy-recommend/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail || '레이더 백테스트에 실패했습니다');
  }
  return response.json();
}

// ===== Dashboard API =====

export async function fetchDashboardHeatmap(): Promise<HeatmapResponse> {
  const response = await fetch(`${API_BASE_URL}/api/dashboard/heatmap`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || '히트맵 데이터를 불러올 수 없습니다');
  }
  return response.json();
}

/**
 * API client instance with all methods
 */
export const apiClient = {
  checkHealth: checkBackendHealth,
  strategies: {
    list: fetchStrategies,
  },
  backtest: {
    run: runBacktestAPI,
    dateRange: fetchDateRange,
  },
  crypto: {
    strategies: fetchCryptoStrategies,
    dateRange: fetchCryptoDateRange,
    run: runCryptoBacktestAPI,
  },
  optimizer: {
    list: fetchOptimizers,
    run: runOptimizerAPI,
    cancel: cancelOptimizer,
    cached: fetchCachedResults,
  },
dongpa: {
    qqqWeekly: fetchQQQWeeklyData,
    indicators: fetchDongpaIndicators,
    run: runDongpaBacktest,
    optimizer: {
      run: runDongpaOptimizerAPI,
      cancel: cancelDongpaOptimizer,
    },
  },
  lab: {
    recommend: fetchStrategyRecommendation,
    radarBacktest: runRadarBacktest,
  },
  dashboard: {
    heatmap: fetchDashboardHeatmap,
  },
};

export default apiClient;
