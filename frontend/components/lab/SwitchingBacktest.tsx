'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  StrategySlot,
  SwitchingTrigger,
  SwitchingBacktestResponse,
  IndicatorInfo,
  SwitchingConfig,
  ConditionValueMapping,
  SLOT_COLORS,
  SlotId,
  STRATEGY_OPTIONS,
  STRATEGY_DEFAULTS,
} from '@/types/switching';
import { runSwitchingBacktest, fetchSwitchingIndicators, fetchDateRange } from '@/lib/api/client';
import MetricsCards, { buildMetricCards } from '@/components/backtest/MetricsCards';
import SwitchingRuleBuilder from './SwitchingRuleBuilder';
import SwitchingEquityChart from './SwitchingEquityChart';
import SegmentTable from './SegmentTable';
import SwitchingEventsTable from './SwitchingEventsTable';
import SwitchingOptimizer from './SwitchingOptimizer';
import DrawdownChart from '@/components/backtest/Charts/DrawdownChart';
import CashChart from '@/components/backtest/Charts/CashChart';

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

export default function SwitchingBacktest() {
  // 기본 설정
  const [initialCapitalStr, setInitialCapitalStr] = useState('100000');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [applyFee, setApplyFee] = useState(true);

  // 날짜 범위
  const [dateRange, setDateRange] = useState<{ min: string; max: string } | null>(null);

  // 전략 슬롯 + 규칙
  const [slots, setSlots] = useState<StrategySlot[]>(DEFAULT_SLOTS);
  const [rules, setRules] = useState<SwitchingTrigger[]>(DEFAULT_RULES);
  const [defaultSlotId, setDefaultSlotId] = useState('A');
  const [cooldownDays, setCooldownDays] = useState(1);
  const [cooldownDaysStr, setCooldownDaysStr] = useState('1');
  const [positionHandling, setPositionHandling] = useState<'carry' | 'liquidate'>('carry');

  // 지표 정보
  const [indicators, setIndicators] = useState<IndicatorInfo[]>([]);

  // 결과
  const [result, setResult] = useState<SwitchingBacktestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cashDisplayMode, setCashDisplayMode] = useState<'amount' | 'ratio'>('ratio');

  // 지표 목록 로드
  useEffect(() => {
    fetchSwitchingIndicators()
      .then(setIndicators)
      .catch((e) => console.error('지표 로드 실패:', e));
  }, []);

  // SOXL 날짜 범위 로드
  useEffect(() => {
    fetchDateRange('SOXL', 'us')
      .then((range) => {
        setDateRange(range);
        if (!startDate) setStartDate(range.min);
        if (!endDate) setEndDate(range.max);
      })
      .catch(console.error);
  }, []);

  const initialCapital = useMemo(() => {
    const val = parseFloat(initialCapitalStr);
    return isNaN(val) ? 100000 : val;
  }, [initialCapitalStr]);

  useEffect(() => { setCooldownDaysStr(String(cooldownDays)); }, [cooldownDays]);

  const metricCards = useMemo(
    () => buildMetricCards(result?.metrics || null),
    [result],
  );

  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    const config: SwitchingConfig = {
      strategySlots: slots,
      rules,
      defaultSlotId,
      cooldownDays,
      positionHandling,
    };

    try {
      const response = await runSwitchingBacktest({
        tickerId: 'SOXL',
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        initialCapital,
        applyFee,
        market: 'us',
        switchingConfig: config,
      });
      setResult(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }, [slots, rules, defaultSlotId, cooldownDays, positionHandling, startDate, endDate, initialCapital, applyFee]);

  const handleApplyOptimizerResult = useCallback(
    (conditionValues: ConditionValueMapping[], newCooldownDays: number) => {
      // 모든 룰에 조건 값 분배
      setRules((prev) =>
        prev.map((rule, ruleIdx) => {
          const ruleValues = conditionValues.filter((cv) => cv.ruleIndex === ruleIdx);
          if (ruleValues.length === 0) return rule;
          const updatedConditions = rule.conditions.map((cond, condIdx) => {
            const match = ruleValues.find((rv) => rv.conditionIndex === condIdx);
            return match ? { ...cond, value: match.value } : cond;
          });
          return { ...rule, conditions: updatedConditions };
        }),
      );
      // 쿨다운 업데이트
      setCooldownDays(newCooldownDays);
    },
    [],
  );

  return (
    <div className="space-y-4">
      {/* ── 백테스트 ── */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-6">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-4">백테스트</h2>
      </div>

      {/* 기본 설정 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">기본 설정</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">티커</label>
            <input
              type="text"
              value="SOXL"
              disabled
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">초기자본 ($)</label>
            <input
              type="number"
              value={initialCapitalStr}
              onChange={(e) => setInitialCapitalStr(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">시작일</label>
            <input
              type="date"
              value={startDate}
              min={dateRange?.min}
              max={dateRange?.max}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">종료일</label>
            <input
              type="date"
              value={endDate}
              min={dateRange?.min}
              max={dateRange?.max}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={applyFee}
                onChange={(e) => setApplyFee(e.target.checked)}
                className="rounded"
              />
              수수료 (0.25%)
            </label>
          </div>
        </div>
      </div>

      {/* 전략 프리셋 + 스위칭 규칙 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            전략 프리셋
          </h3>
          <div className="space-y-2">
            {slots.map((slot, idx) => {
              const colors = SLOT_COLORS[slot.slotId as SlotId] ?? SLOT_COLORS.A;
              const updateParam = (key: string, value: number | string) => {
                setSlots((prev) => prev.map((s, i) => i === idx ? { ...s, parameters: { ...s.parameters, [key]: value } } : s));
              };
              const handleStrategyChange = (strategyId: string) => {
                const defaults = STRATEGY_DEFAULTS[strategyId] ?? STRATEGY_DEFAULTS.ddeolsapro1;
                setSlots((prev) => prev.map((s, i) => i === idx ? { ...s, strategyId, parameters: { ...defaults } } : s));
              };
              return (
                <div key={slot.slotId} className={`rounded-lg border p-3 ${colors.bg} ${colors.border}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${colors.badge}`}>
                      {slot.slotId}
                    </span>
                    <span className={`text-sm font-medium ${colors.text}`}>{slot.name}</span>
                    <select
                      value={slot.strategyId}
                      onChange={(e) => handleStrategyChange(e.target.value)}
                      className="px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {STRATEGY_OPTIONS.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.ratios})</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">하락%:</label>
                      <input type="number" value={String(slot.parameters.dropPercent ?? '')} onChange={(e) => updateParam('dropPercent', e.target.value === '' ? '' : Number(e.target.value))} min={0} step={0.01} className="w-full px-1.5 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">목표%:</label>
                      <input type="number" value={String(slot.parameters.targetProfit ?? '')} onChange={(e) => updateParam('targetProfit', e.target.value === '' ? '' : Number(e.target.value))} min={0} step={0.01} className="w-full px-1.5 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">손절일:</label>
                      <input type="number" value={String(slot.parameters.stopLossDays ?? '')} onChange={(e) => updateParam('stopLossDays', e.target.value === '' ? '' : Number(e.target.value))} min={0} step={1} className="w-full px-1.5 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">손절매수:</label>
                      <select value={String(slot.parameters.stopLossDayBuy ?? 'allow')} onChange={(e) => updateParam('stopLossDayBuy', e.target.value)} className="w-full px-1.5 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                        <option value="allow">허용</option>
                        <option value="block">차단</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <SwitchingRuleBuilder
            rules={rules}
            slots={slots}
            indicators={indicators}
            defaultSlotId={defaultSlotId}
            onRulesChange={setRules}
          />
        </div>
      </div>

      {/* 글로벌 설정 + 실행 버튼 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">기본 전략</label>
            <select
              value={defaultSlotId}
              onChange={(e) => setDefaultSlotId(e.target.value)}
              className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {slots.map((s) => (
                <option key={s.slotId} value={s.slotId}>
                  {s.slotId} {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">포지션 처리</label>
            <select
              value={positionHandling}
              onChange={(e) => setPositionHandling(e.target.value as 'carry' | 'liquidate')}
              className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="carry">유지 (carry)</option>
              <option value="liquidate">전량매도 (liquidate)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">쿨다운 (일)</label>
            <input
              type="number"
              value={cooldownDaysStr}
              min={1}
              max={60}
              onChange={(e) => setCooldownDaysStr(e.target.value)}
              onBlur={() => {
                const n = parseInt(cooldownDaysStr);
                const clamped = isNaN(n) ? 1 : Math.max(1, Math.min(60, n));
                setCooldownDays(clamped);
                setCooldownDaysStr(String(clamped));
              }}
              className="w-20 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex-1" />
          <button
            onClick={handleRun}
            disabled={loading || slots.length < 2}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium text-sm transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                실행 중...
              </span>
            ) : (
              '백테스트 실행'
            )}
          </button>
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* ── 백테스트 결과 ── */}
      {result && (
        <>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-4">백테스트 결과</h2>
          </div>
          <div className="space-y-4">
            {/* 메트릭 카드 + 스위칭 횟수 */}
            <div className="flex gap-2 items-stretch">
              <MetricsCards cards={metricCards} />
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 min-w-[80px]">
                <div className="text-xs text-gray-500 dark:text-gray-400">스위칭</div>
                <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  {result.switchingEvents.length}<span className="text-xs font-normal ml-0.5">회</span>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 min-w-[80px]">
                <div className="text-xs text-gray-500 dark:text-gray-400">실행</div>
                <div className="text-lg font-bold text-gray-600 dark:text-gray-300">
                  {result.executionTime.toFixed(0)}<span className="text-xs font-normal ml-0.5">ms</span>
                </div>
              </div>
            </div>

            {/* 자산곡선 (구간 배경색) */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="h-[350px]">
                <SwitchingEquityChart
                  equity={result.equity}
                  initialCapital={initialCapital}
                  priceData={result.priceData}
                  timeline={result.activeStrategyTimeline}
                  events={result.switchingEvents}
                  slots={slots}
                />
              </div>
            </div>

            {/* Drawdown + Cash */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="h-[180px]">
                  <DrawdownChart equity={result.equity} />
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="flex items-center justify-between px-3 pt-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Cash</span>
                  <div className="flex gap-1">
                    {(['amount', 'ratio'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setCashDisplayMode(mode)}
                        className={`px-2 py-0.5 text-xs rounded ${
                          cashDisplayMode === mode
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        {mode === 'amount' ? '$' : '%'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-[150px]">
                  <CashChart
                    cash={result.cash || []}
                    equity={result.equity}
                    initialCapital={initialCapital}
                    displayMode={cashDisplayMode}
                  />
                </div>
              </div>
            </div>

            {/* 구간별 성과 테이블 */}
            {result.segments.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  구간별 성과
                </h3>
                <SegmentTable segments={result.segments} />
              </div>
            )}

            {/* 스위칭 이벤트 로그 */}
            {result.switchingEvents.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  스위칭 이벤트 로그
                </h3>
                <SwitchingEventsTable events={result.switchingEvents} slots={slots} />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── 옵티마이저 ── */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-4">옵티마이저</h2>
      </div>
      <SwitchingOptimizer
        slots={slots}
        rules={rules}
        defaultSlotId={defaultSlotId}
        cooldownDays={cooldownDays}
        positionHandling={positionHandling}
        indicators={indicators}
        startDate={startDate}
        endDate={endDate}
        initialCapital={initialCapital}
        applyFee={applyFee}
        onApplyResult={handleApplyOptimizerResult}
      />

    </div>
  );
}
