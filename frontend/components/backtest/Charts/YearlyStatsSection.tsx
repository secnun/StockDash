'use client';

import { useMemo, useState } from 'react';
import { Trade, PeriodIndependentResult } from '@/types/backtest';
import { calculateAutoStats, calculateTotalStats, YearlyStats } from '@/lib/backtest/yearlyStats';

type TabMode = 'cumulative' | 'seedReset' | 'seedCarry';

interface YearlyStatsSectionProps {
  equity: { time: number; value: number }[];
  trades: Trade[];
  currencySymbol?: string;
  yearlyIndependent?: PeriodIndependentResult;
}

export default function YearlyStatsSection({
  equity,
  trades,
  currencySymbol = '$',
  yearlyIndependent,
}: YearlyStatsSectionProps) {
  const [activeTab, setActiveTab] = useState<TabMode>('cumulative');

  // Cumulative (연속 복리) - 프론트엔드 계산, 자동 기간 판단
  const { stats: cumulativeStats, granularity: cumulativeGranularity } = useMemo(
    () => calculateAutoStats(equity, trades),
    [equity, trades]
  );
  const cumulativeTotalStats = useMemo(
    () => calculateTotalStats(equity, trades),
    [equity, trades]
  );

  // Backend independent results → YearlyStats[] 변환
  const seedResetStats = useMemo<YearlyStats[]>(() => {
    if (!yearlyIndependent) return [];
    return yearlyIndependent.seedReset.map((s) => ({
      year: 0,
      label: s.label,
      startValue: s.startValue,
      endValue: s.endValue,
      return: s.totalReturn,
      mdd: s.mdd,
      trades: s.totalTrades,
    }));
  }, [yearlyIndependent]);

  const seedCarryStats = useMemo<YearlyStats[]>(() => {
    if (!yearlyIndependent) return [];
    return yearlyIndependent.seedCarry.map((s) => ({
      year: 0,
      label: s.label,
      startValue: s.startValue,
      endValue: s.endValue,
      return: s.totalReturn,
      mdd: s.mdd,
      trades: s.totalTrades,
    }));
  }, [yearlyIndependent]);

  // 합계 행 계산
  const seedResetTotal = useMemo<YearlyStats | null>(() => {
    if (seedResetStats.length === 0) return null;
    const returns = seedResetStats.map((s) => s.return);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const maxMdd = Math.max(...seedResetStats.map((s) => s.mdd));
    const totalTrades = seedResetStats.reduce((a, s) => a + s.trades, 0);
    return {
      year: 0,
      startValue: seedResetStats[0].startValue,
      endValue: seedResetStats[seedResetStats.length - 1].endValue,
      return: avgReturn,
      mdd: maxMdd,
      trades: totalTrades,
    };
  }, [seedResetStats]);

  const seedCarryTotal = useMemo<YearlyStats | null>(() => {
    if (seedCarryStats.length === 0) return null;
    const first = seedCarryStats[0];
    const last = seedCarryStats[seedCarryStats.length - 1];
    const totalReturn = first.startValue > 0
      ? ((last.endValue - first.startValue) / first.startValue) * 100
      : 0;
    const maxMdd = Math.max(...seedCarryStats.map((s) => s.mdd));
    const totalTrades = seedCarryStats.reduce((a, s) => a + s.trades, 0);
    return {
      year: 0,
      startValue: first.startValue,
      endValue: last.endValue,
      return: totalReturn,
      mdd: maxMdd,
      trades: totalTrades,
    };
  }, [seedCarryStats]);

  // 현재 탭에 따른 데이터 선택
  const currentStats =
    activeTab === 'cumulative'
      ? cumulativeStats
      : activeTab === 'seedReset'
        ? seedResetStats
        : seedCarryStats;

  const currentTotal =
    activeTab === 'cumulative'
      ? cumulativeTotalStats
      : activeTab === 'seedReset'
        ? seedResetTotal
        : seedCarryTotal;

  const currentGranularity =
    activeTab === 'cumulative'
      ? cumulativeGranularity
      : yearlyIndependent?.granularity ?? 'yearly';

  const hasTabs = !!yearlyIndependent;

  if (cumulativeStats.length === 0 && !yearlyIndependent) return null;

  const tabs: { key: TabMode; label: string }[] = [
    { key: 'cumulative', label: '연속 복리' },
    { key: 'seedReset', label: '시드 리셋' },
    { key: 'seedCarry', label: '시드 이월' },
  ];

  const formatValue = (value: number): string => {
    if (value >= 1000000) {
      return `${currencySymbol}${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `${currencySymbol}${(value / 1000).toFixed(1)}K`;
    }
    return `${currencySymbol}${value.toFixed(0)}`;
  };

  const getReturnColor = (returnValue: number): string => {
    if (returnValue > 0) return 'text-green-600 dark:text-green-400';
    if (returnValue < 0) return 'text-red-600 dark:text-red-400';
    return 'text-gray-600 dark:text-gray-300';
  };

  const periodHeader = currentGranularity === 'monthly' ? '월' : '연도';
  const totalLabel = activeTab === 'seedReset' ? '평균' : '합계';

  const renderRow = (stats: YearlyStats, isTotal: boolean = false) => {
    const rowClass = isTotal
      ? 'bg-gray-100 dark:bg-gray-700 font-semibold'
      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50';

    const displayLabel = isTotal
      ? totalLabel
      : stats.label ?? stats.year;

    return (
      <tr key={isTotal ? '_total' : (stats.label ?? stats.year)} className={rowClass}>
        <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">
          {displayLabel}
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
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          {currentGranularity === 'monthly' ? '월별 성과' : '연도별 성과'}
        </h2>
        {hasTabs && (
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                {periodHeader}
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
            {currentStats.map((stats) => renderRow(stats))}
            {currentTotal && renderRow(currentTotal, true)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
