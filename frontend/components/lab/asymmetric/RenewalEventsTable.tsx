'use client';

import { useState, useMemo } from 'react';

interface RenewalEvent {
  time: number;
  dayIndex: number;
  rpDelta: number;
  rate: number;
  prevCapital: number;
  newCapital: number;
  surplus: number;
  injection: number;
}

interface Props {
  events: RenewalEvent[];
}

export default function RenewalEventsTable({ events }: Props) {
  const [expanded, setExpanded] = useState(false);
  // 누적값 사전 계산 (전체 이벤트 대상)
  const { cumulativeData, totals } = useMemo(() => {
    let cumSurplus = 0;
    let cumInjection = 0;
    let profitCount = 0;
    let lossCount = 0;

    let cumBalance = 0;
    let maxSingleInjection = 0; // 단일 최대 충전액

    const cumData = events.map((e) => {
      cumSurplus += e.surplus;
      cumInjection += e.injection;
      cumBalance += e.surplus - e.injection;
      if (e.injection > maxSingleInjection) maxSingleInjection = e.injection;
      if (e.rpDelta >= 0) profitCount++;
      else lossCount++;
      return {
        cumSurplus: Math.round(cumSurplus * 100) / 100,
        cumInjection: Math.round(cumInjection * 100) / 100,
        cumBalance: Math.round(cumBalance * 100) / 100,
      };
    });

    return {
      cumulativeData: cumData,
      totals: {
        totalSurplus: Math.round(cumSurplus * 100) / 100,
        totalInjection: Math.round(cumInjection * 100) / 100,
        maxSingleInjection: Math.round(maxSingleInjection * 100) / 100,
        netCashFlow: Math.round((cumSurplus - cumInjection) * 100) / 100,
        profitCount,
        lossCount,
      },
    };
  }, [events]);

  const displayEvents = expanded ? events : events.slice(0, 10);

  if (events.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">투자금 갱신 이벤트</h3>
        <p className="text-sm text-gray-400">갱신 이벤트가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          투자금 갱신 이벤트
          <span className="ml-2 text-xs font-normal text-gray-400">({events.length}건)</span>
        </h3>
        {events.length > 10 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-500 hover:text-blue-600"
          >
            {expanded ? '접기' : `전체 보기 (${events.length}건)`}
          </button>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-2.5">
          <div className="text-[10px] text-green-600 dark:text-green-400">잉여현금 합계 ({totals.profitCount}회)</div>
          <div className="text-sm font-bold font-mono text-green-700 dark:text-green-300">
            +{totals.totalSurplus.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2.5">
          <div className="text-[10px] text-red-600 dark:text-red-400">충전필요 합계 ({totals.lossCount}회)</div>
          <div className="text-sm font-bold font-mono text-red-700 dark:text-red-300">
            -{totals.totalInjection.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className={`border rounded-lg p-2.5 ${totals.netCashFlow >= 0 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'}`}>
          <div className={`text-[10px] ${totals.netCashFlow >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>순 현금흐름</div>
          <div className={`text-sm font-bold font-mono ${totals.netCashFlow >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-orange-700 dark:text-orange-300'}`}>
            {totals.netCashFlow >= 0 ? '+' : ''}{totals.netCashFlow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-2.5">
          <div className="text-[10px] text-yellow-600 dark:text-yellow-400">최대 1회 충전액</div>
          <div className="text-sm font-bold font-mono text-yellow-700 dark:text-yellow-300">
            {totals.maxSingleInjection > 0
              ? totals.maxSingleInjection.toLocaleString(undefined, { maximumFractionDigits: 0 })
              : '0'}
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-1.5 font-medium">날짜</th>
              <th className="text-right py-1.5 font-medium">구간 손익</th>
              <th className="text-right py-1.5 font-medium">적용률</th>
              <th className="text-right py-1.5 font-medium">갱신 투자금</th>
              <th className="text-right py-1.5 font-medium">잉여현금</th>
              <th className="text-right py-1.5 font-medium">충전필요</th>
              <th className="text-right py-1.5 font-medium">잔고</th>
            </tr>
          </thead>
          <tbody>
            {displayEvents.map((e, idx) => {
              const date = new Date(e.time * 1000).toISOString().split('T')[0];
              // expanded일 때는 idx가 실제 인덱스, 아닐 때는 0~9
              const actualIdx = expanded ? idx : idx;
              const cum = cumulativeData[actualIdx];
              return (
                <tr key={idx} className="border-b border-gray-50 dark:border-gray-700/30">
                  <td className="py-1.5 text-gray-600 dark:text-gray-400 font-mono">{date}</td>
                  <td className={`py-1.5 text-right font-mono ${e.rpDelta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {e.rpDelta >= 0 ? '+' : ''}{e.rpDelta.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">
                    {(e.rate * 100).toFixed(0)}%
                  </td>
                  <td className="py-1.5 text-right font-mono font-semibold text-gray-900 dark:text-white">
                    {e.newCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {e.surplus > 0 ? (
                      <span className="text-green-600 dark:text-green-400">
                        +{e.surplus.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">-</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {e.injection > 0 ? (
                      <span className="text-red-600 dark:text-red-400">
                        -{e.injection.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">-</span>
                    )}
                  </td>
                  <td className={`py-1.5 text-right font-mono font-semibold ${cum.cumBalance >= 0 ? 'text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-900/10' : 'text-orange-700 dark:text-orange-300 bg-orange-50/50 dark:bg-orange-900/10'}`}>
                    {cum.cumBalance >= 0 ? '+' : ''}{cum.cumBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
