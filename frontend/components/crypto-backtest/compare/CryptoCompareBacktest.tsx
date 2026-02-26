'use client';

import { useState, useCallback, useEffect } from 'react';
import { getStrategyColor } from '@/lib/theme/chartTheme';
import { fetchCryptoStrategies, runCryptoBacktestAPI, StrategyInfo } from '@/lib/api/client';
import { BacktestResult, CompareResult } from '@/types/backtest';
import CryptoStrategyCard from './CryptoStrategyCard';
import MultiEquityChart from '@/components/backtest/Charts/MultiEquityChart';
import MultiDrawdownChart from '@/components/backtest/Charts/MultiDrawdownChart';
import CompareYearlyStatsGrid from '@/components/backtest/Charts/CompareYearlyStatsGrid';

interface Coin {
  id: string;
  name: string;
  symbol: string;
}

interface Market {
  id: string;
  name: string;
  symbol: string;
}

interface SelectedStrategy {
  id: string;
  strategyId: string;
  params: Record<string, number | ''>;
}

interface CryptoCompareBacktestProps {
  coins: Coin[];
  selectedCoin: string;
  markets: Market[];
  selectedMarket: string;
  initialCapitalStr: string;
  startDate: string;
  endDate: string;
  applyFee: boolean;
}

const MAX_STRATEGIES = 4;

function generateUniqueId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export default function CryptoCompareBacktest({
  coins,
  selectedCoin,
  markets,
  selectedMarket,
  initialCapitalStr,
  startDate,
  endDate,
  applyFee,
}: CryptoCompareBacktestProps) {
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(true);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [selectedStrategies, setSelectedStrategies] = useState<SelectedStrategy[]>([
    { id: generateUniqueId(), strategyId: '', params: {} },
  ]);
  const [results, setResults] = useState<CompareResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialCapital = parseInt(initialCapitalStr, 10) || 10000;

  // Fetch strategies from backend
  useEffect(() => {
    const loadStrategies = async () => {
      try {
        const data = await fetchCryptoStrategies();
        setStrategies(data);
        setBackendAvailable(true);
      } catch (err) {
        console.error('Failed to fetch strategies:', err);
        setBackendAvailable(false);
        setError('백엔드 서버에 연결할 수 없습니다');
      } finally {
        setStrategiesLoading(false);
      }
    };
    void loadStrategies();
  }, []);

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
    const validStrategies = selectedStrategies.filter(s => s.strategyId);
    if (validStrategies.length === 0) {
      setError('최소 1개의 전략을 선택해주세요');
      return;
    }

    if (!startDate || !endDate) {
      setError('날짜를 선택해주세요');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const compareResults: CompareResult[] = [];

      // 각 전략에 대해 백테스트 실행
      for (let i = 0; i < validStrategies.length; i++) {
        const selected = validStrategies[i];
        const strategy = strategies.find(s => s.id === selected.strategyId);

        const result = await runCryptoBacktestAPI({
          coin: selectedCoin,
          market: selectedMarket,
          strategyId: selected.strategyId,
          initialCapital,
          startDate,
          endDate,
          applyFee,
          parameters: selected.params,
        });

        compareResults.push({
          strategyId: selected.id,
          strategyName: strategy?.name || selected.strategyId,
          result,
          color: getStrategyColor(i),
        });
      }

      setResults(compareResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : '비교 실행 중 오류 발생');
    } finally {
      setLoading(false);
    }
  }, [selectedStrategies, strategies, selectedCoin, selectedMarket, initialCapital, startDate, endDate, applyFee]);

  const canAddMore = selectedStrategies.length < MAX_STRATEGIES;
  const validStrategyCount = selectedStrategies.filter(s => s.strategyId).length;
  const selectedCoinData = coins.find(c => c.id === selectedCoin);
  const selectedMarketData = markets.find(m => m.id === selectedMarket);

  // priceData는 첫 번째 결과에서 가져옴 (모든 전략이 같은 데이터 사용)
  const priceData = results.length > 0 ? results[0].result.priceData : undefined;

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
          <CryptoStrategyCard
            key={selected.id}
            selectedStrategy={selected}
            strategies={strategies}
            color={getStrategyColor(index)}
            index={index}
            onRemove={() => removeStrategy(selected.id)}
            onUpdate={updateStrategy}
            disabled={loading || strategiesLoading}
          />
        ))}
      </div>

      {/* 전략 추가 및 실행 버튼 */}
      <div className="flex items-center gap-3">
        {canAddMore && (
          <button
            onClick={addStrategy}
            disabled={loading || strategiesLoading}
            className="px-4 py-2 text-sm border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            전략 추가 ({selectedStrategies.length}/{MAX_STRATEGIES})
          </button>
        )}

        <button
          onClick={runCompare}
          disabled={loading || validStrategyCount === 0 || !backendAvailable}
          className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
        >
          {loading ? '실행중...' : '비교 실행'}
        </button>

        {/* 백엔드 상태 표시 */}
        <span className={`px-2 py-1 text-xs rounded ${backendAvailable ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
          {strategiesLoading ? '로딩중...' : backendAvailable ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* 결과 표시 */}
      {results.length > 0 && (
        <div className="space-y-4">
          {/* 성과 비교 테이블 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">전략</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">총 수익률</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">CAGR</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">MDD</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">승률</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">거래</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {results.map((r) => (
                  <tr key={r.strategyId}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: r.color }}
                        />
                        <span className="text-gray-900 dark:text-white">{r.strategyName}</span>
                      </div>
                    </td>
                    <td className={`px-4 py-2 text-right ${r.result.metrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {r.result.metrics.totalReturn.toFixed(2)}%
                    </td>
                    <td className={`px-4 py-2 text-right ${r.result.metrics.cagr >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {r.result.metrics.cagr.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2 text-right text-red-600">
                      {r.result.metrics.mdd.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">
                      {r.result.metrics.winRate.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">
                      {r.result.metrics.totalTrades}회
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Equity 오버레이 차트 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-4">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Equity Comparison</h2>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="flex items-center gap-1 text-gray-400">
                    <span className="w-3 h-0.5 bg-indigo-400/40 inline-block"></span>
                    {selectedCoinData?.symbol}/{selectedMarketData?.name || 'Price'}
                  </span>
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
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {startDate} ~ {endDate}
              </div>
            </div>
            <div className="h-[350px]">
              <MultiEquityChart
                results={results}
                initialCapital={initialCapital}
                priceData={priceData}
                tickerName={`${selectedCoinData?.symbol}/${selectedMarketData?.name}`}
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
            전략을 선택하고 비교 실행을 클릭해주세요
          </p>
        </div>
      )}
    </div>
  );
}
