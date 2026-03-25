'use client';

import { ReactNode } from 'react';

interface Ticker {
  id: string;
  name: string;
  file: string;
}

interface CommonSettingsProps {
  tickers: Ticker[];
  selectedTicker: string;
  onTickerChange: (tickerId: string) => void;
  initialCapitalStr: string;
  onInitialCapitalChange: (value: string) => void;
  startDate: string;
  endDate: string;
  dateRange: { min: string; max: string };
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  applyFee: boolean;
  onApplyFeeChange: (apply: boolean) => void;
  market?: 'us' | 'kr';
  /** Extra fields rendered before the ticker selector */
  prepend?: ReactNode;
  /** Grid columns override (default: 'grid-cols-2 md:grid-cols-5') */
  gridCols?: string;
  /** Currency symbol override */
  currencySymbol?: string;
  /** Fee label override */
  feeLabel?: string;
  /** Whether date inputs are loading */
  isDateRangeLoading?: boolean;
  /** Hide ticker selector (when prepend already handles asset selection) */
  hideTicker?: boolean;
}

export default function CommonSettings({
  tickers,
  selectedTicker,
  onTickerChange,
  initialCapitalStr,
  onInitialCapitalChange,
  startDate,
  endDate,
  dateRange,
  onStartDateChange,
  onEndDateChange,
  applyFee,
  onApplyFeeChange,
  market = 'us',
  prepend,
  gridCols = 'grid-cols-2 md:grid-cols-5',
  currencySymbol,
  feeLabel,
  isDateRangeLoading = false,
  hideTicker = false,
}: CommonSettingsProps) {
  const symbol = currencySymbol ?? (market === 'kr' ? '₩' : '$');
  const fee = feeLabel ?? (market === 'kr' ? '0.015%' : '0.25%');

  return (
    <div className={`grid ${gridCols} gap-3 items-end`}>
      {prepend}

      {/* 티커 */}
      {!hideTicker && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">티커</label>
          <select
            value={selectedTicker}
            onChange={(e) => onTickerChange(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {tickers.map((ticker) => (
              <option key={ticker.id} value={ticker.id}>{ticker.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* 초기 자산 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">초기 자산 ({symbol})</label>
        <input
          type="text"
          inputMode="numeric"
          value={initialCapitalStr ? Number(initialCapitalStr).toLocaleString() : ''}
          onChange={(e) => {
            const value = e.target.value.replace(/[^0-9]/g, '');
            onInitialCapitalChange(value);
          }}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      {/* 시작일 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          시작일
          {isDateRangeLoading && <span className="ml-1 text-blue-500 animate-pulse">...</span>}
        </label>
        <input
          type="date"
          value={startDate}
          min={dateRange.min}
          max={dateRange.max}
          onChange={(e) => onStartDateChange(e.target.value)}
          disabled={isDateRangeLoading}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
        />
      </div>

      {/* 종료일 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          종료일
          {isDateRangeLoading && <span className="ml-1 text-blue-500 animate-pulse">...</span>}
        </label>
        <input
          type="date"
          value={endDate}
          min={dateRange.min}
          max={dateRange.max}
          onChange={(e) => onEndDateChange(e.target.value)}
          disabled={isDateRangeLoading}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
        />
      </div>

      {/* 수수료 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">수수료 ({fee})</label>
        <select
          value={applyFee ? 'yes' : 'no'}
          onChange={(e) => onApplyFeeChange(e.target.value === 'yes')}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="yes">적용</option>
          <option value="no">미적용</option>
        </select>
      </div>
    </div>
  );
}
