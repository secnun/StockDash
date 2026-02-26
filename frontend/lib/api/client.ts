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
  SwitchingBacktestRequest,
  SwitchingBacktestResponse,
  IndicatorInfo,
  SwitchingOptimizerRequest,
  SwitchingOptimizerCallbacks,
} from '@/types/switching';

// Backend API base URL - can be overridden via environment variable
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
export async function fetchCryptoDateRange(coin: string, market: string): Promise<DateRangeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/crypto/date-range?coin=${encodeURIComponent(coin)}&market=${encodeURIComponent(market)}`);
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
              switch (currentEvent) {
                case 'start':
                  callbacks.onStart?.(parsed as OptimizerStartResponse);
                  break;
                case 'progress':
                  callbacks.onProgress?.(parsed as GridSearchProgress);
                  break;
                case 'yearly_rankings':
                  callbacks.onYearlyRankings?.(parsed as YearlyRankings);
                  break;
                case 'done':
                  callbacks.onDone?.(parsed as GridSearchDone);
                  break;
                case 'cache_info':
                  callbacks.onCacheInfo?.(parsed as GridSearchCacheInfo);
                  break;
                case 'cancelled':
                  callbacks.onCancelled?.(parsed as OptimizerCancelled);
                  break;
                case 'error':
                  callbacks.onError?.(new Error((parsed as { message?: string }).message ?? 'Optimizer error'));
                  break;
              }
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
 * Switching Backtest API
 */

/**
 * Run switching backtest
 */
export async function runSwitchingBacktest(request: SwitchingBacktestRequest): Promise<SwitchingBacktestResponse> {
  const response = await fetch(`${API_BASE_URL}/api/switching/backtest/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || '스위칭 백테스트 실행에 실패했습니다');
  }

  return response.json();
}

/**
 * Get available indicators for switching rules
 */
export async function fetchSwitchingIndicators(): Promise<IndicatorInfo[]> {
  const response = await fetch(`${API_BASE_URL}/api/switching/indicators`);
  if (!response.ok) {
    throw new Error(`지표 목록을 불러올 수 없습니다: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Run switching trigger optimizer with SSE progress streaming
 */
export async function runSwitchingOptimizerAPI(
  request: SwitchingOptimizerRequest,
  callbacks: SwitchingOptimizerCallbacks,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/switching/optimizer/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || '스위칭 옵티마이저 실행에 실패했습니다');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('응답 데이터를 읽을 수 없습니다');
  }

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
              switch (currentEvent) {
                case 'start':
                  callbacks.onStart?.(parsed);
                  break;
                case 'progress':
                  callbacks.onProgress?.(parsed);
                  break;
                case 'results':
                  callbacks.onResults?.(parsed);
                  break;
                case 'done':
                  callbacks.onDone?.(parsed);
                  break;
                case 'cancelled':
                  callbacks.onCancelled?.(parsed);
                  break;
              }
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
 * Cancel switching optimizer execution
 */
export async function cancelSwitchingOptimizer(
  jobId: string,
): Promise<{ status: string; jobId: string }> {
  const response = await fetch(`${API_BASE_URL}/api/switching/optimizer/cancel/${jobId}`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('스위칭 옵티마이저 취소에 실패했습니다');
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
  switching: {
    run: runSwitchingBacktest,
    indicators: fetchSwitchingIndicators,
    optimizer: {
      run: runSwitchingOptimizerAPI,
      cancel: cancelSwitchingOptimizer,
    },
  },
};

export default apiClient;
