'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  SwitchingTrigger,
  IndicatorCondition,
  StrategySlot,
  IndicatorInfo,
  SwitchingConfig,
  ConditionValueRange,
  ConditionValueMapping,
  CooldownRange,
  SwitchingOptimizerResultItem,
  OPERATOR_LABELS,
  SLOT_COLORS,
  SlotId,
} from '@/types/switching';
import { runSwitchingOptimizerAPI, cancelSwitchingOptimizer } from '@/lib/api/client';

import type { SlotParameterRange, OptimizerAlgorithm } from '@/types/switching';

const DEFAULT_OPTIMIZER_RULES: SwitchingTrigger[] = [
  {
    id: 'opt_rule_1',
    name: '공격 전환',
    conditions: [{ indicator: 'alignment', operator: 'eq', value: '정배열' }],
    logic: 'and',
    strategySlotId: 'B',
    priority: 1,
  },
  {
    id: 'opt_rule_2',
    name: '보수 전환',
    conditions: [{ indicator: 'alignment', operator: 'eq', value: '역배열' }],
    logic: 'and',
    strategySlotId: 'A',
    priority: 2,
  },
];

interface SwitchingOptimizerTabProps {
  slots: StrategySlot[];
  indicators: IndicatorInfo[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  applyFee: boolean;
  onApplyResult: (rules: SwitchingTrigger[], cooldownDays: number) => void;
}

export default function SwitchingOptimizerTab({
  slots,
  indicators,
  startDate,
  endDate,
  initialCapital,
  applyFee,
  onApplyResult,
}: SwitchingOptimizerTabProps) {
  // 독립적인 스위칭 규칙 (백테스트 탭과 분리)
  const [rules, setRules] = useState<SwitchingTrigger[]>(DEFAULT_OPTIMIZER_RULES);
  const [defaultSlotId, setDefaultSlotId] = useState('A');
  const [cooldownDays, setCooldownDays] = useState(1);
  const [cooldownDaysStr, setCooldownDaysStr] = useState('1');
  const [positionHandling, setPositionHandling] = useState<'carry' | 'liquidate'>('carry');

  // 알고리즘 선택
  const [algorithm, setAlgorithm] = useState<OptimizerAlgorithm>('grid_search');

  // 조건 범위
  const [conditionRanges, setConditionRanges] = useState<ConditionValueRange[]>([]);
  const [optimizeCooldown, setOptimizeCooldown] = useState(false);
  const [cooldownRange, setCooldownRange] = useState<CooldownRange>({
    minValue: 1,
    maxValue: 10,
    step: 1,
  });
  const [cooldownRangeStr, setCooldownRangeStr] = useState({ minValue: '1', maxValue: '10', step: '1' });

  // 전략 파라미터 범위
  const [enableParamOptimization, setEnableParamOptimization] = useState(false);
  const [slotParamRanges, setSlotParamRanges] = useState<SlotParameterRange[]>([]);
  const [slotParamBuf, setSlotParamBuf] = useState<Record<string, string>>({});

  // 실행 상태
  const [isRunning, setIsRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ completed: number; total: number; percent: number; stage?: string } | null>(null);
  const [results, setResults] = useState<SwitchingOptimizerResultItem[] | null>(null);
  const [doneInfo, setDoneInfo] = useState<{ totalTime: number; resultsCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 슬롯 파라미터 범위 초기화
  useEffect(() => {
    if (enableParamOptimization && slotParamRanges.length === 0) {
      setSlotParamRanges(
        slots.map((slot) => ({
          slotId: slot.slotId,
          dropPercent: {
            min: Number(slot.parameters.dropPercent) || 0.005,
            max: 0.05,
            step: 0.005,
          },
          targetProfit: {
            min: Number(slot.parameters.targetProfit) || 0.01,
            max: 3.0,
            step: 0.25,
          },
          stopLossDays: {
            min: Number(slot.parameters.stopLossDays) || 5,
            max: 30,
            step: 5,
          },
        })),
      );
    }
  }, [enableParamOptimization, slots]); // eslint-disable-line react-hooks/exhaustive-deps

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
        prev.map((r) => [`${r.ruleIndex}-${r.conditionIndex}`, r]),
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
    [buildRangesFromRules],
  );

  const rulesStructureKey = useMemo(
    () =>
      rules
        .map((r) => r.conditions.map((c) => `${c.indicator}:${c.operator}`).join(','))
        .join('|'),
    [rules],
  );

  useEffect(() => {
    if (rules.length > 0 && indicators.length > 0) {
      setConditionRanges((prev) =>
        prev.length === 0 ? buildRangesFromRules() : syncRangesWithRules(prev),
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
    if (enableParamOptimization) {
      for (const sp of slotParamRanges) {
        if (sp.dropPercent && sp.dropPercent.step > 0) {
          count *= Math.floor((sp.dropPercent.max - sp.dropPercent.min) / sp.dropPercent.step) + 1;
        }
        if (sp.targetProfit && sp.targetProfit.step > 0) {
          count *= Math.floor((sp.targetProfit.max - sp.targetProfit.min) / sp.targetProfit.step) + 1;
        }
        if (sp.stopLossDays && sp.stopLossDays.step > 0) {
          count *= Math.floor((sp.stopLossDays.max - sp.stopLossDays.min) / sp.stopLossDays.step) + 1;
        }
      }
    }
    return count;
  }, [conditionRanges, optimizeCooldown, cooldownRange, enableParamOptimization, slotParamRanges]);

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

  const updateSlotParamRange = useCallback(
    (slotIdx: number, param: 'dropPercent' | 'targetProfit' | 'stopLossDays', field: 'min' | 'max' | 'step', value: number) => {
      setSlotParamRanges((prev) =>
        prev.map((sp, i) => {
          if (i !== slotIdx) return sp;
          return { ...sp, [param]: { ...sp[param]!, [field]: value } };
        }),
      );
    },
    [],
  );

  const getSlotParamStr = useCallback(
    (slotIdx: number, param: string, field: string, numValue: number) => {
      const key = `${slotIdx}-${param}-${field}`;
      return key in slotParamBuf ? slotParamBuf[key] : String(numValue);
    },
    [slotParamBuf],
  );

  const handleSlotParamChange = useCallback(
    (slotIdx: number, param: string, field: string, raw: string) => {
      setSlotParamBuf((prev) => ({ ...prev, [`${slotIdx}-${param}-${field}`]: raw }));
    },
    [],
  );

  const handleSlotParamBlur = useCallback(
    (slotIdx: number, param: 'dropPercent' | 'targetProfit' | 'stopLossDays', field: 'min' | 'max' | 'step', fallback: number) => {
      const key = `${slotIdx}-${param}-${field}`;
      const raw = slotParamBuf[key];
      const n = raw !== undefined ? Number(raw) : fallback;
      const val = isNaN(n) ? fallback : Math.max(0, n);
      updateSlotParamRange(slotIdx, param, field, val);
      setSlotParamBuf((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [slotParamBuf, updateSlotParamRange],
  );

  // === 규칙 편집 핸들러 (RuleRow 로직 인라인) ===

  const getOperatorsForIndicator = useCallback(
    (indicatorId: string): string[] => {
      const ind = indicators.find((i) => i.id === indicatorId);
      if (!ind) return [];
      if (ind.type === 'string') return ['eq', 'neq'];
      return ['gt', 'gte', 'lt', 'lte'];
    },
    [indicators],
  );

  const updateRule = useCallback(
    (ruleIdx: number, updated: SwitchingTrigger) => {
      setRules((prev) => prev.map((r, i) => (i === ruleIdx ? updated : r)));
    },
    [],
  );

  const updateCondition = useCallback(
    (ruleIdx: number, condIdx: number, updated: IndicatorCondition) => {
      setRules((prev) =>
        prev.map((rule, ri) => {
          if (ri !== ruleIdx) return rule;
          const newConditions = [...rule.conditions];
          newConditions[condIdx] = updated;
          return { ...rule, conditions: newConditions };
        }),
      );
    },
    [],
  );

  const handleIndicatorChange = useCallback(
    (ruleIdx: number, condIdx: number, newIndicatorId: string) => {
      const ind = indicators.find((i) => i.id === newIndicatorId);
      if (!ind) return;
      const ops = ind.type === 'string' ? ['eq', 'neq'] : ['gt', 'gte', 'lt', 'lte'];
      const defaultValue = ind.type === 'string' && ind.values?.length ? ind.values[0] : 0;
      updateCondition(ruleIdx, condIdx, {
        indicator: newIndicatorId,
        operator: ops[0] as IndicatorCondition['operator'],
        value: defaultValue,
      });
    },
    [indicators, updateCondition],
  );

  const addConditionToRule = useCallback(
    (ruleIdx: number) => {
      const defaultIndicator = indicators[0];
      if (!defaultIndicator) return;
      const ops = defaultIndicator.type === 'string' ? ['eq', 'neq'] : ['gt', 'gte', 'lt', 'lte'];
      const defaultValue = defaultIndicator.type === 'string' && defaultIndicator.values?.length
        ? defaultIndicator.values[0]
        : 0;
      const newCondition: IndicatorCondition = {
        indicator: defaultIndicator.id,
        operator: ops[0] as IndicatorCondition['operator'],
        value: defaultValue,
      };
      setRules((prev) =>
        prev.map((rule, i) =>
          i === ruleIdx ? { ...rule, conditions: [...rule.conditions, newCondition] } : rule,
        ),
      );
    },
    [indicators],
  );

  const removeConditionFromRule = useCallback(
    (ruleIdx: number, condIdx: number) => {
      setRules((prev) =>
        prev.map((rule, i) => {
          if (i !== ruleIdx) return rule;
          const newConditions = rule.conditions.filter((_, ci) => ci !== condIdx);
          return { ...rule, conditions: newConditions.length > 0 ? newConditions : rule.conditions };
        }),
      );
    },
    [],
  );

  const toggleRuleLogic = useCallback(
    (ruleIdx: number) => {
      setRules((prev) =>
        prev.map((rule, i) =>
          i === ruleIdx ? { ...rule, logic: rule.logic === 'and' ? 'or' : 'and' } : rule,
        ),
      );
    },
    [],
  );

  // 규칙 추가
  const addRule = useCallback(() => {
    const defaultIndicator = indicators[0];
    if (!defaultIndicator) return;
    const ops = defaultIndicator.type === 'string' ? ['eq', 'neq'] : ['gt', 'gte', 'lt', 'lte'];
    const defaultValue = defaultIndicator.type === 'string' && defaultIndicator.values?.length
      ? defaultIndicator.values[0]
      : 0;
    const newRule: SwitchingTrigger = {
      id: `opt_rule_${Date.now()}`,
      name: `규칙 ${rules.length + 1}`,
      conditions: [{
        indicator: defaultIndicator.id,
        operator: ops[0] as IndicatorCondition['operator'],
        value: defaultValue,
      }],
      logic: 'and',
      strategySlotId: slots[0]?.slotId ?? 'A',
      priority: rules.length + 1,
    };
    setRules((prev) => [...prev, newRule]);
  }, [indicators, rules.length, slots]);

  // 규칙 삭제
  const removeRule = useCallback(
    (ruleIdx: number) => {
      setRules((prev) => {
        if (prev.length <= 1) return prev;
        return prev.filter((_, i) => i !== ruleIdx);
      });
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
          algorithm,
          slotParameterRanges: enableParamOptimization ? slotParamRanges : undefined,
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
    conditionRanges, slots, rules, defaultSlotId, cooldownDays, positionHandling,
    startDate, endDate, initialCapital, applyFee, optimizeCooldown, cooldownRange,
    algorithm, enableParamOptimization, slotParamRanges,
  ]);

  const handleCancel = useCallback(async () => {
    if (jobId) {
      try { await cancelSwitchingOptimizer(jobId); } catch { /* ignore */ }
    }
  }, [jobId]);

  const handleApply = useCallback((item: SwitchingOptimizerResultItem) => {
    const updatedRules = rules.map((rule, ruleIdx) => {
      const ruleValues = item.conditionValues.filter((cv) => cv.ruleIndex === ruleIdx);
      if (ruleValues.length === 0) return rule;
      return {
        ...rule,
        conditions: rule.conditions.map((cond, condIdx) => {
          const match = ruleValues.find((rv) => rv.conditionIndex === condIdx);
          return match ? { ...cond, value: match.value } : cond;
        }),
      };
    });
    onApplyResult(updatedRules, item.cooldownDays);
  }, [rules, onApplyResult]);

  const getIndicatorLabel = useCallback(
    (id: string) => indicators.find((i) => i.id === id)?.label || id,
    [indicators],
  );

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

  const selectClass = 'px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white';
  const inputClass = 'w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white';
  const rangeInputClass = 'w-16 px-1.5 py-0.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300';

  return (
    <div className="space-y-4">
      {/* ===== 섹션 1: 설정 바 (compact single row) ===== */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow px-4 py-2.5">
        <div className="flex items-center gap-4 flex-wrap">
          {/* 좌측: 글로벌 설정 */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">기본전략</span>
              <select
                value={defaultSlotId}
                onChange={(e) => setDefaultSlotId(e.target.value)}
                className="px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                disabled={isRunning}
              >
                {slots.map((s) => (
                  <option key={s.slotId} value={s.slotId}>
                    {s.slotId} {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">포지션</span>
              <select
                value={positionHandling}
                onChange={(e) => setPositionHandling(e.target.value as 'carry' | 'liquidate')}
                className="px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                disabled={isRunning}
              >
                <option value="carry">유지</option>
                <option value="liquidate">전량매도</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">쿨다운</span>
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
                className="w-12 px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center"
                disabled={isRunning}
              />
            </div>
          </div>

          <div className="flex-1" />

          {/* 우측: 알고리즘 pill 버튼 */}
          <div className="flex items-center gap-1">
            {([
              { id: 'grid_search', label: 'Grid' },
              { id: 'monte_carlo', label: 'MC' },
              { id: 'two_stage', label: '2단계' },
            ] as const).map((algo) => (
              <button
                key={algo.id}
                onClick={() => setAlgorithm(algo.id)}
                disabled={isRunning}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  algorithm === algo.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                } disabled:opacity-50`}
              >
                {algo.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== 섹션 2: 스위칭 규칙 + 탐색 범위 (통합) ===== */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
        {/* 규칙 목록 */}
        {rules.map((rule, ruleIdx) => {
          const targetColors = SLOT_COLORS[rule.strategySlotId as SlotId] ?? SLOT_COLORS.A;
          const ruleRanges = conditionRanges.filter((r) => r.ruleIndex === ruleIdx);

          return (
            <div key={rule.id} className={`rounded-lg border ${targetColors.border} overflow-hidden`}>
              {/* 규칙 헤더 */}
              <div className={`flex items-center gap-2 px-3 py-1.5 ${targetColors.bg}`}>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Rule {ruleIdx + 1}</span>
                <input
                  type="text"
                  value={rule.name}
                  onChange={(e) => updateRule(ruleIdx, { ...rule, name: e.target.value })}
                  className="text-xs font-medium bg-transparent border-none outline-none text-gray-700 dark:text-gray-300 flex-1 min-w-0"
                  disabled={isRunning}
                />
                <span className="text-gray-400 dark:text-gray-500 mx-0.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </span>
                <select
                  value={rule.strategySlotId}
                  onChange={(e) => updateRule(ruleIdx, { ...rule, strategySlotId: e.target.value })}
                  className={`text-xs font-bold px-1.5 py-0.5 rounded border-none ${targetColors.badge}`}
                  disabled={isRunning}
                >
                  {slots.map((slot) => (
                    <option key={slot.slotId} value={slot.slotId}>
                      {slot.slotId} {slot.name}
                    </option>
                  ))}
                </select>
                {rules.length > 1 && (
                  <button
                    onClick={() => removeRule(ruleIdx)}
                    className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                    title="규칙 삭제"
                    disabled={isRunning}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* 조건 + 범위 */}
              <div className="px-3 py-2 space-y-2">
                {rule.conditions.map((condition, condIdx) => {
                  const ind = indicators.find((i) => i.id === condition.indicator);
                  const operators = getOperatorsForIndicator(condition.indicator);
                  const isStringType = ind?.type === 'string';
                  const range = ruleRanges.find((r) => r.conditionIndex === condIdx);
                  const globalRangeIdx = range ? conditionRanges.indexOf(range) : -1;
                  const count = range ? getConditionCount(range) : 0;

                  return (
                    <div key={condIdx} className="space-y-1">
                      {/* AND/OR 구분선 */}
                      {condIdx > 0 && (
                        <div className="flex items-center gap-2 py-0.5">
                          <button
                            onClick={() => toggleRuleLogic(ruleIdx)}
                            className="px-2 py-0.5 text-[10px] font-semibold rounded border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            disabled={isRunning}
                          >
                            {rule.logic.toUpperCase()}
                          </button>
                          <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
                        </div>
                      )}

                      {/* 조건 행: 지표, 연산자, 값 */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <select
                          value={condition.indicator}
                          onChange={(e) => handleIndicatorChange(ruleIdx, condIdx, e.target.value)}
                          className={selectClass}
                          disabled={isRunning}
                        >
                          {indicators.map((ind) => (
                            <option key={ind.id} value={ind.id}>{ind.label}</option>
                          ))}
                        </select>
                        <select
                          value={condition.operator}
                          onChange={(e) => updateCondition(ruleIdx, condIdx, { ...condition, operator: e.target.value as IndicatorCondition['operator'] })}
                          className={`${selectClass} w-16 text-center`}
                          disabled={isRunning}
                        >
                          {operators.map((op) => (
                            <option key={op} value={op}>{OPERATOR_LABELS[op] ?? op}</option>
                          ))}
                        </select>
                        {isStringType && ind?.values && (
                          <select
                            value={String(condition.value)}
                            onChange={(e) => updateCondition(ruleIdx, condIdx, { ...condition, value: e.target.value })}
                            className={selectClass}
                            disabled={isRunning}
                          >
                            {ind.values.map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        )}
                        {rule.conditions.length > 1 && (
                          <button
                            onClick={() => removeConditionFromRule(ruleIdx, condIdx)}
                            className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                            title="조건 제거"
                            disabled={isRunning}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* 범위 행 (조건 바로 아래) */}
                      {range && globalRangeIdx >= 0 && (
                        <div className="flex items-center gap-1.5 pl-1 flex-wrap">
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">범위</span>
                          {isStringType && ind?.values ? (
                            <>
                              <div className="flex gap-1.5 flex-wrap">
                                {ind.values.map((val) => (
                                  <label key={val} className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                                    <input
                                      type="checkbox"
                                      checked={range.stringValues?.includes(val) ?? false}
                                      onChange={() => toggleStringValue(globalRangeIdx, val)}
                                      className="rounded w-3 h-3"
                                      disabled={isRunning}
                                    />
                                    {val}
                                  </label>
                                ))}
                              </div>
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">({count}개)</span>
                            </>
                          ) : (
                            <>
                              <input
                                type="number"
                                value={range.minValue ?? ''}
                                onChange={(e) => updateRange(globalRangeIdx, { minValue: e.target.value === '' ? undefined : Number(e.target.value) })}
                                className={rangeInputClass}
                                disabled={isRunning}
                              />
                              <span className="text-[10px] text-gray-400">~</span>
                              <input
                                type="number"
                                value={range.maxValue ?? ''}
                                onChange={(e) => updateRange(globalRangeIdx, { maxValue: e.target.value === '' ? undefined : Number(e.target.value) })}
                                className={rangeInputClass}
                                disabled={isRunning}
                              />
                              <span className="text-[10px] text-gray-400 ml-0.5">step</span>
                              <input
                                type="number"
                                value={range.step ?? ''}
                                onChange={(e) => updateRange(globalRangeIdx, { step: e.target.value === '' ? undefined : Number(e.target.value) })}
                                className={rangeInputClass}
                                disabled={isRunning}
                              />
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">({count}개)</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 조건 추가 */}
                <button
                  onClick={() => addConditionToRule(ruleIdx)}
                  className="px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400 border border-dashed border-blue-300 dark:border-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  disabled={isRunning}
                >
                  + 조건 추가
                </button>
              </div>
            </div>
          );
        })}

        {/* 규칙 추가 버튼 */}
        <button
          onClick={addRule}
          className="w-full py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-indigo-400 hover:text-indigo-600 dark:hover:border-indigo-500 dark:hover:text-indigo-400 transition-colors"
          disabled={isRunning}
        >
          + 규칙 추가
        </button>

        {/* 추가 탐색 옵션 */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">추가 탐색 옵션</span>

          {/* 쿨다운 범위 탐색 */}
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={optimizeCooldown}
                onChange={(e) => setOptimizeCooldown(e.target.checked)}
                className="rounded w-3.5 h-3.5"
                disabled={isRunning}
              />
              쿨다운 범위 탐색
            </label>
            {optimizeCooldown && (
              <div className="flex items-center gap-1.5 pl-6 flex-wrap">
                <input type="number" value={cooldownRangeStr.minValue} onChange={(e) => setCooldownRangeStr((prev) => ({ ...prev, minValue: e.target.value }))} onBlur={() => { const n = parseInt(cooldownRangeStr.minValue); const v = isNaN(n) ? 1 : Math.max(1, n); setCooldownRange((prev) => ({ ...prev, minValue: v })); setCooldownRangeStr((prev) => ({ ...prev, minValue: String(v) })); }} className={rangeInputClass} min={1} disabled={isRunning} />
                <span className="text-[10px] text-gray-400">~</span>
                <input type="number" value={cooldownRangeStr.maxValue} onChange={(e) => setCooldownRangeStr((prev) => ({ ...prev, maxValue: e.target.value }))} onBlur={() => { const n = parseInt(cooldownRangeStr.maxValue); const v = isNaN(n) ? 1 : Math.max(1, n); setCooldownRange((prev) => ({ ...prev, maxValue: v })); setCooldownRangeStr((prev) => ({ ...prev, maxValue: String(v) })); }} className={rangeInputClass} min={1} disabled={isRunning} />
                <span className="text-[10px] text-gray-400 ml-0.5">step</span>
                <input type="number" value={cooldownRangeStr.step} onChange={(e) => setCooldownRangeStr((prev) => ({ ...prev, step: e.target.value }))} onBlur={() => { const n = parseInt(cooldownRangeStr.step); const v = isNaN(n) ? 1 : Math.max(1, n); setCooldownRange((prev) => ({ ...prev, step: v })); setCooldownRangeStr((prev) => ({ ...prev, step: String(v) })); }} className={rangeInputClass} min={1} disabled={isRunning} />
                <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
                  ({cooldownRange.step > 0 ? Math.floor((cooldownRange.maxValue - cooldownRange.minValue) / cooldownRange.step) + 1 : 0}개)
                </span>
              </div>
            )}
          </div>

          {/* 전략 파라미터 최적화 */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={enableParamOptimization}
                onChange={(e) => setEnableParamOptimization(e.target.checked)}
                className="rounded w-3.5 h-3.5"
                disabled={isRunning}
              />
              전략 파라미터 최적화
            </label>
            {enableParamOptimization && slotParamRanges.length > 0 && (
              <div className="pl-6 space-y-2">
                {slotParamRanges.map((sp, slotIdx) => {
                  const slot = slots.find((s) => s.slotId === sp.slotId);
                  const colors = SLOT_COLORS[sp.slotId as SlotId] ?? SLOT_COLORS.A;
                  return (
                    <div key={sp.slotId} className={`rounded border ${colors.border} ${colors.bg} p-2`}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${colors.badge}`}>{sp.slotId}</span>
                        <span className={`text-xs ${colors.text}`}>{slot?.name}</span>
                      </div>
                      <div className="space-y-1">
                        {sp.dropPercent && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 w-10">하락%</span>
                            <input type="number" value={getSlotParamStr(slotIdx, 'dropPercent', 'min', sp.dropPercent.min)} onChange={(e) => handleSlotParamChange(slotIdx, 'dropPercent', 'min', e.target.value)} onBlur={() => handleSlotParamBlur(slotIdx, 'dropPercent', 'min', sp.dropPercent!.min)} className={rangeInputClass} step={0.005} disabled={isRunning} />
                            <span className="text-[10px] text-gray-400">~</span>
                            <input type="number" value={getSlotParamStr(slotIdx, 'dropPercent', 'max', sp.dropPercent.max)} onChange={(e) => handleSlotParamChange(slotIdx, 'dropPercent', 'max', e.target.value)} onBlur={() => handleSlotParamBlur(slotIdx, 'dropPercent', 'max', sp.dropPercent!.max)} className={rangeInputClass} step={0.005} disabled={isRunning} />
                            <span className="text-[10px] text-gray-400 ml-0.5">step</span>
                            <input type="number" value={getSlotParamStr(slotIdx, 'dropPercent', 'step', sp.dropPercent.step)} onChange={(e) => handleSlotParamChange(slotIdx, 'dropPercent', 'step', e.target.value)} onBlur={() => handleSlotParamBlur(slotIdx, 'dropPercent', 'step', sp.dropPercent!.step)} className={rangeInputClass} step={0.005} disabled={isRunning} />
                          </div>
                        )}
                        {sp.targetProfit && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 w-10">목표%</span>
                            <input type="number" value={getSlotParamStr(slotIdx, 'targetProfit', 'min', sp.targetProfit.min)} onChange={(e) => handleSlotParamChange(slotIdx, 'targetProfit', 'min', e.target.value)} onBlur={() => handleSlotParamBlur(slotIdx, 'targetProfit', 'min', sp.targetProfit!.min)} className={rangeInputClass} step={0.25} disabled={isRunning} />
                            <span className="text-[10px] text-gray-400">~</span>
                            <input type="number" value={getSlotParamStr(slotIdx, 'targetProfit', 'max', sp.targetProfit.max)} onChange={(e) => handleSlotParamChange(slotIdx, 'targetProfit', 'max', e.target.value)} onBlur={() => handleSlotParamBlur(slotIdx, 'targetProfit', 'max', sp.targetProfit!.max)} className={rangeInputClass} step={0.25} disabled={isRunning} />
                            <span className="text-[10px] text-gray-400 ml-0.5">step</span>
                            <input type="number" value={getSlotParamStr(slotIdx, 'targetProfit', 'step', sp.targetProfit.step)} onChange={(e) => handleSlotParamChange(slotIdx, 'targetProfit', 'step', e.target.value)} onBlur={() => handleSlotParamBlur(slotIdx, 'targetProfit', 'step', sp.targetProfit!.step)} className={rangeInputClass} step={0.25} disabled={isRunning} />
                          </div>
                        )}
                        {sp.stopLossDays && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 w-10">손절일</span>
                            <input type="number" value={getSlotParamStr(slotIdx, 'stopLossDays', 'min', sp.stopLossDays.min)} onChange={(e) => handleSlotParamChange(slotIdx, 'stopLossDays', 'min', e.target.value)} onBlur={() => handleSlotParamBlur(slotIdx, 'stopLossDays', 'min', sp.stopLossDays!.min)} className={rangeInputClass} step={5} disabled={isRunning} />
                            <span className="text-[10px] text-gray-400">~</span>
                            <input type="number" value={getSlotParamStr(slotIdx, 'stopLossDays', 'max', sp.stopLossDays.max)} onChange={(e) => handleSlotParamChange(slotIdx, 'stopLossDays', 'max', e.target.value)} onBlur={() => handleSlotParamBlur(slotIdx, 'stopLossDays', 'max', sp.stopLossDays!.max)} className={rangeInputClass} step={5} disabled={isRunning} />
                            <span className="text-[10px] text-gray-400 ml-0.5">step</span>
                            <input type="number" value={getSlotParamStr(slotIdx, 'stopLossDays', 'step', sp.stopLossDays.step)} onChange={(e) => handleSlotParamChange(slotIdx, 'stopLossDays', 'step', e.target.value)} onBlur={() => handleSlotParamBlur(slotIdx, 'stopLossDays', 'step', sp.stopLossDays!.step)} className={rangeInputClass} step={5} disabled={isRunning} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 예상 조합 + 범위 초기화 */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            예상 조합: <span className="font-semibold text-gray-700 dark:text-gray-200">{estimatedCombinations.toLocaleString()}</span>개
            {estimatedCombinations > 10000 && algorithm === 'grid_search' && (
              <span className="text-amber-600 dark:text-amber-400 ml-2">MC 또는 2단계 추천</span>
            )}
          </span>
          <button
            onClick={handleSyncFromRules}
            disabled={isRunning || rules.length === 0}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 border border-gray-200 dark:border-gray-600 rounded hover:border-indigo-300 dark:hover:border-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            범위 초기화
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* ===== 섹션 3: 실행 + 결과 ===== */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
        {/* 실행/중지 버튼 */}
        <div className="flex items-center gap-3">
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
          {isRunning && (
            <button
              onClick={handleCancel}
              className="px-4 py-1.5 text-sm font-medium text-red-600 border border-red-300 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              중지
            </button>
          )}
          <div className="flex-1" />
          {doneInfo && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {doneInfo.resultsCount}개 결과 / {(doneInfo.totalTime / 1000).toFixed(1)}초
            </span>
          )}
        </div>

        {/* 진행률 바 */}
        {progress && isRunning && (
          <div>
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>{progress.stage ? `[${progress.stage}] ` : ''}{progress.percent}%</span>
              <span>{progress.completed.toLocaleString()}/{progress.total.toLocaleString()}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
            <p className="text-xs text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* 결과 테이블 */}
        {results && results.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">결과</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">조건 값</th>
                    {optimizeCooldown && <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">쿨다운</th>}
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
                    <tr key={item.rank} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="py-1.5 px-2">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                          item.rank === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'
                            : item.rank === 2 ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                              : item.rank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200'
                                : 'text-gray-400 dark:text-gray-500'
                        }`}>{item.rank}</span>
                      </td>
                      <td className="py-1.5 px-2 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatConditionValues(item.conditionValues)}
                      </td>
                      {optimizeCooldown && (
                        <td className="py-1.5 px-2 text-right text-xs text-gray-600 dark:text-gray-400">{item.cooldownDays}일</td>
                      )}
                      <td className={`py-1.5 px-2 text-right text-xs font-medium ${item.totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {item.totalReturn.toFixed(1)}%
                      </td>
                      <td className={`py-1.5 px-2 text-right text-xs ${item.cagr >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
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
                          onClick={() => handleApply(item)}
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
          </div>
        )}
      </div>
    </div>
  );
}
