'use client';

import CommonSettings from '@/components/backtest/CommonSettings';

interface Coin {
  id: string;
  name: string;
  symbol: string;
}

interface Exchange {
  id: string;
  name: string;
  currency: string;
  currencySymbol: string;
}

interface CryptoCommonSettingsProps {
  coins: Coin[];
  selectedCoin: string;
  onCoinChange: (coinId: string) => void;
  exchanges: Exchange[];
  selectedExchange: string;
  onExchangeChange: (exchangeId: string) => void;
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
  timeframe?: string;
  onTimeframeChange?: (tf: string) => void;
}

const TIMEFRAMES = [
  { id: '1h', label: '1시간' },
  { id: '4h', label: '4시간' },
  { id: '1d', label: '일봉' },
];

const EXCHANGE_FEE_LABELS: Record<string, string> = {
  binance: '0.1%',
  upbit: '0.05%',
};

export default function CryptoCommonSettings({
  coins,
  selectedCoin,
  onCoinChange,
  exchanges,
  selectedExchange,
  onExchangeChange,
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
  timeframe = '4h',
  onTimeframeChange,
}: CryptoCommonSettingsProps) {
  const selectedExchangeObj = exchanges.find(e => e.id === selectedExchange);
  const currencySymbol = selectedExchangeObj?.currencySymbol || '$';
  const feeLabel = EXCHANGE_FEE_LABELS[selectedExchange] || '0.1%';

  const cryptoFields = (
    <>
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

      {/* 거래소 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">거래소</label>
        <select
          value={selectedExchange}
          onChange={(e) => onExchangeChange(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          {exchanges.map((exchange) => (
            <option key={exchange.id} value={exchange.id}>{exchange.name} ({exchange.currency})</option>
          ))}
        </select>
      </div>

      {/* 타임프레임 */}
      {onTimeframeChange && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">타임프레임</label>
          <select
            value={timeframe}
            onChange={(e) => onTimeframeChange(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf.id} value={tf.id}>{tf.label}</option>
            ))}
          </select>
        </div>
      )}
    </>
  );

  const tickerAsCoin = [{ id: selectedCoin, name: coins.find(c => c.id === selectedCoin)?.name || selectedCoin, file: '' }];

  return (
    <CommonSettings
      tickers={tickerAsCoin}
      selectedTicker={selectedCoin}
      onTickerChange={onCoinChange}
      initialCapitalStr={initialCapitalStr}
      onInitialCapitalChange={onInitialCapitalChange}
      startDate={startDate}
      endDate={endDate}
      dateRange={dateRange}
      onStartDateChange={onStartDateChange}
      onEndDateChange={onEndDateChange}
      applyFee={applyFee}
      onApplyFeeChange={onApplyFeeChange}
      prepend={cryptoFields}
      hideTicker
      gridCols={onTimeframeChange ? "grid-cols-2 md:grid-cols-7" : "grid-cols-2 md:grid-cols-6"}
      currencySymbol={currencySymbol}
      feeLabel={feeLabel}
      isDateRangeLoading={isDateRangeLoading}
    />
  );
}
