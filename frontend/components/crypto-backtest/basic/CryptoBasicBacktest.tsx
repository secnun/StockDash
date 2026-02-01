'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { fetchCryptoStrategies, runCryptoBacktestAPI, StrategyInfo } from '@/lib/api/client';
import { BacktestResult } from '@/types/backtest';
import EquityChart from '@/components/backtest/Charts/EquityChart';
import DrawdownChart from '@/components/backtest/Charts/DrawdownChart';
import YearlyStatsTable from '@/components/backtest/Charts/YearlyStatsTable';

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

interface CryptoBasicBacktestProps {
  coins: Coin[];
  selectedCoin: string;
  markets: Market[];
  selectedMarket: string;
  initialCapitalStr: string;
  startDate: string;
  endDate: string;
  applyFee: boolean;
}

export default function CryptoBasicBacktest({
  coins,
  selectedCoin,
  markets,
  selectedMarket,
  initialCapitalStr,
  startDate,
  endDate,
  applyFee,
}: CryptoBasicBacktestProps) {
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState('');
  const [parameters, setParameters] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [strategiesLoading, setStrategiesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [backendAvailable, setBackendAvailable] = useState(true);

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

  const selectedStrategy = strategies.find(s => s.id === selectedStrategyId);
  const initialCapital = parseInt(initialCapitalStr, 10) || 10000;

  // 전략 선택 시 기본 파라미터 설정
  const handleStrategyChange = useCallback((strategyId: string) => {
    setSelectedStrategyId(strategyId);
    setResult(null);
    setError(null);

    const strategy = strategies.find(s => s.id === strategyId);
    if (strategy) {
      const defaultParams: Record<string, number> = {};
      strategy.parameters.forEach((param) => {
        defaultParams[param.key] = param.default as number;
      });
      setParameters(defaultParams);
    }
  }, [strategies]);

  // 파라미터 변경
  const handleParameterChange = useCallback((key: string, value: number) => {
    setParameters((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  // 백테스트 실행
  const runBacktest = useCallback(async () => {
    if (!selectedStrategy) {
      setError('전략을 선택해주세요');
      return;
    }

    if (!startDate || !endDate) {
      setError('날짜를 선택해주세요');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await runCryptoBacktestAPI({
        coin: selectedCoin,
        market: selectedMarket,
        strategyId: selectedStrategyId,
        initialCapital,
        startDate,
        endDate,
        applyFee,
        parameters,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : '백테스트 실행 중 오류 발생');
    } finally {
      setLoading(false);
    }
  }, [selectedStrategy, selectedCoin, selectedMarket, selectedStrategyId, initialCapital, startDate, endDate, applyFee, parameters]);

  // 성과 지표 카드 데이터 메모이제이션
  const metricCards = useMemo(() => [
    { label: '총 수익률', value: result?.metrics.totalReturn.toFixed(2) || '-', unit: '%', color: result && result.metrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600' },
    { label: 'CAGR', value: result?.metrics.cagr.toFixed(2) || '-', unit: '%', color: result && result.metrics.cagr >= 0 ? 'text-green-600' : 'text-red-600' },
    { label: 'MDD', value: result?.metrics.mdd.toFixed(2) || '-', unit: '%', color: 'text-red-600' },
    { label: '승률', value: result?.metrics.winRate.toFixed(1) || '-', unit: '%', color: 'text-gray-600 dark:text-gray-300' },
    { label: '거래', value: result?.metrics.totalTrades.toString() || '-', unit: '회', color: 'text-gray-600 dark:text-gray-300' },
  ], [result]);

  const selectedCoinData = coins.find(c => c.id === selectedCoin);
  const selectedMarketData = markets.find(m => m.id === selectedMarket);

  return (
    <div className="space-y-4">
      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
        </div>
      )}

      {/* 전략 선택 및 실행 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* 전략 선택 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">전략</label>
            <select
              value={selectedStrategyId}
              onChange={(e) => handleStrategyChange(e.target.value)}
              disabled={strategiesLoading || !backendAvailable}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
            >
              <option value="">{strategiesLoading ? '로딩중...' : '선택'}</option>
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>{strategy.name}</option>
              ))}
            </select>
          </div>

          {/* 실행 버튼 */}
          <div className="flex items-center gap-2">
            <button
              onClick={runBacktest}
              disabled={loading || !selectedStrategyId || !backendAvailable}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded transition-colors"
            >
              {loading ? '실행중...' : '실행'}
            </button>
            {/* 백엔드 상태 표시 */}
            <span className={`px-2 py-0.5 text-xs rounded ${backendAvailable ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
              {backendAvailable ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {/* 전략 파라미터 - 선택 시에만 표시 */}
        {selectedStrategy && selectedStrategy.parameters.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap gap-3 items-end">
              {selectedStrategy.parameters.map((param) => (
                <div key={param.key} className="flex-shrink-0">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{param.label}</label>
                  <input
                    type="number"
                    value={parameters[param.key] ?? param.default}
                    onChange={(e) => handleParameterChange(param.key, Number(e.target.value))}
                    min={param.min}
                    max={param.max}
                    step={param.step || 1}
                    className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 성과 지표 */}
      <div className="grid grid-cols-5 gap-2">
        {metricCards.map((metric) => (
          <div key={metric.label} className="bg-white dark:bg-gray-800 rounded-lg shadow p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">{metric.label}</div>
            <div className={`text-lg font-bold ${metric.color}`}>
              {metric.value}<span className="text-xs font-normal ml-0.5">{metric.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 차트 영역 */}
      {result ? (
        <div className="space-y-4">
          {/* Equity 차트 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Equity & Price</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {selectedCoinData?.symbol}/{selectedMarketData?.name} · {startDate} ~ {endDate}
              </div>
            </div>
            <div className="h-[350px]">
              <EquityChart
                equity={result.equity}
                initialCapital={initialCapital}
                priceData={result.priceData}
              />
            </div>
          </div>

          {/* 드로우다운 차트 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Drawdown</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                MDD: {result.metrics.mdd.toFixed(2)}%
              </div>
            </div>
            <div className="h-[150px]">
              <DrawdownChart equity={result.equity} />
            </div>
          </div>

          {/* 연도별 결과 테이블 */}
          <YearlyStatsTable equity={result.equity} trades={result.trades} />
        </div>
      ) : (
        !loading && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              전략을 선택하고 실행해주세요
            </p>
          </div>
        )
      )}
    </div>
  );
}
