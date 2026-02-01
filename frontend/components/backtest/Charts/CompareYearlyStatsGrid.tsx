'use client';

import { useMemo } from 'react';
import { CompareResult } from '@/types/backtest';
import { calculateYearlyStats, calculateTotalStats, YearlyStats } from '@/lib/backtest/yearlyStats';

interface CompareYearlyStatsGridProps {
  results: CompareResult[];
}

/**
 * Compare 모드용 연도별 통계 테이블 그리드
 * - 2개: 좌우 배치
 * - 3개: 좌우 2개 + 아래 1개
 * - 4개: 좌우 2개 + 아래 좌우 2개
 */
export default function CompareYearlyStatsGrid({ results }: CompareYearlyStatsGridProps) {
  if (results.length === 0) return null;

  // 2개씩 그룹화
  const rows: CompareResult[][] = [];
  for (let i = 0; i < results.length; i += 2) {
    rows.push(results.slice(i, i + 2));
  }

  return (
    <div className="space-y-4">
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className={`grid gap-4 ${row.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}
        >
          {row.map((compareResult) => (
            <YearlyStatsTableCompact
              key={compareResult.strategyId}
              strategyName={compareResult.strategyName}
              color={compareResult.color}
              equity={compareResult.result.equity}
              trades={compareResult.result.trades}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface YearlyStatsTableCompactProps {
  strategyName: string;
  color: string;
  equity: { time: number; value: number }[];
  trades: { time: number; type: 'buy' | 'sell'; price: number; quantity: number; value: number }[];
}

/**
 * Compare 모드용 컴팩트 연도별 테이블
 */
function YearlyStatsTableCompact({ strategyName, color, equity, trades }: YearlyStatsTableCompactProps) {
  const yearlyStats = useMemo(() => calculateYearlyStats(equity, trades), [equity, trades]);
  const totalStats = useMemo(() => calculateTotalStats(equity, trades), [equity, trades]);

  if (yearlyStats.length === 0) return null;

  const formatValue = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  const getReturnColor = (returnValue: number): string => {
    if (returnValue > 0) return 'text-green-600 dark:text-green-400';
    if (returnValue < 0) return 'text-red-600 dark:text-red-400';
    return 'text-gray-600 dark:text-gray-300';
  };

  const renderRow = (stats: YearlyStats, isTotal: boolean = false) => {
    const rowClass = isTotal
      ? 'bg-gray-100 dark:bg-gray-700 font-semibold'
      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50';

    return (
      <tr key={stats.year} className={rowClass}>
        <td className="px-2 py-1.5 text-xs text-gray-900 dark:text-white">
          {isTotal ? '합계' : stats.year}
        </td>
        <td className="px-2 py-1.5 text-xs text-right text-gray-600 dark:text-gray-300">
          {formatValue(stats.startValue)}
        </td>
        <td className="px-2 py-1.5 text-xs text-right text-gray-600 dark:text-gray-300">
          {formatValue(stats.endValue)}
        </td>
        <td className={`px-2 py-1.5 text-xs text-right font-medium ${getReturnColor(stats.return)}`}>
          {stats.return >= 0 ? '+' : ''}{stats.return.toFixed(2)}%
        </td>
        <td className="px-2 py-1.5 text-xs text-right text-red-600 dark:text-red-400">
          -{stats.mdd.toFixed(2)}%
        </td>
        <td className="px-2 py-1.5 text-xs text-right text-gray-600 dark:text-gray-300">
          {stats.trades}
        </td>
      </tr>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {strategyName}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                연도
              </th>
              <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                시작
              </th>
              <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                종료
              </th>
              <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                수익률
              </th>
              <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                MDD
              </th>
              <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                거래
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {yearlyStats.map((stats) => renderRow(stats))}
            {totalStats && renderRow(totalStats, true)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
