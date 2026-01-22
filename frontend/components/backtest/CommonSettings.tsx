'use client';

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
}: CommonSettingsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
      {/* 티커 */}
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

      {/* 초기 자산 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">초기 자산 ($)</label>
        <input
          type="text"
          inputMode="numeric"
          value={initialCapitalStr}
          onChange={(e) => {
            const value = e.target.value.replace(/[^0-9]/g, '');
            onInitialCapitalChange(value);
          }}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      {/* 시작일 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">시작일</label>
        <input
          type="date"
          value={startDate}
          min={dateRange.min}
          max={dateRange.max}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      {/* 종료일 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">종료일</label>
        <input
          type="date"
          value={endDate}
          min={dateRange.min}
          max={dateRange.max}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      {/* 수수료 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">수수료 (0.1%)</label>
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
