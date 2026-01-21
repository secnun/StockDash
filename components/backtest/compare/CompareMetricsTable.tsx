'use client';

import { CompareResult } from '@/types/backtest';

interface CompareMetricsTableProps {
  results: CompareResult[];
}

export default function CompareMetricsTable({ results }: CompareMetricsTableProps) {
  if (results.length === 0) return null;

  // 각 지표별 최고값 찾기 (하이라이트용)
  const bestReturn = Math.max(...results.map(r => r.result.metrics.totalReturn));
  const bestCagr = Math.max(...results.map(r => r.result.metrics.cagr));
  const bestMdd = Math.max(...results.map(r => r.result.metrics.mdd)); // MDD는 가장 덜 손실이 최고
  const bestWinRate = Math.max(...results.map(r => r.result.metrics.winRate));
  const bestSharpe = Math.max(...results.map(r => r.result.metrics.sharpeRatio));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700">
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">전략</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">총 수익률</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">CAGR</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">MDD</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">승률</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Sharpe</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">거래 횟수</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {results.map((compareResult) => {
              const metrics = compareResult.result.metrics;
              return (
                <tr key={compareResult.strategyId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  {/* 전략명 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: compareResult.color }}
                      />
                      <span className="font-medium text-gray-900 dark:text-white">
                        {compareResult.strategyName}
                      </span>
                    </div>
                  </td>

                  {/* 총 수익률 */}
                  <td className={`px-4 py-3 text-right font-mono ${
                    metrics.totalReturn === bestReturn ? 'font-bold text-green-600 dark:text-green-400' :
                    metrics.totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {metrics.totalReturn.toFixed(2)}%
                  </td>

                  {/* CAGR */}
                  <td className={`px-4 py-3 text-right font-mono ${
                    metrics.cagr === bestCagr ? 'font-bold text-green-600 dark:text-green-400' :
                    metrics.cagr >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {metrics.cagr.toFixed(2)}%
                  </td>

                  {/* MDD */}
                  <td className={`px-4 py-3 text-right font-mono ${
                    metrics.mdd === bestMdd ? 'font-bold text-red-600 dark:text-red-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {metrics.mdd.toFixed(2)}%
                  </td>

                  {/* 승률 */}
                  <td className={`px-4 py-3 text-right font-mono ${
                    metrics.winRate === bestWinRate ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
                  }`}>
                    {metrics.winRate.toFixed(1)}%
                  </td>

                  {/* Sharpe */}
                  <td className={`px-4 py-3 text-right font-mono ${
                    metrics.sharpeRatio === bestSharpe ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
                  }`}>
                    {metrics.sharpeRatio.toFixed(2)}
                  </td>

                  {/* 거래 횟수 */}
                  <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-300">
                    {metrics.totalTrades}회
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
