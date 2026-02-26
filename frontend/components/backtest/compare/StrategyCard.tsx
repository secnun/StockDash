'use client';

import { useCallback } from 'react';
import { ParameterValue, SelectedStrategy } from '@/types/backtest';
import { StrategyInfo } from '@/lib/api/client';
import SplitRatioEditor from '@/components/backtest/SplitRatioEditor';

interface StrategyCardProps {
  selectedStrategy: SelectedStrategy;
  strategies: StrategyInfo[];
  color: string;
  index: number;
  onRemove: () => void;
  onUpdate: (updated: SelectedStrategy) => void;
  disabled?: boolean;
}

export default function StrategyCard({
  selectedStrategy,
  strategies,
  color,
  index,
  onRemove,
  onUpdate,
  disabled = false,
}: StrategyCardProps) {
  const strategy = selectedStrategy.strategyId
    ? strategies.find(s => s.id === selectedStrategy.strategyId)
    : null;

  const handleStrategyChange = useCallback((strategyId: string) => {
    const newStrategy = strategies.find(s => s.id === strategyId);
    if (newStrategy) {
      const defaultParams: Record<string, ParameterValue> = {};
      newStrategy.parameters.forEach((param) => {
        defaultParams[param.key] = param.default;
      });
      // 커스텀 전략: 기본 splitPct 초기화
      if (strategyId === 'ddeolsapro_custom') {
        const divisions = (defaultParams.divisions as number) || 6;
        const defaultPct = Math.round((100 / divisions) * 100) / 100;
        for (let i = 1; i <= divisions; i++) {
          defaultParams[`splitPct${i}`] = defaultPct;
        }
      }
      onUpdate({
        ...selectedStrategy,
        strategyId,
        params: defaultParams,
      });
    } else {
      onUpdate({
        ...selectedStrategy,
        strategyId: '',
        params: {},
      });
    }
  }, [selectedStrategy, strategies, onUpdate]);

  const handleParamChange = useCallback((key: string, value: ParameterValue) => {
    onUpdate({
      ...selectedStrategy,
      params: {
        ...selectedStrategy.params,
        [key]: value,
      },
    });
  }, [selectedStrategy, onUpdate]);

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 border-l-4"
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-center gap-3">
        {/* 전략 번호 */}
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {index + 1}
        </div>

        {/* 전략 선택 */}
        <div className="flex-shrink-0 w-40">
          <select
            value={selectedStrategy.strategyId}
            onChange={(e) => handleStrategyChange(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-900"
            disabled={disabled}
          >
            <option value="">전략 선택</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* 파라미터 */}
        {strategy && (
          <div className="flex flex-wrap gap-2 items-center flex-1">
            {strategy.parameters
              .filter((param) =>
                selectedStrategy.strategyId !== 'ddeolsapro_custom' ||
                (!param.key.startsWith('splitPct') && param.key !== 'divisions')
              )
              .map((param) => (
              <div key={param.key} className="flex items-center gap-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">{param.label}:</label>
                {param.type === 'number' && (
                  <input
                    type="number"
                    value={(selectedStrategy.params[param.key] ?? param.default) as number | string}
                    onChange={(e) => handleParamChange(param.key, e.target.value === '' ? '' : Number(e.target.value))}
                    min={param.min}
                    max={param.max}
                    step={param.step || 1}
                    className="w-16 px-1.5 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={disabled}
                  />
                )}
                {param.type === 'select' && param.options && (
                  <select
                    value={String(selectedStrategy.params[param.key] ?? param.default)}
                    onChange={(e) => handleParamChange(param.key, e.target.value)}
                    className="w-16 px-1.5 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={disabled}
                  >
                    {param.options.map((opt) => (
                      <option key={String(opt.value)} value={String(opt.value)}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 삭제 버튼 */}
        <button
          onClick={onRemove}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
          title="전략 제거"
          disabled={disabled}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 분할 비율 에디터 (커스텀 전략 전용) */}
      {selectedStrategy.strategyId === 'ddeolsapro_custom' && (
        <div className="mt-2">
          <SplitRatioEditor
            divisions={(selectedStrategy.params.divisions as number) ?? 6}
            splitPcts={Object.fromEntries(
              Object.entries(selectedStrategy.params)
                .filter(([k]) => k.startsWith('splitPct'))
                .map(([k, v]) => [k, v as number])
            )}
            onDivisionsChange={(newDiv) => {
              const defaultPct = Math.round((100 / newDiv) * 100) / 100;
              const newParams: Record<string, ParameterValue> = {};
              Object.entries(selectedStrategy.params).forEach(([k, v]) => {
                if (!k.startsWith('splitPct') && k !== 'divisions') {
                  newParams[k] = v;
                }
              });
              newParams.divisions = newDiv;
              for (let i = 1; i <= newDiv; i++) {
                newParams[`splitPct${i}`] = defaultPct;
              }
              onUpdate({ ...selectedStrategy, params: newParams });
            }}
            onSplitPctChange={(key, value) => handleParamChange(key, value)}
            disabled={disabled}
            compact
          />
        </div>
      )}
    </div>
  );
}
