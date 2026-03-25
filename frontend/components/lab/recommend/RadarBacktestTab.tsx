'use client';

import { useState, useCallback, useEffect } from 'react';
import { runRadarBacktest, fetchDateRange, StrategyParamsOverride } from '@/lib/api/client';
import { RadarBacktestResponse, RadarSwitchingEvent, RadarYearlyStats } from '@/types/recommend';

const STRATEGY_COLORS: Record<string, string> = {
  ddeolsapro1: '#10b981',
  ddeolsapro2: '#3b82f6',
  ddeolsapro3: '#ef4444',
};

const STRATEGY_BG: Record<string, string> = {
  ddeolsapro1: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  ddeolsapro2: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  ddeolsapro3: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

const STRATEGY_NAMES: Record<string, string> = {
  ddeolsapro1: 'Pro1',
  ddeolsapro2: 'Pro2',
  ddeolsapro3: 'Pro3',
};

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatCurrency(val: number): string {
  return '$' + val.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// ── Metrics Row ──

function MetricsRow({ metrics, switchCount }: { metrics: RadarBacktestResponse['metrics']; switchCount: number }) {
  const items = [
    { label: '총 수익률', value: `${metrics.totalReturn >= 0 ? '+' : ''}${metrics.totalReturn.toFixed(1)}%`, color: metrics.totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
    { label: 'CAGR', value: `${metrics.cagr >= 0 ? '+' : ''}${metrics.cagr.toFixed(1)}%`, color: metrics.cagr >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
    { label: 'MDD', value: `${metrics.mdd.toFixed(1)}%`, color: 'text-red-600 dark:text-red-400' },
    { label: '승률', value: `${metrics.winRate.toFixed(1)}%`, color: 'text-gray-900 dark:text-gray-100' },
    { label: 'Sharpe', value: metrics.sharpeRatio.toFixed(2), color: 'text-gray-900 dark:text-gray-100' },
    { label: '총 거래', value: `${metrics.totalTrades}회`, color: 'text-gray-900 dark:text-gray-100' },
    { label: '전략 전환', value: `${switchCount}회`, color: 'text-blue-600 dark:text-blue-400' },
  ];

  return (
    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{item.label}</div>
          <div className={`text-sm font-bold ${item.color}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── SVG Equity Chart ──

function EquityChartSvg({
  equity,
  switchingEvents,
  strategyTimeline,
}: {
  equity: Array<{ time: number; value: number }>;
  switchingEvents: RadarSwitchingEvent[];
  strategyTimeline: Array<{ time: number; strategyId: string }>;
}) {
  if (equity.length < 2) return null;

  const W = 900;
  const H = 300;
  const PAD = { top: 20, right: 60, bottom: 30, left: 10 };

  const values = equity.map((e) => e.value);
  const minV = Math.min(...values) * 0.98;
  const maxV = Math.max(...values) * 1.02;
  const rangeV = maxV - minV || 1;

  const toX = (i: number) => PAD.left + ((W - PAD.left - PAD.right) * i) / (equity.length - 1);
  const toY = (v: number) => PAD.top + ((maxV - v) / rangeV) * (H - PAD.top - PAD.bottom);

  // Build strategy segments for background coloring
  const segments: Array<{ startIdx: number; endIdx: number; strategyId: string }> = [];
  if (strategyTimeline.length > 0) {
    let currentSeg = { startIdx: 0, endIdx: 0, strategyId: strategyTimeline[0].strategyId };
    for (let i = 1; i < strategyTimeline.length; i++) {
      if (strategyTimeline[i].strategyId !== currentSeg.strategyId) {
        currentSeg.endIdx = i - 1;
        segments.push({ ...currentSeg });
        currentSeg = { startIdx: i, endIdx: i, strategyId: strategyTimeline[i].strategyId };
      }
    }
    currentSeg.endIdx = strategyTimeline.length - 1;
    segments.push(currentSeg);
  }

  // Equity path
  const pathD = equity
    .map((e, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(e.value).toFixed(1)}`)
    .join(' ');

  // Switch event x positions (skip initial)
  const switchXs = switchingEvents
    .filter((e) => e.eventType === 'switch')
    .map((e) => {
      const idx = equity.findIndex((eq) => eq.time >= e.time);
      return idx >= 0 ? toX(idx) : null;
    })
    .filter((x): x is number => x !== null);

  // Y axis labels
  const yTicks = 5;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => minV + (rangeV * i) / yTicks);

  // X axis labels
  const xLabelCount = 6;
  const xIndices = Array.from({ length: xLabelCount }, (_, i) =>
    Math.round((i * (equity.length - 1)) / (xLabelCount - 1)),
  );

  return (
    <svg viewBox={`0 0 ${W} ${H + 10}`} className="w-full h-auto">
      {/* Background strategy segments */}
      {segments.map((seg, i) => {
        const x1 = toX(seg.startIdx);
        const x2 = toX(seg.endIdx);
        const color = STRATEGY_COLORS[seg.strategyId] || '#6b7280';
        return (
          <rect
            key={i}
            x={x1}
            y={PAD.top}
            width={Math.max(x2 - x1, 1)}
            height={H - PAD.top - PAD.bottom}
            fill={color}
            opacity={0.07}
          />
        );
      })}

      {/* Grid lines */}
      {yLabels.map((v, i) => {
        const y = toY(v);
        return (
          <g key={i}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#374151" strokeWidth={0.3} opacity={0.3} />
            <text x={W - PAD.right + 4} y={y + 3} fill="#9ca3af" fontSize={9}>
              {formatCurrency(v)}
            </text>
          </g>
        );
      })}

      {/* Switch lines */}
      {switchXs.map((x, i) => (
        <line key={i} x1={x} y1={PAD.top} x2={x} y2={H - PAD.bottom} stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
      ))}

      {/* Equity line */}
      <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth={1.8} />

      {/* X labels */}
      {xIndices.map((idx) => (
        <text key={idx} x={toX(idx)} y={H - PAD.bottom + 16} fill="#9ca3af" fontSize={9} textAnchor="middle">
          {formatDate(equity[idx].time)}
        </text>
      ))}

      {/* Legend */}
      {Object.entries(STRATEGY_COLORS).map(([id, color], i) => (
        <g key={id} transform={`translate(${PAD.left + i * 70}, 12)`}>
          <rect x={0} y={-6} width={12} height={8} fill={color} opacity={0.3} rx={1} />
          <text x={15} y={0} fill="#9ca3af" fontSize={9}>
            {STRATEGY_NAMES[id]}
          </text>
        </g>
      ))}
      <g transform={`translate(${PAD.left + 3 * 70}, 12)`}>
        <line x1={0} y1={-2} x2={10} y2={-2} stroke="#ef4444" strokeDasharray="3 2" strokeWidth={1} />
        <text x={14} y={0} fill="#9ca3af" fontSize={9}>전환</text>
      </g>
    </svg>
  );
}

// ── Switching Events Table ──

function SwitchingEventsTable({ events }: { events: RadarSwitchingEvent[] }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 text-xs">
            <th className="px-4 py-2.5 text-left font-medium">날짜</th>
            <th className="px-4 py-2.5 text-left font-medium">유형</th>
            <th className="px-4 py-2.5 text-left font-medium">이전</th>
            <th className="px-4 py-2.5 text-left font-medium">전환</th>
            <th className="px-4 py-2.5 text-right font-medium">포트폴리오</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {events.map((event, i) => (
            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
              <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{formatDate(event.time)}</td>
              <td className="px-4 py-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${event.eventType === 'initial' ? 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>
                  {event.eventType === 'initial' ? '시작' : '전환'}
                </span>
              </td>
              <td className="px-4 py-2">
                {event.fromStrategyName ? (
                  <span className={`text-xs px-2 py-0.5 rounded ${STRATEGY_BG[event.fromStrategyId!] || ''}`}>
                    {event.fromStrategyName}
                  </span>
                ) : (
                  <span className="text-gray-400 text-xs">-</span>
                )}
              </td>
              <td className="px-4 py-2">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${STRATEGY_BG[event.toStrategyId] || ''}`}>
                  {event.toStrategyName}
                </span>
              </td>
              <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100 tabular-nums">
                {formatCurrency(event.portfolioValue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Strategy Distribution ──

function StrategyDistribution({ events }: { events: RadarSwitchingEvent[] }) {
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.toStrategyId] = (counts[e.toStrategyId] || 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex items-center gap-3">
      {Object.entries(counts).map(([id, count]) => (
        <div key={id} className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: STRATEGY_COLORS[id] || '#6b7280', opacity: 0.6 }} />
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {STRATEGY_NAMES[id] || id}: {count}회 ({total > 0 ? Math.round((count / total) * 100) : 0}%)
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Yearly Independent Table ──

function RadarYearlyTable({ data, mode }: { data: RadarYearlyStats[]; mode: 'seedReset' | 'seedCarry' }) {
  const validRows = data.filter((r) => r.totalReturn !== null);
  const avgReturn = validRows.length > 0 ? validRows.reduce((s, r) => s + r.totalReturn!, 0) / validRows.length : 0;
  const avgMdd = validRows.length > 0 ? validRows.reduce((s, r) => s + r.mdd!, 0) / validRows.length : 0;

  const getReturnColor = (v: number) =>
    v > 0 ? 'text-green-600 dark:text-green-400' : v < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300';

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">연도</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">수익률</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">MDD</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">거래</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {data.map((row) => (
            <tr key={row.label} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{row.label}</td>
              {row.totalReturn === null ? (
                <>
                  <td className="px-3 py-2 text-sm text-right text-gray-400 dark:text-gray-500">-</td>
                  <td className="px-3 py-2 text-sm text-right text-gray-400 dark:text-gray-500">-</td>
                  <td className="px-3 py-2 text-sm text-right text-gray-400 dark:text-gray-500">-</td>
                </>
              ) : (
                <>
                  <td className={`px-3 py-2 text-sm text-right font-medium ${getReturnColor(row.totalReturn)}`}>
                    {row.totalReturn >= 0 ? '+' : ''}{row.totalReturn.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-sm text-right text-red-600 dark:text-red-400">
                    -{(row.mdd ?? 0).toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-sm text-right text-gray-600 dark:text-gray-300">{row.totalTrades}</td>
                </>
              )}
            </tr>
          ))}
          {/* 평균 행 */}
          <tr className="bg-gray-100 dark:bg-gray-700 font-semibold">
            <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">단순평균</td>
            <td className={`px-3 py-2 text-sm text-right font-medium ${getReturnColor(avgReturn)}`}>
              {avgReturn >= 0 ? '+' : ''}{avgReturn.toFixed(2)}%
            </td>
            <td className="px-3 py-2 text-sm text-right text-red-600 dark:text-red-400">
              -{avgMdd.toFixed(2)}%
            </td>
            <td className="px-3 py-2 text-sm text-right text-gray-600 dark:text-gray-300">
              {validRows.reduce((s, r) => s + r.totalTrades, 0)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RadarYearlySection({ yearlyIndependent }: { yearlyIndependent: RadarBacktestResponse['yearlyIndependent'] }) {
  const [mode, setMode] = useState<'seedReset' | 'seedCarry'>('seedReset');

  if (!yearlyIndependent) return null;

  const data = mode === 'seedReset' ? yearlyIndependent.seedReset : yearlyIndependent.seedCarry;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">연도별 성과 (독립)</h2>
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          <button
            onClick={() => setMode('seedReset')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              mode === 'seedReset'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            시드 리셋
          </button>
          <button
            onClick={() => setMode('seedCarry')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              mode === 'seedCarry'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            시드 이월
          </button>
        </div>
      </div>
      <RadarYearlyTable data={data} mode={mode} />
    </div>
  );
}

// ── Main Tab ──

const PRESETS = {
  standard: {
    ddeolsapro1: { dropPercent: 0.01, targetProfit: 0.01, stopLossDays: 10, stopLossDayBuy: 'allow' },
    ddeolsapro2: { dropPercent: 0.01, targetProfit: 1.5, stopLossDays: 10, stopLossDayBuy: 'allow' },
    ddeolsapro3: { dropPercent: 0.1, targetProfit: 2.0, stopLossDays: 12, stopLossDayBuy: 'allow' },
  },
  optimized: {
    ddeolsapro1: { dropPercent: 0.01, targetProfit: 0.01, stopLossDays: 10, stopLossDayBuy: 'allow' },
    ddeolsapro2: { dropPercent: 0.33, targetProfit: 1.43, stopLossDays: 9, stopLossDayBuy: 'allow' },
    ddeolsapro3: { dropPercent: 0.01, targetProfit: 0.01, stopLossDays: 10, stopLossDayBuy: 'allow' },
  },
} as Record<string, Record<string, { dropPercent: number; targetProfit: number; stopLossDays: number; stopLossDayBuy: string }>>;

export default function RadarBacktestTab() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RadarBacktestResponse | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [initialCapital, setInitialCapital] = useState('100000');

  // SOXL 데이터 범위를 가져와서 디폴트 설정
  useEffect(() => {
    if (!startDate && !endDate) {
      fetchDateRange('SOXL', 'us')
        .then((range) => {
          setStartDate(range.min);
          setEndDate(range.max);
        })
        .catch((e) => console.error('SOXL date range fetch failed:', e));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [forwardDays, setForwardDays] = useState(30);
  const [topN, setTopN] = useState(3);
  const [alpha, setAlpha] = useState(-0.05);

  const [paramPreset, setParamPreset] = useState<'standard' | 'optimized'>('standard');
  const [pro1Params, setPro1Params] = useState({ ...PRESETS.standard.ddeolsapro1 });
  const [pro2Params, setPro2Params] = useState({ ...PRESETS.standard.ddeolsapro2 });
  const [pro3Params, setPro3Params] = useState({ ...PRESETS.standard.ddeolsapro3 });

  const applyPreset = (preset: 'standard' | 'optimized') => {
    setParamPreset(preset);
    setPro1Params({ ...PRESETS[preset].ddeolsapro1 });
    setPro2Params({ ...PRESETS[preset].ddeolsapro2 });
    setPro3Params({ ...PRESETS[preset].ddeolsapro3 });
  };

  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const strategyParams: Record<string, StrategyParamsOverride> = {
        ddeolsapro1: pro1Params,
        ddeolsapro2: pro2Params,
        ddeolsapro3: pro3Params,
      };
      const data = await runRadarBacktest({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        initialCapital: Number(initialCapital) || 100000,
        forwardDays,
        topN,
        alpha,
        strategyParams,
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '백테스트에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, initialCapital, forwardDays, topN, alpha, pro1Params, pro2Params, pro3Params]);

  const switchCount = result ? result.switchingEvents.filter((e) => e.eventType === 'switch').length : 0;

  return (
    <div className="space-y-6">
      {/* Settings */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">초기 투자금 ($)</label>
            <input
              type="text"
              value={initialCapital}
              onChange={(e) => setInitialCapital(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-32 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">종목</label>
            <select className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100" disabled>
              <option>SOXL</option>
            </select>
          </div>
          <button
            onClick={handleRun}
            disabled={loading}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed px-8 py-2 text-sm font-medium text-white transition-colors ml-auto"
          >
            {loading ? '실행 중...' : '백테스트 실행'}
          </button>
        </div>

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          고급 설정
        </button>

        {showAdvanced && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-3">
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">패턴 시뮬레이션 기간 (일)</label>
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={forwardDays}
                  onChange={(e) => setForwardDays(Number(e.target.value))}
                  className="w-20 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">유사 패턴 수</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={topN}
                  onChange={(e) => setTopN(Number(e.target.value))}
                  className="w-20 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">MDD 가중치 (alpha)</label>
                <input
                  type="number"
                  step={0.01}
                  min={-1}
                  max={0}
                  value={alpha}
                  onChange={(e) => setAlpha(Number(e.target.value))}
                  className="w-20 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">전략별 백테스트 파라미터</span>
                <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5">
                  <button
                    onClick={() => applyPreset('standard')}
                    className={`px-3 py-1 text-xs rounded-md transition ${paramPreset === 'standard' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  >
                    표준
                  </button>
                  <button
                    onClick={() => applyPreset('optimized')}
                    className={`px-3 py-1 text-xs rounded-md transition ${paramPreset === 'optimized' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  >
                    최적값
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {([
                  { label: 'Pro1', ratio: '5/10/15/20/25/25%', params: pro1Params, setParams: setPro1Params },
                  { label: 'Pro2', ratio: '10/15/20/25/20/10%', params: pro2Params, setParams: setPro2Params },
                  { label: 'Pro3', ratio: '균등 (1/6씩)', params: pro3Params, setParams: setPro3Params },
                ] as const).map(({ label, ratio, params, setParams }) => (
                  <div key={label} className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3">
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-200">떨사 {label}</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">{ratio}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-400 dark:text-gray-500">하락률 (%)</label>
                        <input
                          type="number"
                          step={0.01}
                          min={0.01}
                          max={20}
                          value={params.dropPercent}
                          onChange={(e) => setParams({ ...params, dropPercent: Number(e.target.value) })}
                          className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 dark:text-gray-500">목표수익률 (%)</label>
                        <input
                          type="number"
                          step={0.01}
                          min={0.01}
                          max={50}
                          value={params.targetProfit}
                          onChange={(e) => setParams({ ...params, targetProfit: Number(e.target.value) })}
                          className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 dark:text-gray-500">손절일</label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={params.stopLossDays}
                          onChange={(e) => setParams({ ...params, stopLossDays: Number(e.target.value) })}
                          className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 dark:text-gray-500">손절일 매수</label>
                        <select
                          value={params.stopLossDayBuy}
                          onChange={(e) => setParams({ ...params, stopLossDayBuy: e.target.value })}
                          className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                        >
                          <option value="allow">허용</option>
                          <option value="block">금지</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="ml-3 text-gray-500 dark:text-gray-400">레이더 추천 기반 백테스트 실행 중...</span>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          {/* Execution time */}
          <div className="text-xs text-gray-400 dark:text-gray-500 text-right">
            실행 시간: {(result.executionTime / 1000).toFixed(1)}초
          </div>

          {/* Metrics */}
          <MetricsRow metrics={result.metrics} switchCount={switchCount} />

          {/* Strategy distribution */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">전략 배분</h3>
              <StrategyDistribution events={result.switchingEvents} />
            </div>

            {/* Equity Chart */}
            <EquityChartSvg
              equity={result.equity}
              switchingEvents={result.switchingEvents}
              strategyTimeline={result.strategyTimeline}
            />
          </div>

          {/* Yearly Independent Stats */}
          <RadarYearlySection yearlyIndependent={result.yearlyIndependent} />

          {/* Switching Events */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              전략 전환 이력 ({result.switchingEvents.length}건)
            </h3>
            <SwitchingEventsTable events={result.switchingEvents} />
          </div>
        </>
      )}
    </div>
  );
}
