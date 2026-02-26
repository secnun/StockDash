'use client';

import { useCallback } from 'react';
import {
  SwitchingTrigger,
  IndicatorCondition,
  StrategySlot,
  IndicatorInfo,
  OPERATOR_LABELS,
  SLOT_COLORS,
  SlotId,
} from '@/types/switching';

interface RuleRowProps {
  rule: SwitchingTrigger;
  slots: StrategySlot[];
  indicators: IndicatorInfo[];
  defaultSlotId: string;
  onUpdate: (rule: SwitchingTrigger) => void;
}

export default function RuleRow({
  rule,
  slots,
  indicators,
  defaultSlotId,
  onUpdate,
}: RuleRowProps) {
  const getIndicator = useCallback(
    (id: string) => indicators.find((ind) => ind.id === id),
    [indicators],
  );

  const getOperatorsForIndicator = useCallback(
    (indicatorId: string): string[] => {
      const ind = getIndicator(indicatorId);
      if (!ind) return [];
      if (ind.type === 'string') return ['eq', 'neq'];
      return ['gt', 'gte', 'lt', 'lte'];
    },
    [getIndicator],
  );

  const updateCondition = useCallback(
    (index: number, updated: IndicatorCondition) => {
      const newConditions = [...rule.conditions];
      newConditions[index] = updated;
      onUpdate({ ...rule, conditions: newConditions });
    },
    [rule, onUpdate],
  );

  const addCondition = useCallback(() => {
    const defaultIndicator = indicators[0];
    if (!defaultIndicator) return;
    const ops = defaultIndicator.type === 'string' ? ['eq', 'neq'] : ['gt', 'gte', 'lt', 'lte'];
    const defaultValue =
      defaultIndicator.type === 'string' && defaultIndicator.values?.length
        ? defaultIndicator.values[0]
        : 0;
    const newCondition: IndicatorCondition = {
      indicator: defaultIndicator.id,
      operator: ops[0] as IndicatorCondition['operator'],
      value: defaultValue,
    };
    onUpdate({ ...rule, conditions: [...rule.conditions, newCondition] });
  }, [rule, indicators, onUpdate]);

  const removeCondition = useCallback(
    (index: number) => {
      const newConditions = rule.conditions.filter((_, i) => i !== index);
      onUpdate({ ...rule, conditions: newConditions });
    },
    [rule, onUpdate],
  );

  const toggleLogic = useCallback(() => {
    onUpdate({ ...rule, logic: rule.logic === 'and' ? 'or' : 'and' });
  }, [rule, onUpdate]);

  const handleIndicatorChange = useCallback(
    (index: number, newIndicatorId: string) => {
      const ind = getIndicator(newIndicatorId);
      if (!ind) return;
      const ops = ind.type === 'string' ? ['eq', 'neq'] : ['gt', 'gte', 'lt', 'lte'];
      const defaultValue =
        ind.type === 'string' && ind.values?.length ? ind.values[0] : 0;
      updateCondition(index, {
        indicator: newIndicatorId,
        operator: ops[0] as IndicatorCondition['operator'],
        value: defaultValue,
      });
    },
    [getIndicator, updateCondition],
  );

  const handleOperatorChange = useCallback(
    (index: number, newOperator: string) => {
      updateCondition(index, {
        ...rule.conditions[index],
        operator: newOperator as IndicatorCondition['operator'],
      });
    },
    [rule.conditions, updateCondition],
  );

  const handleValueChange = useCallback(
    (index: number, newValue: number | string) => {
      updateCondition(index, {
        ...rule.conditions[index],
        value: newValue,
      });
    },
    [rule.conditions, updateCondition],
  );

  const handleSlotChange = useCallback(
    (slotId: string) => {
      onUpdate({ ...rule, strategySlotId: slotId });
    },
    [rule, onUpdate],
  );

  const slotColor = SLOT_COLORS[rule.strategySlotId as SlotId];

  const selectClass =
    'px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white';
  const inputClass =
    'w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 border border-gray-200 dark:border-gray-700">
      <div className="flex items-start gap-3">
        {/* Conditions + Target */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {rule.conditions.map((condition, idx) => {
              const ind = getIndicator(condition.indicator);
              const operators = getOperatorsForIndicator(condition.indicator);
              const isStringType = ind?.type === 'string';

              return (
                <div key={idx} className="contents">
                  {/* Logic toggle between conditions */}
                  {idx > 0 && (
                    <button
                      onClick={toggleLogic}
                      className="px-2 py-0.5 text-xs font-semibold rounded border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      title="AND/OR 전환"
                    >
                      {rule.logic.toUpperCase()}
                    </button>
                  )}

                  {/* Condition row: indicator, operator, value, remove */}
                  <div className="flex items-center gap-1">
                    {/* Indicator dropdown */}
                    <select
                      value={condition.indicator}
                      onChange={(e) => handleIndicatorChange(idx, e.target.value)}
                      className={selectClass}
                    >
                      {indicators.map((ind) => (
                        <option key={ind.id} value={ind.id}>
                          {ind.label}
                        </option>
                      ))}
                    </select>

                    {/* Operator dropdown */}
                    <select
                      value={condition.operator}
                      onChange={(e) => handleOperatorChange(idx, e.target.value)}
                      className={`${selectClass} w-16 text-center`}
                    >
                      {operators.map((op) => (
                        <option key={op} value={op}>
                          {OPERATOR_LABELS[op] ?? op}
                        </option>
                      ))}
                    </select>

                    {/* Value: string type -> dropdown, number type -> number input */}
                    {isStringType && ind?.values ? (
                      <select
                        value={String(condition.value)}
                        onChange={(e) => handleValueChange(idx, e.target.value)}
                        className={selectClass}
                      >
                        {ind.values.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        value={condition.value}
                        onChange={(e) =>
                          handleValueChange(
                            idx,
                            e.target.value === '' ? '' : Number(e.target.value),
                          )
                        }
                        className={inputClass}
                        placeholder={ind?.unit ?? ''}
                      />
                    )}

                    {/* Remove condition */}
                    <button
                      onClick={() => removeCondition(idx)}
                      className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                      title="조건 제거"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add condition button */}
            <button
              onClick={addCondition}
              className="px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 border border-dashed border-blue-300 dark:border-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              + 조건 추가
            </button>

            {/* Arrow to target */}
            <span className="text-gray-400 dark:text-gray-500 mx-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </span>

            {/* Target slot selector */}
            <select
              value={rule.strategySlotId}
              onChange={(e) => handleSlotChange(e.target.value)}
              className={`${selectClass} font-medium ${
                slotColor
                  ? `${slotColor.text}`
                  : ''
              }`}
            >
              {slots.map((slot) => (
                <option key={slot.slotId} value={slot.slotId}>
                  {slot.slotId} {slot.name}
                </option>
              ))}
            </select>

          </div>
        </div>
      </div>
    </div>
  );
}
