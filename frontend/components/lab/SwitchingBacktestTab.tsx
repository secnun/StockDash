'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  StrategySlot,
  SwitchingTrigger,
  SwitchingBacktestResponse,
  IndicatorInfo,
  SwitchingConfig,
} from '@/types/switching';
import { runSwitchingBacktest } from '@/lib/api/client';
import MetricsCards, { buildMetricCards } from '@/components/backtest/MetricsCards';
import SwitchingRuleBuilder from './SwitchingRuleBuilder';
import SwitchingEquityChart from './SwitchingEquityChart';
import SegmentTable from './SegmentTable';
import SwitchingEventsTable from './SwitchingEventsTable';
import DrawdownChart from '@/components/backtest/Charts/DrawdownChart';
import CashChart from '@/components/backtest/Charts/CashChart';

interface SwitchingBacktestTabProps {
  slots: StrategySlot[];
  rules: SwitchingTrigger[];
  onRulesChange: (rules: SwitchingTrigger[]) => void;
  defaultSlotId: string;
  onDefaultSlotIdChange: (id: string) => void;
  cooldownDays: number;
  onCooldownDaysChange: (days: number) => void;
  positionHandling: 'carry' | 'liquidate';
  onPositionHandlingChange: (mode: 'carry' | 'liquidate') => void;
  indicators: IndicatorInfo[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  applyFee: boolean;
  result: SwitchingBacktestResponse | null;
  onResultChange: (result: SwitchingBacktestResponse | null) => void;
  loading: boolean;
  onLoadingChange: (loading: boolean) => void;
  // 파라미터 변경 하이라이트
  highlightedParams?: Record<string, boolean>;
  onClearHighlights?: () => void;
}

export default function SwitchingBacktestTab({
  slots,
  rules,
  onRulesChange,
  defaultSlotId,
  onDefaultSlotIdChange,
  cooldownDays,
  onCooldownDaysChange,
  positionHandling,
  onPositionHandlingChange,
  indicators,
  startDate,
  endDate,
  initialCapital,
  applyFee,
  result,
  onResultChange,
  loading,
  onLoadingChange,
  highlightedParams,
  onClearHighlights,
}: SwitchingBacktestTabProps) {
  const [error, setError] = useState<string | null>(null);
  const [cashDisplayMode, setCashDisplayMode] = useState<'amount' | 'ratio'>('ratio');
  const [cooldownDaysStr, setCooldownDaysStr] = useState(String(cooldownDays));
  useEffect(() => { setCooldownDaysStr(String(cooldownDays)); }, [cooldownDays]);

  const metricCards = useMemo(
    () => buildMetricCards(result?.metrics || null),
    [result],
  );

  const handleRun = useCallback(async () => {
    onLoadingChange(true);
    setError(null);
    onResultChange(null);
    onClearHighlights?.();

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
      onResultChange(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      onLoadingChange(false);
    }
  }, [slots, rules, defaultSlotId, cooldownDays, positionHandling, startDate, endDate, initialCapital, applyFee, onResultChange, onLoadingChange, onClearHighlights]);

  return (
    <div className="space-y-4">
      {/* 스위칭 규칙 빌더 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <SwitchingRuleBuilder
          rules={rules}
          slots={slots}
          indicators={indicators}
          defaultSlotId={defaultSlotId}
          onRulesChange={onRulesChange}
        />
      </div>

      {/* 글로벌 설정 + 실행 버튼 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">기본 전략</label>
            <select
              value={defaultSlotId}
              onChange={(e) => onDefaultSlotIdChange(e.target.value)}
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
              onChange={(e) => onPositionHandlingChange(e.target.value as 'carry' | 'liquidate')}
              className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="carry">유지 (carry)</option>
              <option value="liquidate">전량매도 (liquidate)</option>
            </select>
          </div>
          <div>
            <label className={`block text-xs mb-1 ${highlightedParams?.cooldownDays ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
              쿨다운 (일) {highlightedParams?.cooldownDays && <span className="text-indigo-500">*</span>}
            </label>
            <input
              type="number"
              value={cooldownDaysStr}
              min={1}
              max={60}
              onChange={(e) => setCooldownDaysStr(e.target.value)}
              onBlur={() => {
                const n = parseInt(cooldownDaysStr);
                const clamped = isNaN(n) ? 1 : Math.max(1, Math.min(60, n));
                onCooldownDaysChange(clamped);
                setCooldownDaysStr(String(clamped));
              }}
              className={`w-20 px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                highlightedParams?.cooldownDays
                  ? 'border-indigo-400 dark:border-indigo-500 ring-1 ring-indigo-200 dark:ring-indigo-800'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
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

      {/* 백테스트 결과 */}
      {result && (
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

          {/* 자산곡선 */}
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
      )}
    </div>
  );
}
