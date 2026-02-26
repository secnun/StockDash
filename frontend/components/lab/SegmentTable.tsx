'use client';

import { SegmentResult, SLOT_COLORS, SlotId } from '@/types/switching';

interface SegmentTableProps {
  segments: SegmentResult[];
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  });
}

function getReturnColor(value: number): string {
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-600 dark:text-gray-300';
}

export default function SegmentTable({ segments }: SegmentTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 px-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
            <th className="py-2 px-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">전략</th>
            <th className="py-2 px-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">기간</th>
            <th className="py-2 px-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">수익률</th>
            <th className="py-2 px-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">MDD</th>
            <th className="py-2 px-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">거래수</th>
            <th className="py-2 px-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">캔들</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((seg, i) => {
            const slotId = seg.slotId as SlotId;
            const colors = SLOT_COLORS[slotId] || SLOT_COLORS.A;
            return (
              <tr
                key={i}
                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td className="py-1.5 px-2 text-gray-500 dark:text-gray-400">{i + 1}</td>
                <td className="py-1.5 px-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors.badge}`}>
                    {seg.slotId}
                  </span>
                  <span className="ml-1.5 text-gray-700 dark:text-gray-300">{seg.slotName}</span>
                </td>
                <td className="py-1.5 px-2 text-gray-600 dark:text-gray-400">
                  {formatDate(seg.startTime)} ~ {formatDate(seg.endTime)}
                </td>
                <td className={`py-1.5 px-2 text-right font-medium ${getReturnColor(seg.segmentReturn)}`}>
                  {seg.segmentReturn > 0 ? '+' : ''}{seg.segmentReturn.toFixed(2)}%
                </td>
                <td className="py-1.5 px-2 text-right text-red-600 dark:text-red-400">
                  -{seg.segmentMdd.toFixed(2)}%
                </td>
                <td className="py-1.5 px-2 text-right text-gray-600 dark:text-gray-300">
                  {seg.tradeCount}
                </td>
                <td className="py-1.5 px-2 text-right text-gray-600 dark:text-gray-300">
                  {seg.candleCount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
