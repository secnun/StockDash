'use client';

import { useState, useCallback } from 'react';
import { getStrategy } from '@/lib/strategies';
import { loadCSVFromFile } from '@/lib/backtest/dataLoader';
import { SelectedStrategy, CompareResult, OHLCV } from '@/types/backtest';
import { getStrategyColor } from '@/lib/theme/chartTheme';
import StrategyCard from './StrategyCard';
import CompareMetricsTable from './CompareMetricsTable';
import MultiEquityChart from '@/components/backtest/Charts/MultiEquityChart';
import MultiDrawdownChart from '@/components/backtest/Charts/MultiDrawdownChart';

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
  const [selectedStrategies, setSelectedStrategies] = useState<SelectedStrategy[]>([
    { id: generateUniqueId(), strategyId: '', params: {} },
  ]);
  const [results, setResults] = useState<CompareResult[]>([]);
  const [chartData, setChartData] = useState<OHLCV[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // 비교 실행
  const runCompare = useCallback(async () => {
    // 선택된 전략 필터링
    const validStrategies = selectedStrategies.filter(s => s.strategyId);
    if (validStrategies.length === 0) {
      setError('최소 1개의 전략을 선택해주세요');
      return;
    }

    const ticker = tickers.find(t => t.id === selectedTicker);
    if (!ticker) {
      setError('티커를 선택해주세요');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // CSV 데이터 로드
      let data = await loadCSVFromFile(ticker.file);

      if (data.length === 0) {
        throw new Error('데이터를 불러올 수 없습니다');
      }

      // 기간 필터링
      if (startDate && endDate) {
        const startTs = new Date(startDate).getTime() / 1000;
        const endTs = new Date(endDate).getTime() / 1000 + 86400;
        data = data.filter(d => d.time >= startTs && d.time <= endTs);
      }

      if (data.length === 0) {
        throw new Error('선택한 기간에 데이터가 없습니다');
      }

      const initialCapital = Number(initialCapitalStr) || 10000;

      // 병렬 실행
      const compareResults = await Promise.all(
        validStrategies.map(async (selected, index) => {
          const strategy = getStrategy(selected.strategyId);
          if (!strategy) {
            throw new Error(`전략을 찾을 수 없습니다: ${selected.strategyId}`);
          }

          const result = strategy.execute(data, {
            ...selected.params,
            initialCapital,
            applyFee,
          });

          return {
            strategyId: selected.id,
            strategyName: strategy.name,
            result,
            color: getStrategyColor(index),
          };
        })
      );

      setResults(compareResults);
      setChartData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '비교 실행 중 오류 발생');
      console.error('Compare error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStrategies, tickers, selectedTicker, startDate, endDate, initialCapitalStr, applyFee]);

  const canAddMore = selectedStrategies.length < MAX_STRATEGIES;
  const validStrategyCount = selectedStrategies.filter(s => s.strategyId).length;

  return (
    <div className="space-y-4">
      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
        </div>
      )}

      {/* 전략 카드 목록 */}
      <div className="space-y-2">
        {selectedStrategies.map((selected, index) => (
          <StrategyCard
            key={selected.id}
            selectedStrategy={selected}
            color={getStrategyColor(index)}
            index={index}
            onRemove={() => removeStrategy(selected.id)}
            onUpdate={updateStrategy}
          />
        ))}
      </div>

      {/* 전략 추가 및 실행 버튼 */}
      <div className="flex items-center gap-3">
        {canAddMore && (
          <button
            onClick={addStrategy}
            className="px-4 py-2 text-sm border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            전략 추가 ({selectedStrategies.length}/{MAX_STRATEGIES})
          </button>
        )}

        <button
          onClick={runCompare}
          disabled={loading || validStrategyCount === 0}
          className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
        >
          {loading ? '실행중...' : '비교 실행'}
        </button>
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
        </div>
      )}

      {/* 결과 없을 때 */}
      {results.length === 0 && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            전략을 선택하고 비교 실행을 클릭해주세요
          </p>
        </div>
      )}
    </div>
  );
}
