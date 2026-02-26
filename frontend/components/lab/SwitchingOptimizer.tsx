'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  SwitchingTrigger,
  StrategySlot,
  SwitchingConfig,
  IndicatorInfo,
  ConditionValueRange,
  ConditionValueMapping,
  CooldownRange,
  SwitchingOptimizerResultItem,
  OPERATOR_LABELS,
  SLOT_COLORS,
  SlotId,
} from '@/types/switching';
import { runSwitchingOptimizerAPI, cancelSwitchingOptimizer } from '@/lib/api/client';

interface SwitchingOptimizerProps {
  slots: StrategySlot[];
  rules: SwitchingTrigger[];
  defaultSlotId: string;
  cooldownDays: number;
  positionHandling: 'carry' | 'liquidate';
  indicators: IndicatorInfo[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  applyFee: boolean;
  onApplyResult: (conditionValues: ConditionValueMapping[], cooldownDays: number) => void;
}

export default function SwitchingOptimizer({
  slots,
  rules,
  defaultSlotId,
  cooldownDays,
  positionHandling,
  indicators,
  startDate,
  endDate,
  initialCapital,
  applyFee,
  onApplyResult,
}: SwitchingOptimizerProps) {
  // 범위 상태
  const [conditionRanges, setConditionRanges] = useState<ConditionValueRange[]>([]);
  const [optimizeCooldown, setOptimizeCooldown] = useState(false);
  const [cooldownRange, setCooldownRange] = useState<CooldownRange>({
    minValue: 1,
    maxValue: 10,
    step: 1,
  });
  const [cooldownRangeStr, setCooldownRangeStr] = useState({ minValue: '1', maxValue: '10', step: '1' });

  // 실행 상태
  const [isRunning, setIsRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ completed: number; total: number; percent: number } | null>(null);
  const [results, setResults] = useState<SwitchingOptimizerResultItem[] | null>(null);
  const [doneInfo, setDoneInfo] = useState<{ totalTime: number; resultsCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // UI 상태
  const [isExpanded, setIsExpanded] = useState(true);

  const buildRangesFromRules = useCallback((): ConditionValueRange[] => {
    const ranges: ConditionValueRange[] = [];
    rules.forEach((rule, ruleIdx) => {
      rule.conditions.forEach((cond, condIdx) => {
        const ind = indicators.find((i) => i.id === cond.indicator);
        if (ind?.type === 'string' && ind.values) {
          ranges.push({
            ruleIndex: ruleIdx,
            conditionIndex: condIdx,
            indicator: cond.indicator,
            operator: cond.operator,
            stringValues: [...ind.values],
          });
        } else {
          const currentVal = typeof cond.value === 'number' ? cond.value : 0;
          ranges.push({
            ruleIndex: ruleIdx,
            conditionIndex: condIdx,
            indicator: cond.indicator,
            operator: cond.operator,
            minValue: Math.max(0, currentVal - 20),
            maxValue: currentVal + 20,
            step: 5,
          });
        }
      });
    });
    return ranges;
  }, [rules, indicators]);

  const syncRangesWithRules = useCallback(
    (prev: ConditionValueRange[]): ConditionValueRange[] => {
      const freshRanges = buildRangesFromRules();
      const existingMap = new Map(
        prev.map((r) => [`${r.ruleIndex}-${r.conditionIndex}`, r])
      );
      return freshRanges.map((fresh) => {
        const key = `${fresh.ruleIndex}-${fresh.conditionIndex}`;
        const existing = existingMap.get(key);
        if (existing && existing.indicator === fresh.indicator && existing.operator === fresh.operator) {
          return existing;
        }
        return fresh;
      });
    },
    [buildRangesFromRules]
  );

  // 룰 구조(조건 수/종류) 변경 시 자동 병합, 값만 바뀌면 무시
  const rulesStructureKey = useMemo(
    () => rules.map((r) =>
      r.conditions.map((c) => `${c.indicator}:${c.operator}`).join(',')
    ).join('|'),
    [rules]
  );

  useEffect(() => {
    if (rules.length > 0 && indicators.length > 0) {
      setConditionRanges((prev) =>
        prev.length === 0 ? buildRangesFromRules() : syncRangesWithRules(prev)
      );
    }
  }, [rulesStructureKey, indicators]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSyncFromRules = useCallback(() => {
    setConditionRanges(buildRangesFromRules());
  }, [buildRangesFromRules]);

  // 예상 조합 수 계산
  const estimatedCombinations = useMemo(() => {
    let count = 1;
    for (const range of conditionRanges) {
      if (range.stringValues && range.stringValues.length > 0) {
        count *= range.stringValues.length;
      } else if (
        range.minValue !== undefined &&
        range.maxValue !== undefined &&
        range.step !== undefined &&
        range.step > 0
      ) {
        count *= Math.floor((range.maxValue - range.minValue) / range.step) + 1;
      }
    }
    if (optimizeCooldown && cooldownRange.step > 0) {
      count *= Math.floor((cooldownRange.maxValue - cooldownRange.minValue) / cooldownRange.step) + 1;
    }
    return count;
  }, [conditionRanges, optimizeCooldown, cooldownRange]);

  const updateRange = useCallback(
    (idx: number, updates: Partial<ConditionValueRange>) => {
      setConditionRanges((prev) => prev.map((r, i) => (i === idx ? { ...r, ...updates } : r)));
    },
    [],
  );

  const toggleStringValue = useCallback(
    (rangeIdx: number, value: string) => {
      setConditionRanges((prev) =>
        prev.map((r, i) => {
          if (i !== rangeIdx) return r;
          const current = r.stringValues || [];
          const exists = current.includes(value);
          const updated = exists ? current.filter((v) => v !== value) : [...current, value];
          return { ...r, stringValues: updated.length > 0 ? updated : [value] };
        }),
      );
    },
    [],
  );

  const handleRun = useCallback(async () => {
    if (conditionRanges.length === 0) return;

    setIsRunning(true);
    setError(null);
    setResults(null);
    setDoneInfo(null);
    setProgress(null);

    const config: SwitchingConfig = {
      strategySlots: slots,
      rules,
      defaultSlotId,
      cooldownDays,
      positionHandling,
    };

    try {
      await runSwitchingOptimizerAPI(
        {
          tickerId: 'SOXL',
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          initialCapital,
          applyFee,
          market: 'us',
          switchingConfig: config,
          conditionRanges,
          cooldownRange: optimizeCooldown ? cooldownRange : undefined,
          topN: 50,
        },
        {
          onStart: (start) => setJobId(start.jobId),
          onProgress: (prog) => setProgress(prog),
          onResults: (res) => setResults(res),
          onDone: (done) => setDoneInfo(done),
          onCancelled: () => {
            setError('옵티마이저가 취소되었습니다');
          },
          onError: (err) => setError(err.message),
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setIsRunning(false);
    }
  }, [
    conditionRanges,
    slots,
    rules,
    defaultSlotId,
    cooldownDays,
    positionHandling,
    startDate,
    endDate,
    initialCapital,
    applyFee,
    optimizeCooldown,
    cooldownRange,
  ]);

  const handleCancel = useCallback(async () => {
    if (jobId) {
      try {
        await cancelSwitchingOptimizer(jobId);
      } catch {
        // ignore cancel errors
      }
    }
  }, [jobId]);

  const getIndicatorLabel = useCallback(
    (id: string) => indicators.find((i) => i.id === id)?.label || id,
    [indicators],
  );

  const getTransitionLabel = useCallback((rule: SwitchingTrigger) => {
    const targetSlot = slots.find(s => s.slotId === rule.strategySlotId);
    const targetColors = SLOT_COLORS[(rule.strategySlotId as SlotId)] ?? SLOT_COLORS.A;
    if (slots.length === 2) {
      const fromSlot = slots.find(s => s.slotId !== rule.strategySlotId);
      const fromColors = SLOT_COLORS[((fromSlot?.slotId ?? 'A') as SlotId)] ?? SLOT_COLORS.A;
      return (
        <>
          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${fromColors.badge}`}>
            {fromSlot?.name}
          </span>
          <span className="text-gray-400 dark:text-gray-500 mx-1">&rarr;</span>
          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${targetColors.badge}`}>
            {targetSlot?.name}
          </span>
        </>
      );
    }
    return (
      <>
        <span className="text-gray-400 dark:text-gray-500 mr-1">&rarr;</span>
        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${targetColors.badge}`}>
          {targetSlot?.name ?? rule.strategySlotId}
        </span>
      </>
    );
  }, [slots]);

  const getConditionCount = (range: ConditionValueRange): number => {
    if (range.stringValues?.length) return range.stringValues.length;
    if (range.minValue != null && range.maxValue != null && range.step && range.step > 0)
      return Math.floor((range.maxValue - range.minValue) / range.step) + 1;
    return 0;
  };

  const formatConditionValues = useCallback(
    (values: ConditionValueMapping[]) => {
      return values
        .map((cv) => {
          const rule = rules[cv.ruleIndex];
          if (!rule) return String(cv.value);
          const cond = rule.conditions[cv.conditionIndex];
          if (!cond) return String(cv.value);
          const label = getIndicatorLabel(cond.indicator);
          const op = OPERATOR_LABELS[cond.operator] || cond.operator;
          const prefix = rules.length > 1 ? `R${cv.ruleIndex + 1}:` : '';
          return `${prefix}${label}${op}${cv.value}`;
        })
        .join(', ');
    },
    [rules, getIndicatorLabel],
  );

  const inputClass =
    'w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          스위칭 트리거 옵티마이저
        </h3>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* 탐색 조건 헤더 */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
              탐색 조건
            </label>
            <button
              onClick={handleSyncFromRules}
              disabled={isRunning || rules.length === 0}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 border border-gray-200 dark:border-gray-600 rounded hover:border-indigo-300 dark:hover:border-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              룰에서 초기화
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* 룰별 카드 */}
          <div className="space-y-3">
            {rules.map((rule, ruleIdx) => {
              const ruleRanges = conditionRanges.filter((r) => r.ruleIndex === ruleIdx);
              if (ruleRanges.length === 0) return null;
              const targetColors = SLOT_COLORS[(rule.strategySlotId as SlotId)] ?? SLOT_COLORS.A;
              return (
                <div
                  key={rule.id}
                  className={`rounded-lg border ${targetColors.border} ${targetColors.bg} overflow-hidden`}
                >
                  {/* 카드 헤더 */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-inherit">
                    {getTransitionLabel(rule)}
                  </div>
                  {/* 카드 본문 */}
                  <div className="px-3 py-2 space-y-2">
                    {ruleRanges.map((range) => {
                      const globalIdx = conditionRanges.indexOf(range);
                      const ind = indicators.find((i) => i.id === range.indicator);
                      const isString = ind?.type === 'string';
                      const count = getConditionCount(range);
                      return (
                        <div
                          key={`${range.ruleIndex}-${range.conditionIndex}`}
                          className="flex items-center gap-2 flex-wrap"
                        >
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">
                            {ind?.label || range.indicator}
                          </span>
                          <span className="text-sm text-gray-400 dark:text-gray-500 shrink-0">
                            {OPERATOR_LABELS[range.operator] || range.operator}
                          </span>

                          {isString && ind?.values ? (
                            <>
                              <div className="flex gap-2 flex-wrap">
                                {ind.values.map((val) => (
                                  <label key={val} className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                                    <input
                                      type="checkbox"
                                      checked={range.stringValues?.includes(val) ?? false}
                                      onChange={() => toggleStringValue(globalIdx, val)}
                                      className="rounded"
                                      disabled={isRunning}
                                    />
                                    {val}
                                  </label>
                                ))}
                              </div>
                              <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 shrink-0">
                                ({count}개)
                              </span>
                            </>
                          ) : (
                            <>
                              <input
                                type="number"
                                value={range.minValue ?? ''}
                                onChange={(e) => updateRange(globalIdx, { minValue: e.target.value === '' ? undefined : Number(e.target.value) })}
                                className={inputClass}
                                disabled={isRunning}
                              />
                              <span className="text-xs text-gray-400 dark:text-gray-500">~</span>
                              <input
                                type="number"
                                value={range.maxValue ?? ''}
                                onChange={(e) => updateRange(globalIdx, { maxValue: e.target.value === '' ? undefined : Number(e.target.value) })}
                                className={inputClass}
                                disabled={isRunning}
                              />
                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">step</span>
                              <input
                                type="number"
                                value={range.step ?? ''}
                                onChange={(e) => updateRange(globalIdx, { step: e.target.value === '' ? undefined : Number(e.target.value) })}
                                className={inputClass}
                                disabled={isRunning}
                              />
                              <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 shrink-0">
                                ({count}개)
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {conditionRanges.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                트리거 조건을 추가하면 범위를 설정할 수 있습니다
              </p>
            )}
          </div>

          {/* 쿨다운 최적화 */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={optimizeCooldown}
                onChange={(e) => setOptimizeCooldown(e.target.checked)}
                className="rounded"
                disabled={isRunning}
              />
              쿨다운
            </label>
            {optimizeCooldown && (
              <div className="flex items-center gap-2 pl-6 flex-wrap">
                <input
                  type="number"
                  value={cooldownRangeStr.minValue}
                  onChange={(e) => setCooldownRangeStr((prev) => ({ ...prev, minValue: e.target.value }))}
                  onBlur={() => {
                    const n = parseInt(cooldownRangeStr.minValue);
                    const v = isNaN(n) ? 1 : Math.max(1, n);
                    setCooldownRange((prev) => ({ ...prev, minValue: v }));
                    setCooldownRangeStr((prev) => ({ ...prev, minValue: String(v) }));
                  }}
                  className={inputClass}
                  min={1}
                  disabled={isRunning}
                />
                <span className="text-xs text-gray-400 dark:text-gray-500">~</span>
                <input
                  type="number"
                  value={cooldownRangeStr.maxValue}
                  onChange={(e) => setCooldownRangeStr((prev) => ({ ...prev, maxValue: e.target.value }))}
                  onBlur={() => {
                    const n = parseInt(cooldownRangeStr.maxValue);
                    const v = isNaN(n) ? 1 : Math.max(1, n);
                    setCooldownRange((prev) => ({ ...prev, maxValue: v }));
                    setCooldownRangeStr((prev) => ({ ...prev, maxValue: String(v) }));
                  }}
                  className={inputClass}
                  min={1}
                  disabled={isRunning}
                />
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">step</span>
                <input
                  type="number"
                  value={cooldownRangeStr.step}
                  onChange={(e) => setCooldownRangeStr((prev) => ({ ...prev, step: e.target.value }))}
                  onBlur={() => {
                    const n = parseInt(cooldownRangeStr.step);
                    const v = isNaN(n) ? 1 : Math.max(1, n);
                    setCooldownRange((prev) => ({ ...prev, step: v }));
                    setCooldownRangeStr((prev) => ({ ...prev, step: String(v) }));
                  }}
                  className={inputClass}
                  min={1}
                  disabled={isRunning}
                />
                <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                  ({cooldownRange.step > 0 ? Math.floor((cooldownRange.maxValue - cooldownRange.minValue) / cooldownRange.step) + 1 : 0}개)
                </span>
              </div>
            )}
          </div>

          {/* 실행 버튼 */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              예상 조합: <span className="font-medium text-gray-700 dark:text-gray-200">{estimatedCombinations.toLocaleString()}</span>개
            </span>
            <div className="flex-1" />
            {isRunning && (
              <button
                onClick={handleCancel}
                className="px-4 py-1.5 text-sm font-medium text-red-600 border border-red-300 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                중지
              </button>
            )}
            <button
              onClick={handleRun}
              disabled={isRunning || conditionRanges.length === 0 || estimatedCombinations === 0}
              className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded font-medium text-sm transition-colors"
            >
              {isRunning ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  실행 중...
                </span>
              ) : (
                '옵티마이저 실행'
              )}
            </button>
          </div>

          {/* 진행률 바 */}
          {progress && isRunning && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span>{progress.percent}%</span>
                <span>
                  {progress.completed.toLocaleString()}/{progress.total.toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* 에러 */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
              <p className="text-xs text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* 완료 정보 */}
          {doneInfo && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {doneInfo.resultsCount}개 결과 / {(doneInfo.totalTime / 1000).toFixed(1)}초 소요
            </p>
          )}

          {/* 결과 테이블 */}
          {results && results.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">조건 값</th>
                    {optimizeCooldown && (
                      <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">쿨다운</th>
                    )}
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Return</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">CAGR</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">MDD</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Sharpe</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">스위칭</th>
                    <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400"></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((item) => (
                    <tr
                      key={item.rank}
                      className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      <td className="py-1.5 px-2">
                        <span
                          className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                            item.rank === 1
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'
                              : item.rank === 2
                                ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                : item.rank === 3
                                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200'
                                  : 'text-gray-400 dark:text-gray-500'
                          }`}
                        >
                          {item.rank}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatConditionValues(item.conditionValues)}
                      </td>
                      {optimizeCooldown && (
                        <td className="py-1.5 px-2 text-right text-xs text-gray-600 dark:text-gray-400">
                          {item.cooldownDays}일
                        </td>
                      )}
                      <td
                        className={`py-1.5 px-2 text-right text-xs font-medium ${
                          item.totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {item.totalReturn.toFixed(1)}%
                      </td>
                      <td
                        className={`py-1.5 px-2 text-right text-xs ${
                          item.cagr >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {item.cagr.toFixed(1)}%
                      </td>
                      <td className="py-1.5 px-2 text-right text-xs text-red-600 dark:text-red-400">
                        -{Math.abs(item.mdd).toFixed(1)}%
                      </td>
                      <td className="py-1.5 px-2 text-right text-xs text-gray-700 dark:text-gray-300">
                        {item.sharpeRatio.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-xs text-gray-600 dark:text-gray-400">
                        {item.switchCount}회
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <button
                          onClick={() => onApplyResult(item.conditionValues, item.cooldownDays)}
                          className="px-2 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-600 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                        >
                          적용
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
