'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  DongpaBacktestResponse,
} from '@/types/dongpa';
import { fetchDateRange, runJjappaBacktest, JjappaConfig } from '@/lib/api/client';
import JjappaDualChart from '@/components/lab/dongpa/JjappaDualChart';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface JjappaChartData {
  qqq: {
    candles: { time: number; open: number; high: number; low: number; close: number; rsi: number | null }[];
    latest: { date: string; close: number; closePrev: number; rsi: number | null; rsiPrev: number | null; rsiChange: number | null; currentMode: string };
  };
  soxl: {
    candles: { time: number; open: number; high: number; low: number; close: number }[];
  };
}

function getSignColor(value: number | null): string {
  if (value === null) return 'text-gray-600 dark:text-gray-300';
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-600 dark:text-gray-300';
}

type PeriodPerf = { label: string; startValue: number; endValue: number; returnPct: number; tradeCount: number };

function computePeriodPerformance(
  equity: { time: number; value: number }[],
  trades: { time: number; type: string }[],
  mode: 'yearly' | 'monthly',
): PeriodPerf[] {
  if (equity.length === 0) return [];
  const groups = new Map<string, { values: { time: number; value: number }[]; trades: number }>();
  for (const e of equity) {
    const d = new Date(e.time * 1000);
    const key = mode === 'yearly' ? `${d.getFullYear()}` : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, { values: [], trades: 0 });
    groups.get(key)!.values.push(e);
  }
  for (const t of trades) {
    const d = new Date(t.time * 1000);
    const key = mode === 'yearly' ? `${d.getFullYear()}` : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (groups.has(key)) groups.get(key)!.trades++;
  }
  const result: PeriodPerf[] = [];
  const keys = Array.from(groups.keys()).sort();
  for (let i = 0; i < keys.length; i++) {
    const g = groups.get(keys[i])!;
    const startValue = i === 0 ? g.values[0].value : groups.get(keys[i - 1])!.values.at(-1)!.value;
    const endValue = g.values.at(-1)!.value;
    const returnPct = startValue > 0 ? ((endValue - startValue) / startValue) * 100 : 0;
    result.push({ label: keys[i], startValue, endValue, returnPct, tradeCount: g.trades });
  }
  return result;
}

