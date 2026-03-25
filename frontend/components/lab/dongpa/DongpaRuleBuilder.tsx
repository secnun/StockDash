'use client';

import { DongpaTrigger, DongpaMode, DongpaIndicatorInfo, OPERATOR_LABELS, MODE_COLORS, ModeId } from '@/types/dongpa';

interface DongpaRuleBuilderProps {
  triggers: DongpaTrigger[];
  onTriggersChange: (triggers: DongpaTrigger[]) => void;
  modes: DongpaMode[];
  indicators: DongpaIndicatorInfo[];
}

export default function DongpaRuleBuilder({
  triggers,
  onTriggersChange,
  modes,
  indicators,
}: DongpaRuleBuilderProps) {
  const updateTrigger = (idx: number, updates: Partial<DongpaTrigger>) => {
    const updated = triggers.map((t, i) => (i === idx ? { ...t, ...updates } : t));
    onTriggersChange(updated);
  };

  const addTrigger = () => {
    const newId = `trigger_${Date.now()}`;
    onTriggersChange([
      ...triggers,
      {
        id: newId,
        name: `규칙 ${triggers.length + 1}`,
        conditions: [{ indicator: 'qqq_ma_cross', operator: 'eq', value: '위' }],
        logic: 'and',
        targetModeId: modes[0]?.modeId || 'safe',
        priority: triggers.length,
      },
    ]);
  };

  const removeTrigger = (idx: number) => {
    onTriggersChange(triggers.filter((_, i) => i !== idx));
  };

  const updateCondition = (triggerIdx: number, condIdx: number, key: string, value: string | number) => {
    const updated = [...triggers];
    const conds = [...updated[triggerIdx].conditions];
    conds[condIdx] = { ...conds[condIdx], [key]: value };
    updated[triggerIdx] = { ...updated[triggerIdx], conditions: conds };
    onTriggersChange(updated);
  };

  const addCondition = (triggerIdx: number) => {
    const updated = [...triggers];
    updated[triggerIdx] = {
      ...updated[triggerIdx],
      conditions: [
        ...updated[triggerIdx].conditions,
        { indicator: 'qqq_trend_deviation', operator: 'gt', value: 0 },
      ],
    };
    onTriggersChange(updated);
  };

  const removeCondition = (triggerIdx: number, condIdx: number) => {
    const updated = [...triggers];
    updated[triggerIdx] = {
      ...updated[triggerIdx],
      conditions: updated[triggerIdx].conditions.filter((_, i) => i !== condIdx),
    };
    onTriggersChange(updated);
  };

  return (
    <div className="space-y-3">
      {triggers.map((trigger, tIdx) => {
        const targetMode = modes.find((m) => m.modeId === trigger.targetModeId);
        const colors = MODE_COLORS[trigger.targetModeId as ModeId] || MODE_COLORS.safe;
        return (
          <div key={trigger.id} className={`rounded-lg border p-3 ${colors.bg} ${colors.border}`}>
            <div className="flex items-center justify-between mb-2">
              <input
                type="text"
                value={trigger.name}
                onChange={(e) => updateTrigger(tIdx, { name: e.target.value })}
                className="text-sm font-medium bg-transparent border-none outline-none text-gray-900 dark:text-white flex-1"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">&rarr;</span>
                <select
                  value={trigger.targetModeId}
                  onChange={(e) => updateTrigger(tIdx, { targetModeId: e.target.value })}
                  className="text-xs px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {modes.map((m) => (
                    <option key={m.modeId} value={m.modeId}>{m.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeTrigger(tIdx)}
                  className="text-gray-400 hover:text-red-500 text-xs"
                  title="삭제"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* 조건 목록 */}
            <div className="space-y-1.5">
              {trigger.conditions.map((cond, cIdx) => {
                const indInfo = indicators.find((ind) => ind.id === cond.indicator);
                return (
                  <div key={cIdx} className="flex items-center gap-1.5 text-xs">
                    {cIdx > 0 && (
                      <select
                        value={trigger.logic}
                        onChange={(e) => updateTrigger(tIdx, { logic: e.target.value as 'and' | 'or' })}
                        className="px-1 py-0.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                      >
                        <option value="and">AND</option>
                        <option value="or">OR</option>
                      </select>
                    )}
                    <select
                      value={cond.indicator}
                      onChange={(e) => {
                        const newInd = indicators.find((i) => i.id === e.target.value);
                        updateCondition(tIdx, cIdx, 'indicator', e.target.value);
                        if (newInd?.values) {
                          updateCondition(tIdx, cIdx, 'value', newInd.values[0]);
                          updateCondition(tIdx, cIdx, 'operator', 'eq');
                        } else {
                          updateCondition(tIdx, cIdx, 'value', 0);
                          updateCondition(tIdx, cIdx, 'operator', 'gt');
                        }
                      }}
                      className="px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {indicators.map((ind) => (
                        <option key={ind.id} value={ind.id}>{ind.label}</option>
                      ))}
                    </select>
                    <select
                      value={cond.operator}
                      onChange={(e) => updateCondition(tIdx, cIdx, 'operator', e.target.value)}
                      className="px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {(indInfo?.operators || ['eq', 'gt', 'lt']).map((op) => (
                        <option key={op} value={op}>{OPERATOR_LABELS[op] || op}</option>
                      ))}
                    </select>
                    {indInfo?.values ? (
                      <select
                        value={String(cond.value)}
                        onChange={(e) => updateCondition(tIdx, cIdx, 'value', e.target.value)}
                        className="px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        {indInfo.values.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        step="0.5"
                        value={isNaN(Number(cond.value)) ? 0 : Number(cond.value)}
                        onChange={(e) => updateCondition(tIdx, cIdx, 'value', parseFloat(e.target.value) || 0)}
                        className="w-20 px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    )}
                    {indInfo?.unit && (
                      <span className="text-gray-400">{indInfo.unit}</span>
                    )}
                    {trigger.conditions.length > 1 && (
                      <button
                        onClick={() => removeCondition(tIdx, cIdx)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => addCondition(tIdx)}
              className="mt-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              + 조건 추가
            </button>
          </div>
        );
      })}

      <button
        onClick={addTrigger}
        className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
      >
        + 규칙 추가
      </button>
    </div>
  );
}
