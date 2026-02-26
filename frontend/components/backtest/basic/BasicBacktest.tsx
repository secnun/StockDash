'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { BacktestResult, OHLCV, ParameterValue } from '@/types/backtest';
import { StrategyInfo } from '@/lib/api/client';
import EquityChart from '@/components/backtest/Charts/EquityChart';
import DrawdownChart from '@/components/backtest/Charts/DrawdownChart';
import CashChart from '@/components/backtest/Charts/CashChart';
import YearlyStatsSection from '@/components/backtest/Charts/YearlyStatsSection';
import { backestResultToCSV, downloadCSV, generateFilename } from '@/lib/backtest/csvExport';
import { useBackendBacktest } from '@/lib/backtest/useBackendBacktest';
import { getModeLabel, getModeStyle } from '@/lib/utils/modeHelpers';
import MetricsCards, { buildMetricCards } from '@/components/backtest/MetricsCards';
import SplitRatioEditor from '@/components/backtest/SplitRatioEditor';

interface Ticker {
  id: string;
  name: string;
  file: string;
}

interface BasicBacktestProps {
  tickers: Ticker[];
  selectedTicker: string;
  initialCapitalStr: string;
  startDate: string;
  endDate: string;
  applyFee: boolean;
  market?: string;
}

export default function BasicBacktest({
  tickers,
  selectedTicker,
  initialCapitalStr,
  startDate,
  endDate,
  applyFee,
  market,
}: BasicBacktestProps) {
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState('');
  const [parameters, setParameters] = useState<Record<string, ParameterValue>>({});
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [chartData, setChartData] = useState<OHLCV[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cashDisplayMode, setCashDisplayMode] = useState<'amount' | 'ratio'>('ratio');

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

  const selectedStrategy = strategies.find(s => s.id === selectedStrategyId);

  // 전략 선택 시 기본 파라미터 설정
  const handleStrategyChange = useCallback((strategyId: string) => {
    setSelectedStrategyId(strategyId);
    setResult(null);
    setError(null);

    const strategy = strategies.find(s => s.id === strategyId);
    if (strategy) {
      const defaultParams: Record<string, ParameterValue> = {};
      strategy.parameters.forEach((param) => {
        defaultParams[param.key] = param.default;
      });
      // 커스텀 전략: 기본 splitPct 초기화
      if (strategyId === 'ddeolsapro_custom') {
        const divisions = (defaultParams.divisions as number) || 6;
        const defaultPct = Math.round((100 / divisions) * 100) / 100;
        for (let i = 1; i <= divisions; i++) {
          defaultParams[`splitPct${i}`] = defaultPct;
        }
      }
      setParameters(defaultParams);
    }
  }, [strategies]);

  // 파라미터 변경
  const handleParameterChange = useCallback((key: string, value: ParameterValue) => {
    setParameters((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  // 백테스트 실행 (백엔드 전용)
  const runBacktest = useCallback(async () => {
    if (!selectedStrategy) {
      setError('전략을 선택해주세요');
      return;
    }

    if (!isBackendAvailable) {
      setError('서버 연결 불가');
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

      // 백엔드 API 호출 (priceData 포함)
      const backtestResult = await runBacktestAPI({
        strategyId: selectedStrategyId,
        tickerId: selectedTicker,
        startDate,
        endDate,
        initialCapital,
        parameters,
        applyFee,
        market,
      });

      setResult(backtestResult);
      // priceData는 백엔드 응답에서 가져옴
      setChartData(backtestResult.priceData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '백테스트 실행 중 오류 발생');
      console.error('Backtest error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStrategy, selectedStrategyId, selectedTicker, startDate, endDate, initialCapitalStr, parameters, applyFee, isBackendAvailable, runBacktestAPI]);

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

  const currencySymbol = market === 'kr' ? '₩' : '$';

  // 성과 지표 카드 데이터 메모이제이션
  const metricCards = useMemo(() => buildMetricCards(result?.metrics ?? null), [result]);

  return (
    <div className="space-y-4">
      {/* 에러 메시지 */}
      {(error || backendError) && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-red-800 dark:text-red-200 text-sm">{error || backendError}</p>
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
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={!isBackendAvailable}
            >
              <option value="">선택</option>
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>{strategy.name}</option>
              ))}
            </select>
          </div>

          {/* 실행 버튼 + 모드 표시 */}
          <div className="flex items-center gap-2">
            <button
              onClick={runBacktest}
              disabled={loading || !selectedStrategyId || !isBackendAvailable}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded transition-colors"
            >
              {loading ? '실행중...' : '실행'}
            </button>
            {/* 실행 모드 표시 */}
            <span
              className={`px-2 py-0.5 text-xs rounded ${getModeStyle(executionMode)}`}
              title={isBackendAvailable ? '서버 연결됨' : '서버 연결 필요'}
            >
              {getModeLabel(executionMode)}
            </span>
          </div>
        </div>

        {/* 전략 파라미터 - 선택 시에만 표시 */}
        {selectedStrategy && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            {/* 분할 비율 에디터 (커스텀 전략 전용) */}
            {selectedStrategyId === 'ddeolsapro_custom' && (
              <SplitRatioEditor
                divisions={(parameters.divisions as number) ?? 6}
                splitPcts={Object.fromEntries(
                  Object.entries(parameters)
                    .filter(([k]) => k.startsWith('splitPct'))
                    .map(([k, v]) => [k, v as number])
                )}
                onDivisionsChange={(newDiv) => {
                  const defaultPct = Math.round((100 / newDiv) * 100) / 100;
                  const newParams: Record<string, ParameterValue> = {};
                  // 기존 non-split 파라미터 유지
                  Object.entries(parameters).forEach(([k, v]) => {
                    if (!k.startsWith('splitPct') && k !== 'divisions') {
                      newParams[k] = v;
                    }
                  });
                  newParams.divisions = newDiv;
                  // 새 분할 수에 맞게 splitPct 재설정
                  for (let i = 1; i <= newDiv; i++) {
                    newParams[`splitPct${i}`] = defaultPct;
                  }
                  setParameters(newParams);
                }}
                onSplitPctChange={(key, value) => handleParameterChange(key, value)}
              />
            )}
            {/* 기존 파라미터 (커스텀 전략일 때 splitPct/divisions 제외) */}
            <div className="flex flex-wrap gap-3 items-end">
              {selectedStrategy.parameters
                .filter((param) =>
                  selectedStrategyId !== 'ddeolsapro_custom' ||
                  (!param.key.startsWith('splitPct') && param.key !== 'divisions')
                )
                .map((param) => (
                <div key={param.key} className="flex-shrink-0">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{param.label}</label>
                  {param.type === 'number' && (
                    <input
                      type="number"
                      value={(parameters[param.key] ?? param.default) as number | string}
                      onChange={(e) => handleParameterChange(param.key, e.target.value === '' ? '' : Number(e.target.value))}
                      min={param.min}
                      max={param.max}
                      step={param.step || 1}
                      className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  )}
                  {param.type === 'select' && param.options && (
                    <select
                      value={String(parameters[param.key] ?? param.default)}
                      onChange={(e) => handleParameterChange(param.key, e.target.value)}
                      className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {param.options.map((opt) => (
                        <option key={String(opt.value)} value={String(opt.value)}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
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
              const ticker = tickers.find(t => t.id === selectedTicker);
              const csv = backestResultToCSV(
                result,
                selectedStrategy.name,
                ticker?.name || selectedTicker,
                startDate,
                endDate,
                Number(initialCapitalStr) || 10000
              );
              const filename = generateFilename(selectedStrategy.name, ticker?.name || selectedTicker);
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
      {result && chartData.length > 0 ? (
        <div className="space-y-4">
          {/* Equity & Price 차트 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-4">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Equity & Price</h2>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-green-500 inline-block"></span> Equity
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-indigo-500 inline-block"></span> Price
                  </span>
                </div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Value: {currencySymbol}{result.equity[0].value.toFixed(0)} → {currencySymbol}{result.equity[result.equity.length - 1].value.toFixed(0)}
              </div>
            </div>
            <div className="h-[350px]">
              <EquityChart equity={result.equity} initialCapital={Number(initialCapitalStr) || 10000} priceData={chartData} currencySymbol={currencySymbol} />
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
                      {currencySymbol}
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
                  Current: {currencySymbol}{result.cash[result.cash.length - 1].value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="h-[150px]">
                <CashChart
                  cash={result.cash}
                  equity={result.equity}
                  initialCapital={Number(initialCapitalStr) || 10000}
                  displayMode={cashDisplayMode}
                  currencySymbol={currencySymbol}
                />
              </div>
            </div>
          )}

          {/* 연도별 결과 테이블 */}
          <YearlyStatsSection
            equity={result.equity}
            trades={result.trades}
            currencySymbol={currencySymbol}
            yearlyIndependent={result.yearlyIndependent}
          />
        </div>
      ) : (
        !loading && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {isBackendAvailable
                ? '전략을 선택하고 실행해주세요'
                : '서버 연결 불가'}
            </p>
          </div>
        )
      )}
    </div>
  );
}
