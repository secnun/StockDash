'use client';

import { useMemo } from 'react';
import { Trade } from '@/types/backtest';
import { calculateYearlyStats, calculateTotalStats, YearlyStats } from '@/lib/backtest/yearlyStats';

interface YearlyStatsTableProps {
  equity: { time: number; value: number }[];
  trades: Trade[];
}

export default function YearlyStatsTable({ equity, trades }: YearlyStatsTableProps) {
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
        <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">
          {isTotal ? '합계' : stats.year}
        </td>
        <td className="px-3 py-2 text-sm text-right text-gray-600 dark:text-gray-300">
          {formatValue(stats.startValue)}
        </td>
        <td className="px-3 py-2 text-sm text-right text-gray-600 dark:text-gray-300">
          {formatValue(stats.endValue)}
        </td>
        <td className={`px-3 py-2 text-sm text-right font-medium ${getReturnColor(stats.return)}`}>
          {stats.return >= 0 ? '+' : ''}{stats.return.toFixed(2)}%
        </td>
        <td className="px-3 py-2 text-sm text-right text-red-600 dark:text-red-400">
          -{stats.mdd.toFixed(2)}%
        </td>
        <td className="px-3 py-2 text-sm text-right text-gray-600 dark:text-gray-300">
          {stats.trades}
        </td>
      </tr>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        연도별 성과
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                연도
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                시작
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                종료
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                수익률
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                MDD
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
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
