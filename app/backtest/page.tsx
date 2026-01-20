'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getAllStrategies, getStrategy } from '@/lib/strategies';
import { loadCSVFromFile } from '@/lib/backtest/dataLoader';
import { BacktestResult, OHLCV, ParameterValue } from '@/types/backtest';
import EquityChart from '@/components/backtest/Charts/EquityChart';
import DrawdownChart from '@/components/backtest/Charts/DrawdownChart';
import { backestResultToCSV, downloadCSV, generateFilename } from '@/lib/backtest/csvExport';

interface Ticker {
  id: string;
  name: string;
  file: string;
}

export default function BacktestPage() {
  const strategies = getAllStrategies();
  const [selectedStrategyId, setSelectedStrategyId] = useState('');
  const [initialCapitalStr, setInitialCapitalStr] = useState('10000');
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [parameters, setParameters] = useState<Record<string, ParameterValue>>({});
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [chartData, setChartData] = useState<OHLCV[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 기간 설정
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateRange, setDateRange] = useState<{ min: string; max: string }>({ min: '', max: '' });

  // 수수료 적용 여부
  const [applyFee, setApplyFee] = useState(true);

  // 티커 목록 로드
  useEffect(() => {
    async function fetchTickers() {
      try {
        const res = await fetch('/api/tickers');
        const data = await res.json();
        setTickers(data.tickers);
        if (data.tickers.length > 0) {
          setSelectedTicker(data.tickers[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch tickers:', err);
      }
    }
    fetchTickers();
  }, []);

  // 티커 변경 시 날짜 범위 업데이트
  useEffect(() => {
    async function loadDateRange() {
      const ticker = tickers.find(t => t.id === selectedTicker);
      if (!ticker) return;

      try {
        const data = await loadCSVFromFile(ticker.file);
        if (data.length > 0) {
          const minDate = new Date(data[0].time * 1000).toISOString().split('T')[0];
          const maxDate = new Date(data[data.length - 1].time * 1000).toISOString().split('T')[0];
          setDateRange({ min: minDate, max: maxDate });
          setStartDate(minDate);
          setEndDate(maxDate);
        }
      } catch (err) {
        console.error('Failed to load date range:', err);
      }
    }
    if (selectedTicker) {
      loadDateRange();
    }
  }, [selectedTicker, tickers]);

  const selectedStrategy = selectedStrategyId
    ? getStrategy(selectedStrategyId)
    : null;

  // 전략 선택 시 기본 파라미터 설정
  const handleStrategyChange = useCallback((strategyId: string) => {
    setSelectedStrategyId(strategyId);
    setResult(null);
    setError(null);

    const strategy = getStrategy(strategyId);
    if (strategy) {
      const defaultParams: Record<string, ParameterValue> = {};
      strategy.parameters.forEach((param) => {
        defaultParams[param.key] = param.default;
      });
      setParameters(defaultParams);
    }
  }, []);

  // 파라미터 변경
  const handleParameterChange = useCallback((key: string, value: ParameterValue) => {
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
        const endTs = new Date(endDate).getTime() / 1000 + 86400; // 종료일 포함
        data = data.filter(d => d.time >= startTs && d.time <= endTs);
      }

      if (data.length === 0) {
        throw new Error('선택한 기간에 데이터가 없습니다');
      }

      // 백테스트 실행
      const initialCapital = Number(initialCapitalStr) || 10000;
      const backtestResult = selectedStrategy.execute(data, {
        ...parameters,
        initialCapital,
        applyFee,
      });

      setResult(backtestResult);
      setChartData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '백테스트 실행 중 오류 발생');
      console.error('Backtest error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStrategy, tickers, selectedTicker, startDate, endDate, initialCapitalStr, parameters, applyFee]);

  // 성과 지표 카드 데이터 메모이제이션
  const metricCards = useMemo(() => [
    { label: '총 수익률', value: result?.metrics.totalReturn.toFixed(2) || '-', unit: '%', color: result && result.metrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600' },
    { label: 'CAGR', value: result?.metrics.cagr.toFixed(2) || '-', unit: '%', color: result && result.metrics.cagr >= 0 ? 'text-green-600' : 'text-red-600' },
    { label: 'MDD', value: result?.metrics.mdd.toFixed(2) || '-', unit: '%', color: 'text-red-600' },
    { label: '거래', value: result?.metrics.totalTrades.toString() || '-', unit: '회', color: 'text-gray-600 dark:text-gray-300' },
  ], [result]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* 헤더 */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">백테스팅</h1>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
          </div>
        )}

        {/* 설정 영역 - 컴팩트하게 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
            {/* 티커 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">티커</label>
              <select
                value={selectedTicker}
                onChange={(e) => setSelectedTicker(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {tickers.map((ticker) => (
                  <option key={ticker.id} value={ticker.id}>{ticker.name}</option>
                ))}
              </select>
            </div>

            {/* 초기 자산 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">초기 자산 ($)</label>
              <input
                type="text"
                inputMode="numeric"
                value={initialCapitalStr}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '');
                  setInitialCapitalStr(value);
                }}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* 시작일 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">시작일</label>
              <input
                type="date"
                value={startDate}
                min={dateRange.min}
                max={dateRange.max}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* 종료일 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">종료일</label>
              <input
                type="date"
                value={endDate}
                min={dateRange.min}
                max={dateRange.max}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* 수수료 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">수수료 (0.1%)</label>
              <select
                value={applyFee ? 'yes' : 'no'}
                onChange={(e) => setApplyFee(e.target.value === 'yes')}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="yes">적용</option>
                <option value="no">미적용</option>
              </select>
            </div>

            {/* 전략 선택 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">전략</label>
              <select
                value={selectedStrategyId}
                onChange={(e) => handleStrategyChange(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">선택</option>
                {strategies.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>{strategy.name}</option>
                ))}
              </select>
            </div>

            {/* 실행 버튼 */}
            <div>
              <button
                onClick={runBacktest}
                disabled={loading || !selectedStrategyId}
                className="w-full px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded transition-colors"
              >
                {loading ? '실행중...' : '실행'}
              </button>
            </div>
          </div>

          {/* 전략 파라미터 - 선택 시에만 표시 */}
          {selectedStrategy && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap gap-3 items-end">
                {selectedStrategy.parameters.map((param) => (
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
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 성과 지표 */}
        <div className="flex gap-2 mb-4">
          <div className="grid grid-cols-4 gap-2 flex-1">
            {metricCards.map((metric) => (
              <div key={metric.label} className="bg-white dark:bg-gray-800 rounded-lg shadow p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">{metric.label}</div>
                <div className={`text-lg font-bold ${metric.color}`}>
                  {metric.value}<span className="text-xs font-normal ml-0.5">{metric.unit}</span>
                </div>
              </div>
            ))}
          </div>
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
                  Value: ${result.equity[0].value.toFixed(0)} → ${result.equity[result.equity.length - 1].value.toFixed(0)}
                </div>
              </div>
              <div className="h-[350px]">
                <EquityChart equity={result.equity} initialCapital={Number(initialCapitalStr) || 10000} priceData={chartData} />
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
          </div>
        ) : (
          !loading && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                전략을 선택하고 백테스트를 실행해주세요
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
