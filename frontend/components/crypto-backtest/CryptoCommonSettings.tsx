'use client';

interface Coin {
  id: string;
  name: string;
  symbol: string;
}

interface Market {
  id: string;
  name: string;
  symbol: string;
}

interface CryptoCommonSettingsProps {
  coins: Coin[];
  selectedCoin: string;
  onCoinChange: (coinId: string) => void;
  markets: Market[];
  selectedMarket: string;
  onMarketChange: (marketId: string) => void;
  initialCapitalStr: string;
  onInitialCapitalChange: (value: string) => void;
  startDate: string;
  endDate: string;
  dateRange: { min: string; max: string };
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  applyFee: boolean;
  onApplyFeeChange: (apply: boolean) => void;
  isDateRangeLoading?: boolean;
}

export default function CryptoCommonSettings({
  coins,
  selectedCoin,
  onCoinChange,
  markets,
  selectedMarket,
  onMarketChange,
  initialCapitalStr,
  onInitialCapitalChange,
  startDate,
  endDate,
  dateRange,
  onStartDateChange,
  onEndDateChange,
  applyFee,
  onApplyFeeChange,
  isDateRangeLoading = false,
}: CryptoCommonSettingsProps) {
  const selectedMarketObj = markets.find(m => m.id === selectedMarket);
  const currencySymbol = selectedMarketObj?.symbol || '$';

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
      {/* 코인 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">코인</label>
        <select
          value={selectedCoin}
          onChange={(e) => onCoinChange(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          {coins.map((coin) => (
            <option key={coin.id} value={coin.id}>{coin.name} ({coin.symbol})</option>
          ))}
        </select>
      </div>

      {/* 마켓 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">마켓</label>
        <select
          value={selectedMarket}
          onChange={(e) => onMarketChange(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          {markets.map((market) => (
            <option key={market.id} value={market.id}>{market.name}</option>
          ))}
        </select>
      </div>

      {/* 초기 자산 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">초기 자산 ({currencySymbol})</label>
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
