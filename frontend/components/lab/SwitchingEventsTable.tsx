'use client';

import { SwitchingEvent, StrategySlot, SLOT_COLORS, SlotId } from '@/types/switching';

interface SwitchingEventsTableProps {
  events: SwitchingEvent[];
  slots: StrategySlot[];
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export default function SwitchingEventsTable({ events, slots }: SwitchingEventsTableProps) {
  const slotMap: Record<string, string> = {};
  slots.forEach((s) => { slotMap[s.slotId] = s.name; });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 px-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">날짜</th>
            <th className="py-2 px-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">전환</th>
            <th className="py-2 px-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">사유</th>
            <th className="py-2 px-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">포트폴리오</th>
            <th className="py-2 px-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">보유 티어</th>
          </tr>
        </thead>
        <tbody>
          {events.map((evt, i) => {
            const fromColors = SLOT_COLORS[evt.fromSlotId as SlotId] || SLOT_COLORS.A;
            const toColors = SLOT_COLORS[evt.toSlotId as SlotId] || SLOT_COLORS.A;
            const isRevert = evt.eventType === 'revert';
            return (
              <tr
                key={i}
                className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                  isRevert ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''
                }`}
              >
                <td className="py-1.5 px-2 text-gray-600 dark:text-gray-400">
                  {formatDate(evt.time)}
                </td>
                <td className="py-1.5 px-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${fromColors.badge}`}>
                    {evt.fromSlotId}
                  </span>
                  <span className="mx-1 text-gray-400">{isRevert ? '←' : '→'}</span>
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${toColors.badge}`}>
                    {evt.toSlotId}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-gray-700 dark:text-gray-300">
                  {isRevert ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      조건 해소 → 기본전략 복귀
                    </span>
                  ) : (
                    evt.triggerName
                  )}
                </td>
                <td className="py-1.5 px-2 text-right text-gray-600 dark:text-gray-300">
                  ${evt.portfolioValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </td>
                <td className="py-1.5 px-2 text-right text-gray-600 dark:text-gray-300">
                  {evt.openTiers}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
