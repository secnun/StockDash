'use client';

import { useCallback } from 'react';
import { SwitchingTrigger, StrategySlot, IndicatorInfo } from '@/types/switching';
import RuleRow from './RuleRow';

interface SwitchingRuleBuilderProps {
  rules: SwitchingTrigger[];
  slots: StrategySlot[];
  indicators: IndicatorInfo[];
  defaultSlotId: string;
  onRulesChange: (rules: SwitchingTrigger[]) => void;
}

export default function SwitchingRuleBuilder({
  rules,
  slots,
  indicators,
  defaultSlotId,
  onRulesChange,
}: SwitchingRuleBuilderProps) {
  const handleUpdate = useCallback(
    (index: number, updated: SwitchingTrigger) => {
      onRulesChange(rules.map((r, i) => (i === index ? updated : r)));
    },
    [rules, onRulesChange],
  );

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
        스위칭 트리거
      </h3>
      <div className="space-y-2">
        {rules.map((rule, idx) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            slots={slots}
            indicators={indicators}
            defaultSlotId={defaultSlotId}
            onUpdate={(updated) => handleUpdate(idx, updated)}
          />
        ))}
      </div>
    </div>
  );
}