/** 복리율 ? 툴팁 — 포탈로 렌더링하여 overflow 부모에서 잘리지 않음 */
function HelpTooltip() {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  const handleEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left });
    }
    setShow(true);
  };

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gray-200 dark:bg-gray-600 text-[9px] font-bold text-gray-500 dark:text-gray-300 cursor-help"
      >?</span>
      {show && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[9999] w-[280px] pointer-events-none"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="bg-gray-900 dark:bg-gray-700 text-white text-[10px] rounded-lg shadow-xl p-2.5">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-600">
                  <th className="py-1 pr-3 text-left text-gray-300 whitespace-nowrap">설정</th>
                  <th className="py-1 text-left text-gray-300">의미</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700 dark:divide-gray-600">
                <tr><td className="py-1 pr-3 whitespace-nowrap">이익 1.0 / 손실 1.0</td><td className="py-1">손익 전부 반영 (일반 복리)</td></tr>
                <tr><td className="py-1 pr-3 whitespace-nowrap text-blue-300">이익 0.8 / 손실 0.3</td><td className="py-1 text-blue-300">기본값 (비대칭 복리)</td></tr>
                <tr><td className="py-1 pr-3 whitespace-nowrap">이익 1.0 / 손실 0.0</td><td className="py-1">이익만 반영, 손실 무시</td></tr>
                <tr><td className="py-1 pr-3 whitespace-nowrap">이익 0.0 / 손실 0.0</td><td className="py-1">자본 고정 (단리)</td></tr>
              </tbody>
            </table>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** 숫자 입력 래퍼 — 내부 문자열 관리로 선행 0 / NaN 문제 해결 */
function NumInput({ value, onChange, step, className, integer }: {
  value: number; onChange: (v: number) => void; step?: string; className?: string; integer?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const prev = useRef(value);

  // 외부 value가 바뀌면 (예: 갱신모드 변경 시 기본값 변경) 반영
  useEffect(() => {
    if (value !== prev.current) {
      setText(String(value));
      prev.current = value;
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(raw);
    const parsed = integer ? parseInt(raw, 10) : parseFloat(raw);
    if (!isNaN(parsed)) {
      prev.current = parsed;
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    const parsed = integer ? parseInt(text, 10) : parseFloat(text);
    if (isNaN(parsed) || text.trim() === '') {
      setText(String(value));
    } else {
      setText(String(parsed)); // "010" → "10"
      if (parsed !== value) onChange(parsed);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      step={step}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
    />
  );
}

const STRATEGY_LABELS: Record<string, string> = {
  dongpa: '동파',
  ddeolsapro3: '떨사프로3',
};

const DEFAULT_CONFIG: JjappaConfig = {
  rsiThreshold: 63,
  safeStrategy: 'dongpa',
  safeBuyMaxRise: 3,
  safeDropPercent: 0.10,
  safeTargetProfit: 0.2,
  safeMaxHoldDays: 30,
  safeStopLossDayBuy: 'allow',
  aggrStrategy: 'dongpa',
  aggrBuyMaxRise: 5,
  aggrDropPercent: 0.10,
  aggrTargetProfit: 2.5,
  aggrMaxHoldDays: 7,
  aggrStopLossDayBuy: 'allow',
  renewalMode: 'fixed_period',
  renewalPeriod: 10,
  profitRate: 0.80,
  lossRate: 0.30,
  feeRate: 0.0025,
  applyFee: true,
};

export default function DongpaPage() {
  const [chartData, setChartData] = useState<JjappaChartData | null>(null);

  const [initialCapitalStr, setInitialCapitalStr] = useState('100000');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateRange, setDateRange] = useState<{ min: string; max: string } | null>(null);
  const [config, setConfig] = useState<JjappaConfig>(DEFAULT_CONFIG);

  const [result, setResult] = useState<DongpaBacktestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [chartCollapsed, setChartCollapsed] = useState(false);
  const [resultTab, setResultTab] = useState<'yearly' | 'monthly' | 'segments' | 'events'>('yearly');

  const initialCapital = useMemo(() => {
    const val = parseFloat(initialCapitalStr);
    return isNaN(val) ? 100000 : val;
  }, [initialCapitalStr]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/dongpa/jjappa/chart-data`)
      .then((r) => r.json())
      .then((data: JjappaChartData) => setChartData(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchDateRange('SOXL', 'us')
      .then((range) => {
        setDateRange(range);
        if (!startDate) setStartDate(range.min);
        if (!endDate) setEndDate(range.max);
      })
      .catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateConfig = (key: keyof JjappaConfig, value: number | string | boolean) => {
    if (typeof value === 'number' && isNaN(value)) return;
    setConfig((prev) => {
      const next = { ...prev, [key]: value };
      // 혼합 모드 선택 시 기본 주기를 20으로, 고정주기는 10으로
      if (key === 'renewalMode') {
        if (value === 'hybrid' && prev.renewalMode !== 'hybrid') {
          next.renewalPeriod = 20;
        } else if (value === 'fixed_period' && prev.renewalMode !== 'fixed_period') {
          next.renewalPeriod = 10;
        }
      }
      return next;
    });
  };

  const handleRun = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await runJjappaBacktest({
        startDate,
        endDate,
        initialCapital,
        config,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : '백테스트 실패');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">짭파법 v1 Lab</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              QQQ 주봉 RSI 기반 공세/안전 모드 전환 &middot; SOXL 7균등 분할매매
            </p>
          </div>
          <button
            onClick={() => setChartCollapsed(!chartCollapsed)}
            className="px-3 py-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {chartCollapsed ? 'QQQ 지표 펼치기' : 'QQQ 지표 접기'}
          </button>
        </div>

        {/* 차트 + 지표 카드 */}
        {chartData && (
          <div className="mb-4 space-y-2">
            <JjappaDualChart
              qqqCandles={chartData.qqq.candles}
              soxlCandles={chartData.soxl.candles}
              collapsed={chartCollapsed}
            />

            {/* 지표 카드 */}
            {!chartCollapsed && (() => {
              const lat = chartData.qqq.latest;
              const isAggr = lat.currentMode === '공세';
              const modeBg = isAggr
                ? 'bg-gradient-to-br from-red-500 to-red-600 dark:from-red-600 dark:to-red-700'
                : 'bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700';
              const rsiBelow = lat.rsi !== null && lat.rsi < config.rsiThreshold;
              const rsiUp = lat.rsiChange !== null && lat.rsiChange > 0;
              return (
                <div className="grid grid-cols-4 gap-2">
                  {/* 현재 모드 — 강조 */}
                  <div className={`rounded-lg p-4 ${modeBg} text-white shadow-lg`}>
                    <div className="text-xs font-medium text-white/70 uppercase tracking-wide">현재 모드</div>
                    <div className="text-2xl font-black mt-1">{lat.currentMode}</div>
                    <div className="text-xs text-white/60 mt-1">{lat.date} 기준</div>
                  </div>
                  {/* QQQ RSI */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                    <div className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">QQQ RSI(14)</div>
                    <div className={`text-2xl font-black mt-1 ${rsiBelow ? 'text-red-500 dark:text-red-400' : 'text-blue-500 dark:text-blue-400'}`}>
                      {lat.rsi !== null ? lat.rsi.toFixed(1) : '-'}
                    </div>
                    <div className={`text-xs mt-1 ${rsiBelow ? 'text-red-400' : 'text-blue-400'}`}>
                      기준 {config.rsiThreshold} {rsiBelow ? '하회' : '상회'}
                    </div>
                  </div>
                  {/* RSI 변화 */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                    <div className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">RSI 변화</div>
                    <div className={`text-2xl font-black mt-1 ${rsiUp ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                      {lat.rsiChange !== null ? `${lat.rsiChange > 0 ? '+' : ''}${lat.rsiChange.toFixed(1)}` : '-'}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      전주 {lat.rsiPrev !== null ? lat.rsiPrev.toFixed(1) : '-'} → {lat.rsi !== null ? lat.rsi.toFixed(1) : '-'}
                    </div>
                  </div>
                  {/* QQQ 종가 */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                    <div className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">QQQ 종가</div>
                    <div className="text-2xl font-black mt-1 text-gray-900 dark:text-white">${lat.close}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      전주 ${lat.closePrev} → {lat.date}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Main: Left Panel + Right Content */}
        <div className="flex gap-4">
          {/* Left Config Panel */}
          {panelCollapsed ? (
            <div className="w-10 flex-shrink-0">
              <button
                onClick={() => setPanelCollapsed(false)}
                className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg shadow text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="w-[340px] flex-shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">설정</h3>
                  <button onClick={() => setPanelCollapsed(true)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                </div>

                {/* 기본 설정 */}
                <div className="space-y-2">
                  <label className="block text-xs text-gray-500 dark:text-gray-400">초기 자본 ($)</label>
                  <input type="text" value={initialCapitalStr} onChange={(e) => setInitialCapitalStr(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400">시작일</label>
                      <input type="date" value={startDate} min={dateRange?.min} max={dateRange?.max} onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400">종료일</label>
                      <input type="date" value={endDate} min={dateRange?.min} max={dateRange?.max} onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                  </div>
                </div>

                {/* RSI 기준 */}
                <div className="space-y-2">
                  <label className="block text-xs text-gray-500 dark:text-gray-400">RSI 기준값</label>
                  <NumInput value={config.rsiThreshold} onChange={(v) => updateConfig('rsiThreshold', v)} integer
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>

                {/* 안전모드 */}
                <div className="rounded-lg border p-3 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200">안전 모드</span>
                    <select value={config.safeStrategy} onChange={(e) => updateConfig('safeStrategy', e.target.value)}
                      className="text-xs px-1.5 py-0.5 border border-blue-200 dark:border-blue-700 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                      <option value="dongpa">동파</option>
                      <option value="ddeolsapro3">떨사프로3</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    {config.safeStrategy === 'dongpa' ? (
                      <div>
                        <label className="text-gray-500 dark:text-gray-400">매수상한%</label>
                        <NumInput value={config.safeBuyMaxRise} onChange={(v) => updateConfig('safeBuyMaxRise', v)}
                          className="w-full px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                      </div>
                    ) : (
                      <div>
                        <label className="text-gray-500 dark:text-gray-400">하락률%</label>
                        <NumInput value={config.safeDropPercent} onChange={(v) => updateConfig('safeDropPercent', v)}
                          className="w-full px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                      </div>
                    )}
                    <div>
                      <label className="text-gray-500 dark:text-gray-400">목표수익%</label>
                      <NumInput value={config.safeTargetProfit} onChange={(v) => updateConfig('safeTargetProfit', v)}
                        className="w-full px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <div>
                      <label className="text-gray-500 dark:text-gray-400">손절일</label>
                      <NumInput value={config.safeMaxHoldDays} onChange={(v) => updateConfig('safeMaxHoldDays', v)} integer
                        className="w-full px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                  </div>
                  {config.safeStrategy === 'ddeolsapro3' && (
                    <div className="text-xs">
                      <label className="text-gray-500 dark:text-gray-400">손절일 매수</label>
                      <select value={config.safeStopLossDayBuy} onChange={(e) => updateConfig('safeStopLossDayBuy', e.target.value)}
                        className="ml-2 px-1.5 py-0.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs">
                        <option value="allow">허용</option>
                        <option value="block">차단</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* 공세모드 */}
                <div className="rounded-lg border p-3 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200">공세 모드</span>
                    <select value={config.aggrStrategy} onChange={(e) => updateConfig('aggrStrategy', e.target.value)}
                      className="text-xs px-1.5 py-0.5 border border-red-200 dark:border-red-700 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                      <option value="dongpa">동파</option>
                      <option value="ddeolsapro3">떨사프로3</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    {config.aggrStrategy === 'dongpa' ? (
                      <div>
                        <label className="text-gray-500 dark:text-gray-400">매수상한%</label>
                        <NumInput value={config.aggrBuyMaxRise} onChange={(v) => updateConfig('aggrBuyMaxRise', v)}
                          className="w-full px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                      </div>
                    ) : (
                      <div>
                        <label className="text-gray-500 dark:text-gray-400">하락률%</label>
                        <NumInput value={config.aggrDropPercent} onChange={(v) => updateConfig('aggrDropPercent', v)}
                          className="w-full px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                      </div>
                    )}
                    <div>
                      <label className="text-gray-500 dark:text-gray-400">목표수익%</label>
                      <NumInput value={config.aggrTargetProfit} onChange={(v) => updateConfig('aggrTargetProfit', v)}
                        className="w-full px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <div>
                      <label className="text-gray-500 dark:text-gray-400">손절일</label>
                      <NumInput value={config.aggrMaxHoldDays} onChange={(v) => updateConfig('aggrMaxHoldDays', v)} integer
                        className="w-full px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                  </div>
                  {config.aggrStrategy === 'ddeolsapro3' && (
                    <div className="text-xs">
                      <label className="text-gray-500 dark:text-gray-400">손절일 매수</label>
                      <select value={config.aggrStopLossDayBuy} onChange={(e) => updateConfig('aggrStopLossDayBuy', e.target.value)}
                        className="ml-2 px-1.5 py-0.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs">
                        <option value="allow">허용</option>
                        <option value="block">차단</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* 투자금 갱신 */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">투자금 갱신 (비대칭 복리)</h4>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">갱신 모드</label>
                    <select value={config.renewalMode} onChange={(e) => updateConfig('renewalMode', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                      <option value="no_position">무포지션 갱신</option>
                      <option value="fixed_period">고정 주기 갱신</option>
                      <option value="hybrid">혼합 (무포지션 + 상한)</option>
                    </select>
                  </div>
                  {(config.renewalMode === 'fixed_period' || config.renewalMode === 'hybrid') && (
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400">갱신 주기 (거래일)</label>
                      <NumInput value={config.renewalPeriod} onChange={(v) => updateConfig('renewalPeriod', v)} integer
                        className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">복리율</span>
                      <HelpTooltip />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400">이익</label>
                        <NumInput value={config.profitRate} onChange={(v) => updateConfig('profitRate', v)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400">손실</label>
                        <NumInput value={config.lossRate} onChange={(v) => updateConfig('lossRate', v)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 수수료 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={config.applyFee} onChange={(e) => updateConfig('applyFee', e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-600" />
                    <label className="text-xs text-gray-600 dark:text-gray-400">수수료 적용</label>
                  </div>
                  {config.applyFee && (
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400">수수료율 (%)</label>
                      <NumInput value={parseFloat((config.feeRate * 100).toFixed(2))} onChange={(v) => updateConfig('feeRate', v / 100)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                  )}
                </div>

                {/* 성과 요약 */}
                {result && (
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-1">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">성과 요약</h4>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div className="text-gray-500 dark:text-gray-400">수익률</div>
                      <div className={`font-mono text-right ${result.metrics.totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {result.metrics.totalReturn.toFixed(1)}%
                      </div>
                      <div className="text-gray-500 dark:text-gray-400">CAGR</div>
                      <div className="font-mono text-right text-gray-900 dark:text-white">{result.metrics.cagr.toFixed(1)}%</div>
                      <div className="text-gray-500 dark:text-gray-400">MDD</div>
                      <div className="font-mono text-right text-red-600 dark:text-red-400">{result.metrics.mdd.toFixed(1)}%</div>
                      <div className="text-gray-500 dark:text-gray-400">거래</div>
                      <div className="font-mono text-right text-gray-900 dark:text-white">{result.metrics.totalTrades}회</div>
                      <div className="text-gray-500 dark:text-gray-400">전환 횟수</div>
                      <div className="font-mono text-right text-gray-900 dark:text-white">{result.modeEvents.length}회</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right: Content */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* 전환 규칙 설명 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">모드 전환 규칙 (매주 월요일 평가)</h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border p-2 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-red-700 dark:text-red-300">→ 공세모드</span>
                    <span className="px-1.5 py-0.5 rounded bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 text-[10px]">{STRATEGY_LABELS[config.aggrStrategy]}</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">RSI &lt; {config.rsiThreshold} AND 전주 대비 상승</p>
                </div>
                <div className="rounded-lg border p-2 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-blue-700 dark:text-blue-300">→ 안전모드</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 text-[10px]">{STRATEGY_LABELS[config.safeStrategy]}</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">RSI &gt; {config.rsiThreshold} AND 전주 대비 하락</p>
                </div>
              </div>
            </div>

            {/* 실행 */}
            <button onClick={handleRun} disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              {loading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {loading ? '실행 중...' : '백테스트 실행'}
            </button>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {/* 결과 */}
            {result && (
              <div className="space-y-4">
                {/* 메트릭 카드 */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[
                    { label: '수익률', value: `${result.metrics.totalReturn.toFixed(1)}%`, color: result.metrics.totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
                    { label: 'CAGR', value: `${result.metrics.cagr.toFixed(1)}%`, color: 'text-gray-900 dark:text-white' },
                    { label: 'MDD', value: `${result.metrics.mdd.toFixed(1)}%`, color: 'text-red-600 dark:text-red-400' },
                    { label: '승률', value: `${result.metrics.winRate.toFixed(1)}%`, color: 'text-gray-900 dark:text-white' },
                    { label: '거래', value: `${result.metrics.totalTrades}회`, color: 'text-gray-900 dark:text-white' },
                    { label: '전환', value: `${result.modeEvents.length}회`, color: 'text-gray-900 dark:text-white' },
                  ].map((m) => (
                    <div key={m.label} className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 text-center">
                      <div className="text-xs text-gray-500 dark:text-gray-400">{m.label}</div>
                      <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* 결과 탭 */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                  {/* 탭 바 */}
                  <div className="flex border-b border-gray-200 dark:border-gray-700">
                    {([
                      { id: 'yearly' as const, label: '연도별 성과' },
                      { id: 'monthly' as const, label: '월별 성과' },
                      { id: 'segments' as const, label: '구간별 성과' },
                      { id: 'events' as const, label: '모드 전환' },
                    ]).map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setResultTab(tab.id)}
                        className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                          resultTab === tab.id
                            ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* 연도별 성과 */}
                  {resultTab === 'yearly' && (() => {
                    const yearly = computePeriodPerformance(result.equity, result.trades, 'yearly');
                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 dark:bg-gray-900/50">
                            <tr>
                              <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400">연도</th>
                              <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">시작 자산</th>
                              <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">종료 자산</th>
                              <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">수익률</th>
                              <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">거래</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {yearly.map((row) => (
                              <tr key={row.label} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{row.label}</td>
                                <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400">${row.startValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-white">${row.endValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                <td className={`px-3 py-2 text-right font-mono font-bold ${row.returnPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {row.returnPct >= 0 ? '+' : ''}{row.returnPct.toFixed(1)}%
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{row.tradeCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}

                  {/* 월별 성과 */}
                  {resultTab === 'monthly' && (() => {
                    const monthly = computePeriodPerformance(result.equity, result.trades, 'monthly');
                    return (
                      <div className="overflow-x-auto max-h-[500px]">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400">월</th>
                              <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">시작 자산</th>
                              <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">종료 자산</th>
                              <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">수익률</th>
                              <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">거래</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {monthly.map((row) => (
                              <tr key={row.label} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{row.label}</td>
                                <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400">${row.startValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-white">${row.endValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                <td className={`px-3 py-2 text-right font-mono font-bold ${row.returnPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {row.returnPct >= 0 ? '+' : ''}{row.returnPct.toFixed(1)}%
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{row.tradeCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}

                  {/* 구간별 성과 */}
                  {resultTab === 'segments' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400">#</th>
                            <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400">모드</th>
                            <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400">기간</th>
                            <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">수익률</th>
                            <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">거래</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {result.segments.map((seg, idx) => {
                            const badge = seg.modeId === 'safe'
                              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200'
                              : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200';
                            return (
                              <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${badge}`}>{seg.modeName}</span>
                                </td>
                                <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                                  {new Date(seg.startTime * 1000).toLocaleDateString()} ~ {new Date(seg.endTime * 1000).toLocaleDateString()}
                                </td>
                                <td className={`px-3 py-2 text-right font-mono ${seg.segmentReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {seg.segmentReturn.toFixed(1)}%
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{seg.tradeCount}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 모드 전환 이벤트 */}
                  {resultTab === 'events' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400">날짜</th>
                            <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400">전환</th>
                            <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">QQQ RSI</th>
                            <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">전주 RSI</th>
                            <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">포트폴리오</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {result.modeEvents.map((evt: any, idx: number) => {
                            const fromBadge = evt.fromMode === 'safe'
                              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200'
                              : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200';
                            const toBadge = evt.toMode === 'safe'
                              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200'
                              : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200';
                            return (
                              <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                                  {new Date((evt.time as number) * 1000).toLocaleDateString()}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${fromBadge}`}>
                                    {evt.fromMode === 'safe' ? '안전' : '공세'}
                                  </span>
                                  <span className="mx-1 text-gray-400">&rarr;</span>
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${toBadge}`}>
                                    {evt.toMode === 'safe' ? '안전' : '공세'}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-white">{(evt.qqqRsi as number).toFixed(1)}</td>
                                <td className="px-3 py-2 text-right font-mono text-gray-400">{(evt.qqqPrevRsi as number).toFixed(1)}</td>
                                <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-white">${(evt.portfolioValue as number).toLocaleString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="text-xs text-gray-400 text-right">
                  실행 시간: {result.executionTime.toFixed(0)}ms
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
