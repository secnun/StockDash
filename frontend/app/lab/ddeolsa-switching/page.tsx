'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import SwitchingChart from '@/components/lab/SwitchingChart';
import SwitchingConfigPanel from '@/components/lab/SwitchingConfigPanel';
import SwitchingBacktestTab from '@/components/lab/SwitchingBacktestTab';
import SwitchingOptimizerTab from '@/components/lab/SwitchingOptimizerTab';
import {
  StrategySlot,
  SwitchingTrigger,
  SwitchingBacktestResponse,
  IndicatorInfo,
} from '@/types/switching';
import { fetchSwitchingIndicators, fetchDateRange } from '@/lib/api/client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface LinePoint {
  time: number;
  value: number;
}

interface LatestIndicators {
  ma20: number | null;
  ma60: number | null;
  alignment: string;
  deviation: number | null;
  slope: number | null;
  roc: number | null;
  rsi: number | null;
  atr: number | null;
  close: number;
  date: string;
}

interface SoxlResponse {
  candles: CandleData[];
  ma20: LinePoint[];
  ma60: LinePoint[];
  latestIndicators: LatestIndicators;
}

type TabId = 'backtest' | 'optimizer';

function getAlignmentColor(alignment: string): string {
  if (alignment === '정배열') return 'text-green-600 dark:text-green-400';
  if (alignment === '역배열') return 'text-red-600 dark:text-red-400';
  return 'text-gray-600 dark:text-gray-400';
}

function getAlignmentBg(alignment: string): string {
  if (alignment === '정배열') return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
  if (alignment === '역배열') return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
  return 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800';
}

function getSignColor(value: number | null): string {
  if (value === null) return 'text-gray-600 dark:text-gray-300';
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-600 dark:text-gray-300';
}

function getRsiColor(value: number | null): string {
  if (value === null) return 'text-gray-600 dark:text-gray-300';
  if (value > 70) return 'text-red-600 dark:text-red-400';
  if (value < 30) return 'text-green-600 dark:text-green-400';
  return 'text-gray-600 dark:text-gray-300';
}

const DEFAULT_SLOTS: StrategySlot[] = [
  {
    slotId: 'A',
    name: '보수형',
    strategyId: 'ddeolsapro2',
    parameters: { dropPercent: 0.01, targetProfit: 1.5, stopLossDays: 10, stopLossDayBuy: 'allow' },
  },
  {
    slotId: 'B',
    name: '공격형',
    strategyId: 'ddeolsapro1',
    parameters: { dropPercent: 0.01, targetProfit: 0.01, stopLossDays: 10, stopLossDayBuy: 'allow' },
  },
];

const DEFAULT_RULES: SwitchingTrigger[] = [
  {
    id: 'rule_default_1',
    name: '정배열 공격 전환',
    conditions: [{ indicator: 'alignment', operator: 'eq', value: '정배열' }],
    logic: 'and',
    strategySlotId: 'B',
    priority: 1,
  },
  {
    id: 'rule_default_2',
    name: '역배열 보수 전환',
    conditions: [{ indicator: 'alignment', operator: 'eq', value: '역배열' }],
    logic: 'and',
    strategySlotId: 'A',
    priority: 2,
  },
];

