'use client';

import { useState, useEffect } from 'react';
import CryptoModeSelector, { CryptoBacktestMode } from '@/components/crypto-backtest/CryptoModeSelector';
import CryptoCommonSettings from '@/components/crypto-backtest/CryptoCommonSettings';
import CryptoBasicBacktest from '@/components/crypto-backtest/basic/CryptoBasicBacktest';
import CryptoCompareBacktest from '@/components/crypto-backtest/compare/CryptoCompareBacktest';
import { useCryptoDateRange } from '@/lib/crypto/useCryptoDateRange';

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

const COINS: Coin[] = [
  { id: 'btc', name: 'Bitcoin', symbol: 'BTC' },
  { id: 'eth', name: 'Ethereum', symbol: 'ETH' },
  { id: 'xrp', name: 'Ripple', symbol: 'XRP' },
  { id: 'sol', name: 'Solana', symbol: 'SOL' },
  { id: 'doge', name: 'Dogecoin', symbol: 'DOGE' },
];

const EXCHANGES: Exchange[] = [
  { id: 'binance', name: 'Binance', currency: 'USDT', currencySymbol: '$' },
  { id: 'upbit', name: 'Upbit', currency: 'KRW', currencySymbol: '₩' },
];

export default function CryptoBacktestPage() {
  const [mode, setMode] = useState<CryptoBacktestMode>('basic');

  const [selectedCoin, setSelectedCoin] = useState('btc');
  const [selectedExchange, setSelectedExchange] = useState('binance');
  const [initialCapitalStr, setInitialCapitalStr] = useState('10000');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [applyFee, setApplyFee] = useState(true);
  const [timeframe, setTimeframe] = useState('4h');

  // 거래소 변경 시 초기자본 기본값 변경
  useEffect(() => {
    setInitialCapitalStr(selectedExchange === 'upbit' ? '10000000' : '10000');
  }, [selectedExchange]);

  // 날짜 범위 조회 (거래소를 market으로 전달)
  const { dateRange, isLoading: isDateRangeLoading } = useCryptoDateRange(selectedCoin, selectedExchange, timeframe);

  useEffect(() => {
    if (dateRange) {
      setStartDate(dateRange.min);
      setEndDate(dateRange.max);
    }
  }, [dateRange]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">암호화폐 백테스팅</h1>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <CryptoModeSelector mode={mode} onModeChange={setMode} />
          <div className={`flex-1 rounded-lg p-3 border ${mode === 'basic' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
            <p className={`text-sm ${mode === 'basic' ? 'text-blue-800 dark:text-blue-200' : 'text-green-800 dark:text-green-200'}`}>
              {mode === 'basic' && (
                <><strong>Basic 모드:</strong> 단일 전략을 선택하여 백테스트를 수행합니다.</>
              )}
              {mode === 'compare' && (
                <><strong>Compare 모드:</strong> 여러 전략을 동시에 비교, 분석합니다.</>
              )}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
          <CryptoCommonSettings
            coins={COINS}
            selectedCoin={selectedCoin}
            onCoinChange={setSelectedCoin}
            exchanges={EXCHANGES}
            selectedExchange={selectedExchange}
            onExchangeChange={setSelectedExchange}
            initialCapitalStr={initialCapitalStr}
            onInitialCapitalChange={setInitialCapitalStr}
            startDate={startDate}
            endDate={endDate}
            dateRange={dateRange ?? { min: '', max: '' }}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            applyFee={applyFee}
            onApplyFeeChange={setApplyFee}
            isDateRangeLoading={isDateRangeLoading}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
          />
        </div>

        {mode === 'basic' && (
          <CryptoBasicBacktest
            coins={COINS}
            selectedCoin={selectedCoin}
            exchanges={EXCHANGES}
            selectedExchange={selectedExchange}
            initialCapitalStr={initialCapitalStr}
            startDate={startDate}
            endDate={endDate}
            applyFee={applyFee}
            timeframe={timeframe}
          />
        )}
        {mode === 'compare' && (
          <CryptoCompareBacktest
            coins={COINS}
            selectedCoin={selectedCoin}
            exchanges={EXCHANGES}
            selectedExchange={selectedExchange}
            initialCapitalStr={initialCapitalStr}
            startDate={startDate}
            endDate={endDate}
            applyFee={applyFee}
            timeframe={timeframe}
          />
        )}
      </div>
    </div>
  );
}
