'use client';

import { useState, useRef } from 'react';
import {
  DongpaMode,
  DongpaTrigger,
  DongpaIndicatorInfo,
  DongpaConfig,
  DongpaConditionRange,
  DongpaOptimizerResultItem,
} from '@/types/dongpa';
import { runDongpaOptimizerAPI, cancelDongpaOptimizer } from '@/lib/api/client';

interface DongpaOptimizerTabProps {
  modes: DongpaMode[];
  indicators: DongpaIndicatorInfo[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  applyFee: boolean;
  triggers: DongpaTrigger[];
  qqqMaPeriod: number;
  positionHandling: 'carry' | 'liquidate';
  defaultModeId: string;
  onApplyResult: (updatedTriggers: DongpaTrigger[]) => void;
}

export default function DongpaOptimizerTab({
  modes,
  indicators,
  startDate,
  endDate,
  initialCapital,
  applyFee,
  triggers,
  qqqMaPeriod,
  positionHandling,
  defaultModeId,
  onApplyResult,
}: DongpaOptimizerTabProps) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number; percent: number } | null>(null);
  const [results, setResults] = useState<DongpaOptimizerResultItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [algorithm, setAlgorithm] = useState<'grid_search' | 'monte_carlo'>('grid_search');
  const jobIdRef = useRef<string | null>(null);

  // 조건 범위 자동 생성
  const buildConditionRanges = (): DongpaConditionRange[] => {
    const ranges: DongpaConditionRange[] = [];
    triggers.forEach((trigger, tIdx) => {
      trigger.conditions.forEach((cond, cIdx) => {
        const indInfo = indicators.find((i) => i.id === cond.indicator);
        if (indInfo?.type === 'number') {
          const baseVal = Number(cond.value);
          ranges.push({
            triggerIndex: tIdx,
            conditionIndex: cIdx,
            indicator: cond.indicator,
            operator: cond.operator,
            minValue: baseVal - 10,
            maxValue: baseVal + 10,
            step: 2,
          });
        }
      });
    });
    return ranges;
  };

  const [conditionRanges, setConditionRanges] = useState<DongpaConditionRange[]>(buildConditionRanges);

  const handleRun = async () => {
    setError(null);
    setRunning(true);
    setProgress(null);
    setResults([]);

    const config: DongpaConfig = {
      modes,
      triggers,
      defaultModeId,
      qqqMaPeriod,
      positionHandling,
    };

    try {
      await runDongpaOptimizerAPI(
        {
          tickerId: 'SOXL',
          startDate,
          endDate,
          initialCapital,
          applyFee,
          market: 'us',
          dongpaConfig: config,
          conditionRanges,
          topN: 50,
          algorithm,
        },
        {
          onStart: (s) => { jobIdRef.current = s.jobId; },
          onProgress: (p) => setProgress(p),
          onResults: (r) => setResults(r),
          onDone: () => setRunning(false),
          onCancelled: () => setRunning(false),
          onError: (e) => {
            setError(e.message);
            setRunning(false);
          },
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '옵티마이저 실패');
      setRunning(false);
    }
  };

  const handleCancel = async () => {
    if (jobIdRef.current) {
      await cancelDongpaOptimizer(jobIdRef.current);
    }
  };

  const handleApply = (item: DongpaOptimizerResultItem) => {
    const updatedTriggers = [...triggers];
    for (const cv of item.conditionValues) {
      if (cv.triggerIndex < updatedTriggers.length && cv.conditionIndex < updatedTriggers[cv.triggerIndex].conditions.length) {
        updatedTriggers[cv.triggerIndex] = {
          ...updatedTriggers[cv.triggerIndex],
          conditions: updatedTriggers[cv.triggerIndex].conditions.map((c, i) =>
            i === cv.conditionIndex ? { ...c, value: cv.value } : c,
          ),
        };
      }
    }
    onApplyResult(updatedTriggers);
  };

  const updateRange = (idx: number, key: string, value: number) => {
    setConditionRanges((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)),
    );
  };

  return (
    <div className="space-y-4">
      {/* 설정 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">옵티마이저 설정</h3>

        {/* 알고리즘 선택 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 dark:text-gray-400">알고리즘</label>
          <div className="flex gap-1">
            {(['grid_search', 'monte_carlo'] as const).map((alg) => (
              <button
                key={alg}
                onClick={() => setAlgorithm(alg)}
                className={`px-3 py-1 text-xs rounded ${
                  algorithm === alg
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {alg === 'grid_search' ? 'Grid Search' : 'Monte Carlo'}
              </button>
            ))}
          </div>
        </div>

        {/* 조건 범위 */}
        {conditionRanges.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400">조건 탐색 범위</h4>
            {conditionRanges.map((range, idx) => {
              const indInfo = indicators.find((i) => i.id === range.indicator);
              return (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600 dark:text-gray-400 min-w-[80px]">
                    {indInfo?.label || range.indicator}
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    value={range.minValue ?? 0}
                    onChange={(e) => updateRange(idx, 'minValue', parseFloat(e.target.value))}
                    className="w-16 px-1 py-0.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <span className="text-gray-400">~</span>
                  <input
                    type="number"
                    step="0.5"
                    value={range.maxValue ?? 0}
                    onChange={(e) => updateRange(idx, 'maxValue', parseFloat(e.target.value))}
                    className="w-16 px-1 py-0.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <span className="text-gray-400">step</span>
                  <input
                    type="number"
                    step="0.5"
                    value={range.step ?? 1}
                    onChange={(e) => updateRange(idx, 'step', parseFloat(e.target.value))}
                    className="w-14 px-1 py-0.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  {indInfo?.unit && <span className="text-gray-400">{indInfo.unit}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 실행 */}
      <div className="flex gap-2">
        <button
          onClick={handleRun}
          disabled={running}
          className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {running ? '최적화 중...' : '옵티마이저 실행'}
        </button>
        {running && (
          <button
            onClick={handleCancel}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            취소
          </button>
        )}
      </div>

      {/* 진행률 */}
      {progress && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>{progress.completed} / {progress.total}</span>
            <span>{progress.percent}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* 결과 테이블 */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              최적화 결과 (상위 {results.length}개)
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-2 py-2 text-left text-gray-500 dark:text-gray-400">#</th>
                  <th className="px-2 py-2 text-right text-gray-500 dark:text-gray-400">수익률</th>
                  <th className="px-2 py-2 text-right text-gray-500 dark:text-gray-400">CAGR</th>
                  <th className="px-2 py-2 text-right text-gray-500 dark:text-gray-400">MDD</th>
                  <th className="px-2 py-2 text-right text-gray-500 dark:text-gray-400">Sharpe</th>
                  <th className="px-2 py-2 text-right text-gray-500 dark:text-gray-400">전환</th>
                  <th className="px-2 py-2 text-right text-gray-500 dark:text-gray-400">점수</th>
                  <th className="px-2 py-2 text-gray-500 dark:text-gray-400"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {results.map((item) => (
                  <tr key={item.rank} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-2 py-2 text-gray-500">{item.rank}</td>
                    <td className={`px-2 py-2 text-right font-mono ${item.totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {item.totalReturn.toFixed(1)}%
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-gray-900 dark:text-white">{item.cagr.toFixed(1)}%</td>
                    <td className="px-2 py-2 text-right font-mono text-red-600 dark:text-red-400">{item.mdd.toFixed(1)}%</td>
                    <td className="px-2 py-2 text-right font-mono text-gray-900 dark:text-white">{item.sharpeRatio.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{item.switchCount}</td>
                    <td className="px-2 py-2 text-right font-mono font-bold text-blue-600 dark:text-blue-400">{item.compositeScore.toFixed(3)}</td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => handleApply(item)}
                        className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/60"
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
  );
}