export default function DdeolsaSwitchingPage() {
  // SOXL 차트 데이터
  const [data, setData] = useState<SoxlResponse | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const [days, setDays] = useState(365);
  const [chartCollapsed, setChartCollapsed] = useState(false);

  // 공통 설정 (Left Panel)
  const [initialCapitalStr, setInitialCapitalStr] = useState('100000');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [applyFee, setApplyFee] = useState(true);
  const [dateRange, setDateRange] = useState<{ min: string; max: string } | null>(null);
  const [slots, setSlots] = useState<StrategySlot[]>(DEFAULT_SLOTS);

  // 백테스트 설정
  const [rules, setRules] = useState<SwitchingTrigger[]>(DEFAULT_RULES);
  const [defaultSlotId, setDefaultSlotId] = useState('A');
  const [cooldownDays, setCooldownDays] = useState(1);
  const [positionHandling, setPositionHandling] = useState<'carry' | 'liquidate'>('carry');

  // 지표 정보
  const [indicators, setIndicators] = useState<IndicatorInfo[]>([]);

  // 백테스트 결과
  const [result, setResult] = useState<SwitchingBacktestResponse | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);

  // 탭
  const [activeTab, setActiveTab] = useState<TabId>('backtest');

  // Left Panel
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // 파라미터 하이라이트 (적용 후)
  const [highlightedParams, setHighlightedParams] = useState<Record<string, boolean>>({});

  const initialCapital = useMemo(() => {
    const val = parseFloat(initialCapitalStr);
    return isNaN(val) ? 100000 : val;
  }, [initialCapitalStr]);

  // 데이터 로드
  const fetchChartData = useCallback(async (numDays: number) => {
    setChartLoading(true);
    setChartError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/switching/soxl?days=${numDays}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'Failed to fetch data');
      }
      const json: SoxlResponse = await res.json();
      setData(json);
    } catch (e) {
      setChartError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setChartLoading(false);
    }
  }, []);

  useEffect(() => { fetchChartData(days); }, [days, fetchChartData]);

  useEffect(() => {
    fetchSwitchingIndicators()
      .then(setIndicators)
      .catch((e) => console.error('지표 로드 실패:', e));
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

  // 옵티마이저 결과 적용 → 백테스트 탭 규칙 업데이트
  const handleApplyOptimizerResult = useCallback(
    (updatedRules: SwitchingTrigger[], newCooldownDays: number) => {
      const highlights: Record<string, boolean> = {};

      // 변경된 조건 하이라이트
      updatedRules.forEach((rule, ruleIdx) => {
        const existing = rules[ruleIdx];
        if (!existing) return;
        rule.conditions.forEach((cond, condIdx) => {
          const existingCond = existing.conditions[condIdx];
          if (existingCond && String(cond.value) !== String(existingCond.value)) {
            highlights[`rule_${ruleIdx}_cond_${condIdx}`] = true;
          }
        });
      });

      if (newCooldownDays !== cooldownDays) {
        highlights.cooldownDays = true;
      }

      setRules(updatedRules);
      setCooldownDays(newCooldownDays);
      setHighlightedParams(highlights);
      setActiveTab('backtest');
    },
    [rules, cooldownDays],
  );

  const ind = data?.latestIndicators;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'backtest', label: '백테스트' },
    { id: 'optimizer', label: '옵티마이저' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">떨사 스위칭 Lab</h1>
            {ind && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                SOXL ${ind.close} &middot; {ind.date}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setChartCollapsed(!chartCollapsed)}
              className="px-3 py-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {chartCollapsed ? '차트 펼치기' : '차트 접기'}
            </button>
            <div className="flex gap-1">
              {[180, 365, 730, 1500].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1 text-sm rounded ${
                    days === d
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {d >= 365 ? `${Math.round(d / 365)}Y` : `${d}D`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SOXL 차트 + 지표카드 (접기/펼치기) */}
        {!chartCollapsed && (
          <div className="mb-4 space-y-2">
            {/* Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="h-[350px]">
                {chartLoading && (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading...
                  </div>
                )}
                {chartError && (
                  <div className="flex items-center justify-center h-full text-red-500">{chartError}</div>
                )}
                {data && !chartLoading && (
                  <SwitchingChart candles={data.candles} ma20={data.ma20} ma60={data.ma60} />
                )}
              </div>
            </div>

            {/* Indicator Cards */}
            {ind && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <div className={`rounded-lg border p-3 ${getAlignmentBg(ind.alignment)}`}>
                  <div className="text-xs text-gray-500 dark:text-gray-400">MA 배열</div>
                  <div className={`text-lg font-bold ${getAlignmentColor(ind.alignment)}`}>{ind.alignment}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400">20MA 이격도</div>
                  <div className={`text-lg font-bold ${getSignColor(ind.deviation)}`}>
                    {ind.deviation !== null ? `${ind.deviation > 0 ? '+' : ''}${ind.deviation}` : '-'}
                    <span className="text-xs font-normal ml-0.5">%</span>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Slope</div>
                  <div className={`text-lg font-bold ${getSignColor(ind.slope)}`}>{ind.slope !== null ? ind.slope.toFixed(2) : '-'}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400">ROC</div>
                  <div className={`text-lg font-bold ${getSignColor(ind.roc)}`}>{ind.roc !== null ? ind.roc.toFixed(2) : '-'}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400">RSI</div>
                  <div className={`text-lg font-bold ${getRsiColor(ind.rsi)}`}>{ind.rsi !== null ? ind.rsi.toFixed(2) : '-'}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400">ATR</div>
                  <div className="text-lg font-bold text-gray-600 dark:text-gray-300">{ind.atr !== null ? ind.atr.toFixed(2) : '-'}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Content: Left Panel + Tab Area */}
        <div className="flex gap-4">
          {/* Left Panel */}
          <SwitchingConfigPanel
            initialCapitalStr={initialCapitalStr}
            onInitialCapitalChange={setInitialCapitalStr}
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            dateRange={dateRange}
            applyFee={applyFee}
            onApplyFeeChange={setApplyFee}
            slots={slots}
            onSlotsChange={setSlots}
            result={result}
            collapsed={panelCollapsed}
            onToggleCollapse={() => setPanelCollapsed(!panelCollapsed)}
          />

          {/* Right: Tab Area */}
          <div className="flex-1 min-w-0">
            {/* Tab Bar */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className={activeTab === 'backtest' ? '' : 'hidden'}>
              <SwitchingBacktestTab
                slots={slots}
                rules={rules}
                onRulesChange={setRules}
                defaultSlotId={defaultSlotId}
                onDefaultSlotIdChange={setDefaultSlotId}
                cooldownDays={cooldownDays}
                onCooldownDaysChange={setCooldownDays}
                positionHandling={positionHandling}
                onPositionHandlingChange={setPositionHandling}
                indicators={indicators}
                startDate={startDate}
                endDate={endDate}
                initialCapital={initialCapital}
                applyFee={applyFee}
                result={result}
                onResultChange={setResult}
                loading={backtestLoading}
                onLoadingChange={setBacktestLoading}
                highlightedParams={highlightedParams}
                onClearHighlights={() => setHighlightedParams({})}
              />
            </div>

            <div className={activeTab === 'optimizer' ? '' : 'hidden'}>
              <SwitchingOptimizerTab
                slots={slots}
                indicators={indicators}
                startDate={startDate}
                endDate={endDate}
                initialCapital={initialCapital}
                applyFee={applyFee}
                onApplyResult={handleApplyOptimizerResult}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
