'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import ComparisonChart from '@/components/lab/asymmetric/ComparisonChart';
import MetricsComparison from '@/components/lab/asymmetric/MetricsComparison';
import RenewalEventsTable from '@/components/lab/asymmetric/RenewalEventsTable';
import { fetchDateRange } from '@/lib/api/client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface StrategyParam {
  key: string;
  label: string;
  type: string;
  default: number | string;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[] | null;
}

interface StrategyInfo {
  id: string;
  name: string;
  description: string;
  renewalMode: string;
  parameters: StrategyParam[];
}

interface Metrics {
  totalReturn: number;
  cagr: number;
  mdd: number;
  winRate: number;
  sharpeRatio: number;
  totalTrades: number;
}

interface EquityPoint {
  time: number;
  value: number;
}

interface RenewalEvent {
  time: number;
  dayIndex: number;
  rpDelta: number;
  rate: number;
  prevCapital: number;
  newCapital: number;
  surplus: number;
  injection: number;
}

interface BacktestResult {
  compound: {
    equity: EquityPoint[];
    metrics: Metrics;
    renewalEvents: RenewalEvent[];
    executionTime: number;
  };
  baseline: {
    equity: EquityPoint[];
    metrics: Metrics;
    executionTime: number;
  };
}

export default function AsymmetricCompoundPage() {
  // 전략 목록
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState('');

  // 공통 설정
  const [tickerId, setTickerId] = useState('SOXL');
  const [initialCapitalStr, setInitialCapitalStr] = useState('10000');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [applyFee, setApplyFee] = useState(true);
  const [dateRange, setDateRange] = useState<{ min: string; max: string } | null>(null);

  // 전략 파라미터
  const [strategyParams, setStrategyParams] = useState<Record<string, number | string>>({});

  // 비대칭 복리 설정
  const [profitRate, setProfitRate] = useState(0.80);
  const [lossRate, setLossRate] = useState(0.30);
  const [renewalPeriod, setRenewalPeriod] = useState(10);

  // 결과
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialCapital = useMemo(() => {
    const val = parseFloat(initialCapitalStr);
    return isNaN(val) ? 100000 : val;
  }, [initialCapitalStr]);

  const selectedStrategy = useMemo(
    () => strategies.find((s) => s.id === selectedStrategyId),
    [strategies, selectedStrategyId]
  );

  // 갱신 모드는 전략에 따라 자동 결정
  const renewalMode = selectedStrategy?.renewalMode || 'fixed_period';

  // 전략 목록 로드
  useEffect(() => {
    fetch(`${API_BASE}/api/lab/asymmetric-compound/strategies`)
      .then((r) => r.json())
      .then((data: StrategyInfo[]) => {
        setStrategies(data);
        if (data.length > 0 && !selectedStrategyId) {
          setSelectedStrategyId(data[0].id);
        }
      })
      .catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 전략 변경 시 기본 파라미터 세팅
  useEffect(() => {
    if (!selectedStrategy) return;
    const defaults: Record<string, number | string> = {};
    for (const p of selectedStrategy.parameters) {
      defaults[p.key] = p.default;
    }
    setStrategyParams(defaults);
  }, [selectedStrategy]);

  // 날짜 범위 로드 (ticker 변경 완료 후 debounce)
  useEffect(() => {
    if (!tickerId || tickerId.length < 2) return;
    const timer = setTimeout(() => {
      fetchDateRange(tickerId, 'us')
        .then((range) => {
          setDateRange(range);
          if (!startDate) setStartDate(range.min);
          if (!endDate) setEndDate(range.max);
        })
        .catch(() => setDateRange(null));
    }, 500);
    return () => clearTimeout(timer);
  }, [tickerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRun = useCallback(async () => {
    if (!selectedStrategyId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/lab/asymmetric-compound/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId: selectedStrategyId,
          tickerId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          initialCapital,
          parameters: strategyParams,
          applyFee,
          market: 'us',
          profitRate,
          lossRate,
          renewalMode,
          renewalPeriod,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'Failed');
      }

      const data: BacktestResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [
    selectedStrategyId, tickerId, startDate, endDate,
    initialCapital, strategyParams, applyFee,
    profitRate, lossRate, renewalMode, renewalPeriod,
  ]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">비대칭 복리 계산</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            기존 전략에 비대칭 복리를 적용하여 성과를 비교합니다
          </p>
        </div>

        <div className="flex gap-4">
          {/* 좌측 패널: 설정 */}
          <div className="w-80 flex-shrink-0 space-y-3">
            {/* 전략 선택 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">전략 선택</h3>
              <select
                value={selectedStrategyId}
                onChange={(e) => setSelectedStrategyId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {selectedStrategy && (
                <p className="text-xs text-gray-400 mt-1">{selectedStrategy.description}</p>
              )}
            </div>

            {/* 기본 설정 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">기본 설정</h3>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">종목</label>
                <input
                  type="text"
                  value={tickerId}
                  onChange={(e) => setTickerId(e.target.value.toUpperCase())}
                  className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">초기 자본</label>
                <input
                  type="text"
                  value={initialCapitalStr}
                  onChange={(e) => setInitialCapitalStr(e.target.value)}
                  className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">시작일</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={dateRange?.min}
                    max={dateRange?.max}
                    className="w-full mt-0.5 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">종료일</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={dateRange?.min}
                    max={dateRange?.max}
                    className="w-full mt-0.5 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={applyFee}
                  onChange={(e) => setApplyFee(e.target.checked)}
                  className="rounded"
                />
                수수료 적용
              </label>
            </div>

            {/* 전략 파라미터 */}
            {selectedStrategy && selectedStrategy.parameters.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">전략 파라미터</h3>
                {selectedStrategy.parameters.map((p) => (
                  <div key={p.key}>
                    <label className="text-xs text-gray-500 dark:text-gray-400">{p.label}</label>
                    {p.type === 'select' && p.options ? (
                      <select
                        value={String(strategyParams[p.key] ?? p.default)}
                        onChange={(e) =>
                          setStrategyParams((prev) => ({ ...prev, [p.key]: e.target.value }))
                        }
                        className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        {p.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        value={strategyParams[p.key] ?? p.default}
                        onChange={(e) =>
                          setStrategyParams((prev) => ({
                            ...prev,
                            [p.key]: parseFloat(e.target.value) || 0,
                          }))
                        }
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 비대칭 복리 설정 */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300">비대칭 복리 설정</h3>

              <div>
                <label className="text-xs text-blue-600 dark:text-blue-400">
                  이익 반영률 ({(profitRate * 100).toFixed(0)}%)
                </label>
                <input
                  type="range"
                  value={profitRate}
                  onChange={(e) => setProfitRate(parseFloat(e.target.value))}
                  min={0}
                  max={1}
                  step={0.05}
                  className="w-full mt-1"
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-blue-600 dark:text-blue-400">
                  손실 반영률 ({(lossRate * 100).toFixed(0)}%)
                </label>
                <input
                  type="range"
                  value={lossRate}
                  onChange={(e) => setLossRate(parseFloat(e.target.value))}
                  min={0}
                  max={1}
                  step={0.05}
                  className="w-full mt-1"
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-blue-600 dark:text-blue-400">갱신 모드</label>
                <div className="mt-0.5 px-3 py-1.5 text-sm border border-blue-200 dark:border-blue-700 rounded bg-blue-100 dark:bg-blue-800/30 text-blue-800 dark:text-blue-200 font-medium">
                  {renewalMode === 'no_position' ? '사이클 종료 시 (자동)'
                    : renewalMode === 'every_sell' ? '매도 시마다 (자동)'
                    : '고정 주기 (자동)'}
                </div>
                <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-0.5">
                  {renewalMode === 'no_position'
                    ? '전략의 사이클 종료(무포지션) 시점에 갱신'
                    : renewalMode === 'every_sell'
                    ? '매도 발생 시 즉시 비대칭 비율 적용'
                    : '사이클 없는 전략이므로 고정 주기로 갱신'}
                </p>
              </div>

              {renewalMode === 'fixed_period' && (
                <div>
                  <label className="text-xs text-blue-600 dark:text-blue-400">갱신 주기 (거래일)</label>
                  <input
                    type="number"
                    value={renewalPeriod}
                    onChange={(e) => setRenewalPeriod(parseInt(e.target.value) || 10)}
                    min={1}
                    max={100}
                    className="w-full mt-0.5 px-3 py-1.5 text-sm border border-blue-200 dark:border-blue-700 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
                  />
                </div>
              )}
            </div>

            {/* 실행 버튼 */}
            <button
              onClick={handleRun}
              disabled={loading || !selectedStrategyId}
              className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  실행 중...
                </>
              ) : (
                '비교 백테스트 실행'
              )}
            </button>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          {/* 우측: 결과 */}
          <div className="flex-1 min-w-0 space-y-4">
            {!result && !loading && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                <div className="text-gray-400 dark:text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-lg font-medium mb-1">비대칭 복리 비교 분석</p>
                  <p className="text-sm">좌측에서 전략과 설정을 선택한 후 실행하세요</p>
                  <div className="mt-4 text-xs space-y-1">
                    <p>이익 반영률: 이익 발생 시 투자금에 반영하는 비율</p>
                    <p>손실 반영률: 손실 발생 시 투자금에 반영하는 비율</p>
                    <p>비대칭 = 이익과 손실을 다른 비율로 반영</p>
                  </div>
                </div>
              </div>
            )}

            {result && (
              <>
                {/* 실행 시간 */}
                <div className="text-xs text-gray-400 text-right">
                  비대칭 복리: {result.compound.executionTime.toFixed(0)}ms / 기본: {result.baseline.executionTime.toFixed(0)}ms
                </div>

                {/* 성과 비교 테이블 */}
                <MetricsComparison
                  compound={result.compound.metrics}
                  baseline={result.baseline.metrics}
                />

                {/* 에쿼티 커브 비교 차트 */}
                <ComparisonChart
                  compoundEquity={result.compound.equity}
                  baselineEquity={result.baseline.equity}
                />

                {/* 투자금 갱신 이벤트 */}
                <RenewalEventsTable events={result.compound.renewalEvents} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
