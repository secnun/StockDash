'use client';

import { useCallback } from 'react';
import { StrategySlot, SLOT_IDS, SlotId, STRATEGY_DEFAULTS } from '@/types/switching';
import SwitchingSlotCard from './SwitchingSlotCard';

interface SwitchingSlotListProps {
  slots: StrategySlot[];
  onSlotsChange: (slots: StrategySlot[]) => void;
}

function createDefaultSlot(slotId: SlotId): StrategySlot {
  const strategyId = slotId === 'A' ? 'ddeolsapro1' : 'ddeolsapro2';
  return {
    slotId,
    name: slotId === 'A' ? '공격형' : slotId === 'B' ? '보수형' : `전략 ${slotId}`,
    strategyId,
    parameters: { ...STRATEGY_DEFAULTS[strategyId] },
  };
}

export default function SwitchingSlotList({ slots, onSlotsChange }: SwitchingSlotListProps) {
  const handleUpdate = useCallback(
    (index: number, updated: StrategySlot) => {
      const next = [...slots];
      next[index] = updated;
      onSlotsChange(next);
    },
    [slots, onSlotsChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onSlotsChange(slots.filter((_, i) => i !== index));
    },
    [slots, onSlotsChange],
  );

  const handleAdd = useCallback(() => {
    const usedIds = new Set(slots.map((s) => s.slotId));
    const nextId = SLOT_IDS.find((id) => !usedIds.has(id));
    if (!nextId) return;
    onSlotsChange([...slots, createDefaultSlot(nextId)]);
  }, [slots, onSlotsChange]);

  const canAdd = slots.length < 4;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
        전략 프리셋
      </h3>
      <div className="space-y-2">
        {slots.map((slot, i) => (
          <SwitchingSlotCard
            key={slot.slotId}
            slot={slot}
            onUpdate={(s) => handleUpdate(i, s)}
            onRemove={() => handleRemove(i)}
            canRemove={slots.length > 2}
          />
        ))}
      </div>
      {canAdd && (
        <button
          onClick={handleAdd}
          className="mt-2 w-full py-1.5 text-sm text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          + 프리셋 추가 ({slots.length}/4)
        </button>
      )}
    </div>
  );
}
