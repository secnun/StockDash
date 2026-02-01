'use client';

import { useState, useCallback, useEffect } from 'react';
import { SelectedStrategy, CompareResult, OHLCV, BacktestResult } from '@/types/backtest';
import { StrategyInfo } from '@/lib/api/client';
import { getStrategyColor } from '@/lib/theme/chartTheme';
import StrategyCard from './StrategyCard';
import CompareMetricsTable from './CompareMetricsTable';
import MultiEquityChart from '@/components/backtest/Charts/MultiEquityChart';
import MultiDrawdownChart from '@/components/backtest/Charts/MultiDrawdownChart';
import CompareYearlyStatsGrid from '@/components/backtest/Charts/CompareYearlyStatsGrid';
import { useBackendBacktest, ExecutionMode } from '@/lib/backtest/useBackendBacktest';

interface Ticker {
  id: string;
  name: string;
  file: string;
}

interface CompareBacktestProps {
  tickers: Ticker[];
  selectedTicker: string;
  initialCapitalStr: string;
  startDate: string;
  endDate: string;
  applyFee: boolean;
}

const MAX_STRATEGIES = 4;

function generateUniqueId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export default function CompareBacktest({
  tickers,
  selectedTicker,
  initialCapitalStr,
  startDate,
  endDate,
  applyFee,
}: CompareBacktestProps) {
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<SelectedStrategy[]>([
    { id: generateUniqueId(), strategyId: '', params: {} },
  ]);
  const [results, setResults] = useState<CompareResult[]>([]);
  const [chartData, setChartData] = useState<OHLCV[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Backend integration hook
  const {
    mode: executionMode,
    isBackendAvailable,
    error: backendError,
    runBacktest: runBacktestAPI,
    getStrategies,
  } = useBackendBacktest();

  // Load strategies from backend
  useEffect(() => {
    if (isBackendAvailable) {
      getStrategies().then(setStrategies).catch(console.error);
    }
  }, [isBackendAvailable, getStrategies]);

  // 전략 추가
  const addStrategy = useCallback(() => {
    if (selectedStrategies.length >= MAX_STRATEGIES) return;
    setSelectedStrategies(prev => [
      ...prev,
      { id: generateUniqueId(), strategyId: '', params: {} },
    ]);
  }, [selectedStrategies.length]);

  // 전략 제거
  const removeStrategy = useCallback((id: string) => {
    setSelectedStrategies(prev => prev.filter(s => s.id !== id));
  }, []);

  // 전략 업데이트
  const updateStrategy = useCallback((updated: SelectedStrategy) => {
    setSelectedStrategies(prev =>
      prev.map(s => s.id === updated.id ? updated : s)
    );
  }, []);

  // 비교 실행 (백엔드 전용)
  const runCompare = useCallback(async () => {
    // 백엔드 가용성 체크
    if (!isBackendAvailable) {
      setError('서버 연결 불가');
      return;
    }

    // 선택된 전략 필터링
    const validStrategies = selectedStrategies.filter(s => s.strategyId);
    if (validStrategies.length === 0) {
      setError('최소 1개의 전략을 선택해주세요');
      return;
    }

    if (!selectedTicker) {
      setError('티커를 선택해주세요');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const initialCapital = Number(initialCapitalStr) || 10000;

      // 병렬 실행 (백엔드 API - priceData 포함)
      const compareResults = await Promise.all(
        validStrategies.map(async (selected, index) => {
          const strategy = strategies.find(s => s.id === selected.strategyId);
          const strategyName = strategy?.name || selected.strategyId;

          const result: BacktestResult = await runBacktestAPI({
            strategyId: selected.strategyId,
            tickerId: selectedTicker,
            startDate,
            endDate,
            initialCapital,
            parameters: selected.params,
            applyFee,
          });

          return {
            strategyId: selected.id,
            strategyName,
            result,
            color: getStrategyColor(index),
          };
        })
      );

      setResults(compareResults);
      // priceData는 첫 번째 결과에서 가져옴 (모두 동일한 데이터)
      if (compareResults.length > 0 && compareResults[0].result.priceData) {
        setChartData(compareResults[0].result.priceData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '비교 실행 중 오류 발생');
      console.error('Compare error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStrategies, strategies, selectedTicker, startDate, endDate, initialCapitalStr, applyFee, isBackendAvailable, runBacktestAPI]);

  const canAddMore = selectedStrategies.length < MAX_STRATEGIES;
  const validStrategyCount = selectedStrategies.filter(s => s.strategyId).length;

  // 실행 모드 표시 텍스트
  const getModeLabel = (mode: ExecutionMode) => {
    switch (mode) {
      case 'backend': return 'Online';
      case 'checking': return '...';
      case 'unavailable': return 'Offline';
    }
  };

  // 실행 모드 색상
  const getModeStyle = (mode: ExecutionMode) => {
    switch (mode) {
      case 'backend':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'checking':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'unavailable':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    }
  };

  return (
    <div className="space-y-4">
      {/* 에러 메시지 */}
      {(error || backendError) && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-red-800 dark:text-red-200 text-sm">{error || backendError}</p>
        </div>
      )}

      {/* 전략 카드 목록 */}
      <div className="space-y-2">
        {selectedStrategies.map((selected, index) => (
          <StrategyCard
            key={selected.id}
            selectedStrategy={selected}
            strategies={strategies}
            color={getStrategyColor(index)}
            index={index}
            onRemove={() => removeStrategy(selected.id)}
            onUpdate={updateStrategy}
            disabled={!isBackendAvailable}
          />
        ))}
      </div>

      {/* 전략 추가 및 실행 버튼 */}
      <div className="flex items-center gap-3">
        {canAddMore && (
          <button
            onClick={addStrategy}
            disabled={!isBackendAvailable}
            className="px-4 py-2 text-sm border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            전략 추가 ({selectedStrategies.length}/{MAX_STRATEGIES})
          </button>
        )}

        <button
          onClick={runCompare}
          disabled={loading || validStrategyCount === 0 || !isBackendAvailable}
          className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
        >
          {loading ? '실행중...' : '비교 실행'}
        </button>

        {/* 실행 모드 표시 */}
        <span
          className={`px-2 py-1 text-xs rounded ${getModeStyle(executionMode)}`}
          title={isBackendAvailable ? '서버 연결됨' : '서버 연결 필요'}
        >
          {getModeLabel(executionMode)}
        </span>
      </div>

      {/* 결과 표시 */}
      {results.length > 0 && (
        <div className="space-y-4">
          {/* 성과 비교 테이블 */}
          <CompareMetricsTable results={results} />

          {/* Equity 오버레이 차트 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-4">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Equity Comparison</h2>
                <div className="flex flex-wrap gap-3 text-xs">
                  {/* 티커 범례 */}
                  <span className="flex items-center gap-1 text-gray-400">
                    <span className="w-3 h-0.5 bg-indigo-400/40 inline-block"></span>
                    {tickers.find(t => t.id === selectedTicker)?.name || 'Price'}
                  </span>
                  {/* 전략 범례 */}
                  {results.map((r) => (
                    <span key={r.strategyId} className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                      <span
                        className="w-3 h-0.5 inline-block"
                        style={{ backgroundColor: r.color }}
                      />
                      {r.strategyName}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="h-[350px]">
              <MultiEquityChart
                results={results}
                initialCapital={Number(initialCapitalStr) || 10000}
                priceData={chartData}
                tickerName={tickers.find(t => t.id === selectedTicker)?.name}
              />
            </div>
          </div>

          {/* Drawdown 오버레이 차트 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Drawdown Comparison</h2>
            <div className="h-[200px]">
              <MultiDrawdownChart results={results} />
            </div>
          </div>

          {/* 연도별 결과 테이블 그리드 */}
          <CompareYearlyStatsGrid results={results} />
        </div>
      )}

      {/* 결과 없을 때 */}
      {results.length === 0 && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {isBackendAvailable
              ? '전략을 선택하고 비교 실행을 클릭해주세요'
              : '서버 연결 불가'}
          </p>
        </div>
      )}
    </div>
  );
}
