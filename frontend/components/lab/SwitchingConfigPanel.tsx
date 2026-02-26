'use client';

import { useMemo } from 'react';
import {
  StrategySlot,
  SwitchingBacktestResponse,
  SLOT_COLORS,
  SlotId,
  STRATEGY_OPTIONS,
  STRATEGY_DEFAULTS,
} from '@/types/switching';

interface SwitchingConfigPanelProps {
  // 기본 설정
  initialCapitalStr: string;
  onInitialCapitalChange: (value: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  dateRange: { min: string; max: string } | null;
  applyFee: boolean;
  onApplyFeeChange: (value: boolean) => void;
  // 전략 슬롯
  slots: StrategySlot[];
  onSlotsChange: (slots: StrategySlot[]) => void;
  // 현재 결과
  result: SwitchingBacktestResponse | null;
  // 접기/펼치기
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function SwitchingConfigPanel({
  initialCapitalStr,
  onInitialCapitalChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  dateRange,
  applyFee,
  onApplyFeeChange,
  slots,
  onSlotsChange,
  result,
  collapsed,
  onToggleCollapse,
}: SwitchingConfigPanelProps) {
  const metrics = result?.metrics || null;

  const summaryItems = useMemo(() => {
    if (!metrics) return null;
    return [
      {
        label: 'Return',
        value: `${metrics.totalReturn >= 0 ? '+' : ''}${metrics.totalReturn.toFixed(1)}%`,
        color: metrics.totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
      },
      {
        label: 'CAGR',
        value: `${metrics.cagr >= 0 ? '+' : ''}${metrics.cagr.toFixed(1)}%`,
        color: metrics.cagr >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
      },
      {
        label: 'MDD',
        value: `-${Math.abs(metrics.mdd).toFixed(1)}%`,
        color: 'text-red-600 dark:text-red-400',
      },
      {
        label: 'Sharpe',
        value: metrics.sharpeRatio.toFixed(2),
        color: 'text-gray-700 dark:text-gray-300',
      },
    ];
  }, [metrics]);

  const updateParam = (idx: number, key: string, value: number | string) => {
    onSlotsChange(
      slots.map((s, i) =>
        i === idx ? { ...s, parameters: { ...s.parameters, [key]: value } } : s,
      ),
    );
  };

  const handleStrategyChange = (idx: number, strategyId: string) => {
    const defaults = STRATEGY_DEFAULTS[strategyId] ?? STRATEGY_DEFAULTS.ddeolsapro1;
    onSlotsChange(
      slots.map((s, i) =>
        i === idx ? { ...s, strategyId, parameters: { ...defaults } } : s,
      ),
    );
  };

  if (collapsed) {
    return (
      <div className="w-10 flex-shrink-0">
        <button
          onClick={onToggleCollapse}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 shadow hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          title="설정 패널 열기"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-[320px] flex-shrink-0">
      <div className="sticky top-4 space-y-3">
        {/* 패널 헤더 */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">설정</h3>
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="설정 패널 접기"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* 기본 설정 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 space-y-2">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">기본 설정</h4>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">티커</label>
              <input
                type="text"
                value="SOXL"
                disabled
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">초기자본 ($)</label>
              <input
                type="number"
                value={initialCapitalStr}
                onChange={(e) => onInitialCapitalChange(e.target.value)}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">시작일</label>
                <input
                  type="date"
                  value={startDate}
                  min={dateRange?.min}
                  max={dateRange?.max}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">종료일</label>
                <input
                  type="date"
                  value={endDate}
                  min={dateRange?.min}
                  max={dateRange?.max}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={applyFee}
                onChange={(e) => onApplyFeeChange(e.target.checked)}
                className="rounded"
              />
              수수료 (0.25%)
            </label>
          </div>
        </div>

        {/* 전략 슬롯 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 space-y-2">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">전략 슬롯</h4>
          <div className="space-y-2">
            {slots.map((slot, idx) => {
              const colors = SLOT_COLORS[slot.slotId as SlotId] ?? SLOT_COLORS.A;
              return (
                <div key={slot.slotId} className={`rounded-lg border p-2 ${colors.bg} ${colors.border}`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${colors.badge}`}>
                      {slot.slotId}
                    </span>
                    <span className={`text-xs font-medium ${colors.text}`}>{slot.name}</span>
                    <select
                      value={slot.strategyId}
                      onChange={(e) => handleStrategyChange(idx, e.target.value)}
                      className="ml-auto px-1 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {STRATEGY_OPTIONS.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">하락%</label>
                      <input
                        type="number"
                        value={String(slot.parameters.dropPercent ?? '')}
                        onChange={(e) => updateParam(idx, 'dropPercent', e.target.value === '' ? '' : Number(e.target.value))}
                        min={0}
                        step={0.01}
                        className="w-full px-1 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">목표%</label>
                      <input
                        type="number"
                        value={String(slot.parameters.targetProfit ?? '')}
                        onChange={(e) => updateParam(idx, 'targetProfit', e.target.value === '' ? '' : Number(e.target.value))}
                        min={0}
                        step={0.01}
                        className="w-full px-1 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">손절일</label>
                      <input
                        type="number"
                        value={String(slot.parameters.stopLossDays ?? '')}
                        onChange={(e) => updateParam(idx, 'stopLossDays', e.target.value === '' ? '' : Number(e.target.value))}
                        min={0}
                        step={1}
                        className="w-full px-1 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">손절매수</label>
                      <select
                        value={String(slot.parameters.stopLossDayBuy ?? 'allow')}
                        onChange={(e) => updateParam(idx, 'stopLossDayBuy', e.target.value)}
                        className="w-full px-1 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
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

        {/* 현재 성과 요약 */}
        {summaryItems && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 space-y-1.5">
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">현재 성과</h4>
            {summaryItems.map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">{item.label}</span>
                <span className={`text-sm font-semibold ${item.color}`}>{item.value}</span>
              </div>
            ))}
            {result && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">스위칭</span>
                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                  {result.switchingEvents.length}회
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
