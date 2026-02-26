'use client';

import { useState, useCallback } from 'react';
import { StrategySlot, SLOT_COLORS, SlotId, STRATEGY_OPTIONS, STRATEGY_DEFAULTS } from '@/types/switching';

interface SwitchingSlotCardProps {
  slot: StrategySlot;
  onUpdate: (slot: StrategySlot) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export default function SwitchingSlotCard({
  slot,
  onUpdate,
  onRemove,
  canRemove,
}: SwitchingSlotCardProps) {
  const slotId = slot.slotId as SlotId;
  const colors = SLOT_COLORS[slotId] ?? SLOT_COLORS.A;

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(slot.name);

  const handleNameSubmit = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== slot.name) {
      onUpdate({ ...slot, name: trimmed });
    } else {
      setEditName(slot.name);
    }
    setIsEditingName(false);
  }, [editName, slot, onUpdate]);

  const handleStrategyChange = useCallback((strategyId: string) => {
    const defaults = STRATEGY_DEFAULTS[strategyId] ?? STRATEGY_DEFAULTS.ddeolsapro1;
    onUpdate({ ...slot, strategyId, parameters: { ...defaults } });
  }, [slot, onUpdate]);

  const handleParamChange = useCallback((key: string, value: number | string) => {
    onUpdate({
      ...slot,
      parameters: {
        ...slot.parameters,
        [key]: value,
      },
    });
  }, [slot, onUpdate]);

  return (
    <div className={`rounded-lg border p-3 ${colors.bg} ${colors.border}`}>
      {/* Header: badge + name + remove */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${colors.badge}`}>
            {slotId}
          </span>
          {isEditingName ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSubmit();
                if (e.key === 'Escape') {
                  setEditName(slot.name);
                  setIsEditingName(false);
                }
              }}
              autoFocus
              className="px-1.5 py-0.5 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : (
            <button
              onClick={() => {
                setEditName(slot.name);
                setIsEditingName(true);
              }}
              className={`text-sm font-medium ${colors.text} hover:underline cursor-pointer`}
              title="클릭하여 이름 수정"
            >
              {slot.name}
            </button>
          )}
        </div>
        {canRemove && (
          <button
            onClick={onRemove}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
            title="슬롯 제거"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Strategy selector */}
      <div className="mb-2">
        <select
          value={slot.strategyId}
          onChange={(e) => handleStrategyChange(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">전략 선택</option>
          {STRATEGY_OPTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.ratios})
            </option>
          ))}
        </select>
      </div>

      {/* Parameters grid */}
      {slot.strategyId && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {/* dropPercent */}
          <div className="flex items-center gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">하락%:</label>
            <input
              type="number"
              value={String(slot.parameters.dropPercent ?? '')}
              onChange={(e) => handleParamChange('dropPercent', e.target.value === '' ? '' : Number(e.target.value))}
              min={0}
              step={0.01}
              className="w-full px-1.5 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="0.01"
            />
          </div>

          {/* targetProfit */}
          <div className="flex items-center gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">목표%:</label>
            <input
              type="number"
              value={String(slot.parameters.targetProfit ?? '')}
              onChange={(e) => handleParamChange('targetProfit', e.target.value === '' ? '' : Number(e.target.value))}
              min={0}
              step={0.01}
              className="w-full px-1.5 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="0.01"
            />
          </div>

          {/* stopLossDays */}
          <div className="flex items-center gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">손절일:</label>
            <input
              type="number"
              value={String(slot.parameters.stopLossDays ?? '')}
              onChange={(e) => handleParamChange('stopLossDays', e.target.value === '' ? '' : Number(e.target.value))}
              min={0}
              step={1}
              className="w-full px-1.5 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="30"
            />
          </div>

          {/* stopLossDayBuy */}
          <div className="flex items-center gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">손절매수:</label>
            <select
              value={String(slot.parameters.stopLossDayBuy ?? 'allow')}
              onChange={(e) => handleParamChange('stopLossDayBuy', e.target.value)}
              className="w-full px-1.5 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="allow">허용</option>
              <option value="block">차단</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
