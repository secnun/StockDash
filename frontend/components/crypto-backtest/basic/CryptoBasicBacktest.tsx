'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { fetchCryptoStrategies, runCryptoBacktestAPI, StrategyInfo } from '@/lib/api/client';
import { BacktestResult } from '@/types/backtest';
import EquityChart from '@/components/backtest/Charts/EquityChart';
import DrawdownChart from '@/components/backtest/Charts/DrawdownChart';
import CashChart from '@/components/backtest/Charts/CashChart';
import YearlyStatsSection from '@/components/backtest/Charts/YearlyStatsSection';
import { backestResultToCSV, downloadCSV, generateFilename } from '@/lib/backtest/csvExport';
import { getModeLabel, getModeStyle } from '@/lib/utils/modeHelpers';
import MetricsCards, { buildMetricCards } from '@/components/backtest/MetricsCards';
import type { ExecutionMode } from '@/lib/backtest/useBackendBacktest';

interface Coin {
  id: string;
  name: string;
  symbol: string;
}

interface Exchange {
  id: string;
  name: string;
  currency: string;
  currencySymbol: string;
}

interface CryptoBasicBacktestProps {
  coins: Coin[];
  selectedCoin: string;
  exchanges: Exchange[];
  selectedExchange: string;
  initialCapitalStr: string;
  startDate: string;
  endDate: string;
  applyFee: boolean;
  timeframe?: string;
}

export default function CryptoBasicBacktest({
  coins,
  selectedCoin,
  exchanges,
  selectedExchange,
  initialCapitalStr,
  startDate,
  endDate,
  applyFee,
  timeframe = '4h',
}: CryptoBasicBacktestProps) {
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState('');
  const [parameters, setParameters] = useState<Record<string, number | ''>>({});
  const [loading, setLoading] = useState(false);
  const [strategiesLoading, setStrategiesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [cashDisplayMode, setCashDisplayMode] = useState<'amount' | 'ratio'>('ratio');

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
  const handleParameterChange = useCallback((key: string, value: number | '') => {
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
        market: selectedExchange,
        strategyId: selectedStrategyId,
        initialCapital,
        startDate,
        endDate,
        applyFee,
        timeframe,
        parameters,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : '백테스트 실행 중 오류 발생');
    } finally {
      setLoading(false);
    }
  }, [selectedStrategy, selectedCoin, selectedExchange, selectedStrategyId, initialCapital, startDate, endDate, applyFee, timeframe, parameters]);

  // 0% 진입 횟수 계산
  const cashZeroCount = useMemo(() => {
    if (!result?.cash || !result?.equity) return 0;
    const initialCap = Number(initialCapitalStr) || 10000;
    const ratios = result.cash.map((point, index) => {
      const equityValue = result.equity[index]?.value || initialCap;
      return equityValue > 0 ? (point.value / equityValue) * 100 : 0;
    });
    return ratios.filter((ratio, index) => {
      const isZero = ratio === 0 || ratio < 0.1;
      const prevWasNotZero = index === 0 || ratios[index - 1] >= 0.1;
      return isZero && prevWasNotZero;
    }).length;
  }, [result, initialCapitalStr]);

  // 성과 지표 카드 데이터 메모이제이션
  const metricCards = useMemo(() => buildMetricCards(result?.metrics ?? null), [result]);

  const selectedCoinData = coins.find(c => c.id === selectedCoin);
  const selectedExchangeData = exchanges.find(e => e.id === selectedExchange);

  // Map local state to ExecutionMode for shared helpers
  const executionMode: ExecutionMode = strategiesLoading ? 'checking' : backendAvailable ? 'backend' : 'unavailable';

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

          {/* 실행 버튼 + 모드 표시 */}
          <div className="flex items-center gap-2">
            <button
              onClick={runBacktest}
              disabled={loading || !selectedStrategyId || !backendAvailable}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded transition-colors"
            >
              {loading ? '실행중...' : '실행'}
            </button>
            {/* 실행 모드 표시 */}
            <span
              className={`px-2 py-0.5 text-xs rounded ${getModeStyle(executionMode)}`}
              title={backendAvailable ? '서버 연결됨' : '서버 연결 필요'}
            >
              {getModeLabel(executionMode)}
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
                    onChange={(e) => handleParameterChange(param.key, e.target.value === '' ? '' : Number(e.target.value))}
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
      <div className="flex gap-2">
        <MetricsCards cards={metricCards} />
        {/* CSV 다운로드 버튼 */}
        {result && selectedStrategy && (
          <button
            onClick={() => {
              const csv = backestResultToCSV(
                result,
                selectedStrategy.name,
                `${selectedCoinData?.symbol || selectedCoin}/${selectedExchangeData?.currency || selectedExchange}`,
                startDate,
                endDate,
                initialCapital
              );
              const filename = generateFilename(selectedStrategy.name, `${selectedCoinData?.symbol || selectedCoin}-${selectedExchangeData?.currency || selectedExchange}`);
              downloadCSV(csv, filename);
            }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 flex flex-col items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="CSV 다운로드"
          >
            <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">CSV</span>
          </button>
        )}
      </div>

      {/* 차트 영역 */}
      {result ? (
        <div className="space-y-4">
          {/* Equity 차트 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Equity & Price</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {selectedCoinData?.symbol}/{selectedExchangeData?.currency} · {startDate} ~ {endDate}
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

          {/* 현금 보유량 차트 */}
          {result.cash && result.cash.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Cash Position</h2>
                  <div className="flex bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                    <button
                      onClick={() => setCashDisplayMode('amount')}
                      className={`px-2 py-0.5 text-xs font-medium transition-colors ${
                        cashDisplayMode === 'amount'
                          ? 'bg-amber-500 text-white'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      $
                    </button>
                    <button
                      onClick={() => setCashDisplayMode('ratio')}
                      className={`px-2 py-0.5 text-xs font-medium transition-colors ${
                        cashDisplayMode === 'ratio'
                          ? 'bg-amber-500 text-white'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      %
                    </button>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    <span className="text-red-500 font-medium">0%</span> x{cashZeroCount}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Current: ${result.cash[result.cash.length - 1].value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="h-[150px]">
                <CashChart
                  cash={result.cash}
                  equity={result.equity}
                  initialCapital={initialCapital}
                  displayMode={cashDisplayMode}
                />
              </div>
            </div>
          )}

          {/* 연도별 결과 테이블 */}
          <YearlyStatsSection
            equity={result.equity}
            trades={result.trades}
            yearlyIndependent={result.yearlyIndependent}
          />
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
