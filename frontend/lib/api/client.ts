/**
 * API Client for StockDash Backend
 *
 * Communicates with the Python FastAPI backend for:
 * - Single backtest execution
 * - Grid search (deep mining) with SSE progress
 * - Strategy listing
 */

import { BacktestResult, OHLCV, ParameterValue } from '@/types/backtest';

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
}

export interface DateRangeResponse {
  min: string;
  max: string;
}

export interface ParamRange {
  min: number;
  max: number;
  step: number;
}

export interface GridSearchRequest {
  strategyId: string;
  tickerId: string;
  paramRanges: Record<string, ParamRange>;
  initialCapital: number;
  topN?: number;
  startDate?: string;
  endDate?: string;
  applyFee?: boolean;
}

export interface GridSearchProgress {
  completed: number;
  total: number;
  percent: number;
}

export interface GridSearchResultItem {
  rank: number;
  params: Record<string, ParameterValue>;
  metrics: BacktestResponse['metrics'];
}

export interface GridSearchDone {
  totalTime: number;
  resultsCount: number;
}

export interface RankedResultItem {
  rank: number;
  params: Record<string, ParameterValue>;
  metrics: BacktestResponse['metrics'];
  compositeScore: number;
}

export interface GridSearchRankings {
  byReturn: RankedResultItem[];
  byMdd: RankedResultItem[];
  byComposite: RankedResultItem[];
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
    throw new Error(`Failed to fetch strategies: ${response.statusText}`);
  }
  const data = await response.json();
  return data.strategies;
}

/**
 * Get strategy details by ID
 */
export async function fetchStrategy(strategyId: string): Promise<StrategyInfo> {
  const response = await fetch(`${API_BASE_URL}/api/strategies/${strategyId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch strategy: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get date range for a ticker
 */
export async function fetchDateRange(tickerId: string): Promise<DateRangeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/backtest/date-range/${tickerId}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || 'Failed to fetch date range');
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
    throw new Error(error.detail || 'Backtest failed');
  }

  const data: BacktestResponse = await response.json();

  // Convert to BacktestResult format
  return {
    trades: data.trades,
    equity: data.equity,
    metrics: data.metrics,
    priceData: data.priceData,
  };
}

/**
 * Grid search event types for SSE callbacks
 */
export interface GridSearchCallbacks {
  onProgress?: (progress: GridSearchProgress) => void;
  onResult?: (result: GridSearchResultItem) => void;
  onRankings?: (rankings: GridSearchRankings) => void;
  onDone?: (done: GridSearchDone) => void;
  onError?: (error: Error) => void;
}

/**
 * Run grid search with SSE progress streaming
 */
export async function runGridSearchAPI(
  request: GridSearchRequest,
  callbacks: GridSearchCallbacks
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/backtest/grid-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || 'Grid search failed');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      let currentEvent = '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data) {
            try {
              const parsed = JSON.parse(data);
              switch (currentEvent) {
                case 'progress':
                  callbacks.onProgress?.(parsed as GridSearchProgress);
                  break;
                case 'result':
                  callbacks.onResult?.(parsed as GridSearchResultItem);
                  break;
                case 'rankings':
                  callbacks.onRankings?.(parsed as GridSearchRankings);
                  break;
                case 'done':
                  callbacks.onDone?.(parsed as GridSearchDone);
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
 * API client instance with all methods
 */
export const apiClient = {
  checkHealth: checkBackendHealth,
  strategies: {
    list: fetchStrategies,
    get: fetchStrategy,
  },
  backtest: {
    run: runBacktestAPI,
    gridSearch: runGridSearchAPI,
    dateRange: fetchDateRange,
  },
};

export default apiClient;
