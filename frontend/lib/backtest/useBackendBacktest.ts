/**
 * useBackendBacktest Hook
 *
 * Provides backend-only backtest execution.
 * Client-side fallback has been removed for strategy protection.
 *
 * Features:
 * - Health check on mount to detect backend availability
 * - Strategy fetching from backend API
 * - Error state when backend is unavailable
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

import { BacktestResult, ParameterValue } from '@/types/backtest';
import { checkBackendHealth, runBacktestAPI, fetchStrategies, fetchDateRange, StrategyInfo, DateRangeResponse } from '@/lib/api/client';

export type ExecutionMode = 'backend' | 'unavailable' | 'checking';

export interface UseBackendBacktestOptions {
  /** Health check interval in ms (0 to disable periodic checks) */
  healthCheckInterval?: number;
}

export interface BacktestExecuteParams {
  strategyId: string;
  tickerId: string;
  startDate?: string;
  endDate?: string;
  initialCapital: number;
  parameters: Record<string, ParameterValue>;
  applyFee?: boolean;
}

export interface UseBackendBacktestReturn {
  /** Current execution mode */
  mode: ExecutionMode;
  /** Whether backend is available */
  isBackendAvailable: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Run a backtest (requires backend) */
  runBacktest: (params: BacktestExecuteParams) => Promise<BacktestResult>;
  /** Get list of available strategies from backend */
  getStrategies: () => Promise<StrategyInfo[]>;
  /** Get date range for a ticker */
  getDateRange: (tickerId: string) => Promise<DateRangeResponse>;
  /** Manually trigger health check */
  checkHealth: () => Promise<boolean>;
}

/**
 * Hook for backend-only backtest execution
 */
export function useBackendBacktest(
  options: UseBackendBacktestOptions = {}
): UseBackendBacktestReturn {
  const { healthCheckInterval = 0 } = options;

  const [mode, setModeState] = useState<ExecutionMode>('checking');
  const [isBackendAvailable, setIsBackendAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const healthCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Health check function
  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      const available = await checkBackendHealth();
      setIsBackendAvailable(available);
      setModeState(available ? 'backend' : 'unavailable');
      if (!available) {
        setError('서버 연결 불가');
      } else {
        setError(null);
      }
      return available;
    } catch {
      setIsBackendAvailable(false);
      setModeState('unavailable');
      setError('서버 연결 불가');
      return false;
    }
  }, []);

  // Initial health check on mount
  useEffect(() => {
    // Schedule health check to avoid synchronous setState in effect
    const initialCheckTimeout = setTimeout(() => {
      void checkHealth();
    }, 0);

    // Setup periodic health check if interval is set
    if (healthCheckInterval > 0) {
      const intervalCheck = () => {
        healthCheckTimeoutRef.current = setTimeout(async () => {
          await checkHealth();
          intervalCheck();
        }, healthCheckInterval);
      };
      intervalCheck();
    }

    return () => {
      clearTimeout(initialCheckTimeout);
      if (healthCheckTimeoutRef.current) {
        clearTimeout(healthCheckTimeoutRef.current);
      }
    };
  }, [checkHealth, healthCheckInterval]);

  // Run backtest (backend only)
  const runBacktest = useCallback(
    async (params: BacktestExecuteParams): Promise<BacktestResult> => {
      // Check backend availability first
      if (!isBackendAvailable) {
        throw new Error('서버 연결 불가');
      }

      setIsLoading(true);
      setError(null);

      const {
        strategyId,
        tickerId,
        startDate,
        endDate,
        initialCapital,
        parameters,
        applyFee = true,
      } = params;

      try {
        const result = await runBacktestAPI({
          strategyId,
          tickerId,
          startDate,
          endDate,
          initialCapital,
          parameters,
          applyFee,
        });
        setIsLoading(false);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '백테스트 실행 실패';
        setError(errorMessage);
        setIsLoading(false);
        throw new Error(errorMessage);
      }
    },
    [isBackendAvailable]
  );

  // Get strategies from backend
  const getStrategiesFunc = useCallback(async (): Promise<StrategyInfo[]> => {
    if (!isBackendAvailable) {
      console.warn('Backend unavailable, returning empty strategy list');
      return [];
    }

    try {
      return await fetchStrategies();
    } catch (err) {
      console.error('Failed to fetch strategies from backend:', err);
      return [];
    }
  }, [isBackendAvailable]);

  // Get date range for a ticker
  const getDateRangeFunc = useCallback(async (tickerId: string): Promise<DateRangeResponse> => {
    if (!isBackendAvailable) {
      throw new Error('서버 연결 불가');
    }

    try {
      return await fetchDateRange(tickerId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '날짜 범위 조회 실패';
      throw new Error(errorMessage);
    }
  }, [isBackendAvailable]);

  return {
    mode,
    isBackendAvailable,
    isLoading,
    error,
    runBacktest,
    getStrategies: getStrategiesFunc,
    getDateRange: getDateRangeFunc,
    checkHealth,
  };
}

export default useBackendBacktest;
