'use client';

import { useState, useEffect, useMemo } from 'react';

interface SplitRatioEditorProps {
  divisions: number;
  splitPcts: Record<string, number | ''>;
  onDivisionsChange: (divisions: number) => void;
  onSplitPctChange: (key: string, value: number | '') => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function SplitRatioEditor({
  divisions,
  splitPcts,
  onDivisionsChange,
  onSplitPctChange,
  disabled = false,
  compact = false,
}: SplitRatioEditorProps) {
  const defaultPct = useMemo(() => Math.round((100 / divisions) * 100) / 100, [divisions]);

  // 분할 수 입력용 로컬 상태 (비우기 허용)
  const [divisionsInput, setDivisionsInput] = useState<number | ''>(divisions);
  useEffect(() => { setDivisionsInput(divisions); }, [divisions]);

  const total = useMemo(() => {
    let sum = 0;
    for (let i = 1; i <= divisions; i++) {
      const val = splitPcts[`splitPct${i}`];
      sum += typeof val === 'number' ? val : (val === '' ? 0 : defaultPct);
    }
    return Math.round(sum * 100) / 100;
  }, [divisions, splitPcts, defaultPct]);

  const isOverLimit = total > 100 + 0.01;
  const reserve = Math.max(0, Math.round((100 - total) * 100) / 100);

  return (
    <div className={`${compact ? 'mb-2' : 'mb-3'} p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600`}>
      <div className={`flex ${compact ? 'flex-wrap gap-1.5' : 'flex-wrap gap-2'} items-center`}>
        {/* 분할 수 */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">분할 수</label>
          <input
            type="number"
            value={divisionsInput}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                setDivisionsInput('');
              } else {
                const num = Number(raw);
                if (!isNaN(num)) setDivisionsInput(num);
              }
            }}
            onBlur={() => {
              const val = typeof divisionsInput === 'number' ? divisionsInput : divisions;
              const clamped = Math.max(2, Math.min(10, val));
              setDivisionsInput(clamped);
              if (clamped !== divisions) onDivisionsChange(clamped);
            }}
            min={2}
            max={10}
            step={1}
            className="w-14 px-1.5 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            disabled={disabled}
          />
        </div>

        <span className="text-gray-300 dark:text-gray-600">|</span>

        {/* 각 분할 비율 */}
        {Array.from({ length: divisions }, (_, i) => i + 1).map((n) => (
          <div key={n} className="flex items-center gap-0.5">
            <label className="text-xs text-gray-400 dark:text-gray-500">{n}차</label>
            <input
              type="number"
              value={splitPcts[`splitPct${n}`] ?? defaultPct}
              onChange={(e) => onSplitPctChange(`splitPct${n}`, e.target.value === '' ? '' : Number(e.target.value))}
              min={0}
              max={100}
              step={0.01}
              className="w-16 px-1.5 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={disabled}
            />
            <span className="text-xs text-gray-400">%</span>
          </div>
        ))}

        <span className="text-gray-300 dark:text-gray-600">|</span>

        {/* 합계 표시 */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className={isOverLimit ? 'text-red-500 font-semibold' : 'text-green-600 dark:text-green-400'}>
            합계: {total.toFixed(1)}%
            {!isOverLimit && ' \u2713'}
          </span>
          <span className="text-gray-400 dark:text-gray-500">
            (리저브: {reserve.toFixed(1)}%)
          </span>
        </div>
      </div>

      {/* 100% 초과 경고 */}
      {isOverLimit && (
        <p className="mt-1.5 text-xs text-red-500 font-medium">
          분할 비율 합계가 100%를 초과합니다. 실행 시 오류가 발생합니다.
        </p>
      )}
    </div>
  );
}
