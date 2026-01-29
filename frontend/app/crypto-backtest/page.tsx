'use client';

import { useState, useEffect } from 'react';
import CryptoModeSelector, { CryptoBacktestMode } from '@/components/crypto-backtest/CryptoModeSelector';
import CryptoCommonSettings from '@/components/crypto-backtest/CryptoCommonSettings';
import CryptoBasicBacktest from '@/components/crypto-backtest/basic/CryptoBasicBacktest';
import CryptoCompareBacktest from '@/components/crypto-backtest/compare/CryptoCompareBacktest';
import CryptoPairsBacktest from '@/components/crypto-backtest/pairs/CryptoPairsBacktest';
import { useCryptoDateRange } from '@/lib/crypto/useCryptoDateRange';

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

// 임시 코인 데이터 (추후 API로 대체)
const MOCK_COINS: Coin[] = [
  { id: 'btc', name: 'Bitcoin', symbol: 'BTC' },
  { id: 'eth', name: 'Ethereum', symbol: 'ETH' },
  { id: 'sol', name: 'Solana', symbol: 'SOL' },
  { id: 'xrp', name: 'Ripple', symbol: 'XRP' },
];

// 임시 마켓 데이터 (추후 API로 대체)
const MOCK_MARKETS: Market[] = [
  { id: 'usdt', name: 'USDT', symbol: 'USDT' },
  { id: 'krw', name: 'KRW', symbol: '₩' },
  { id: 'usd', name: 'USD', symbol: '$' },
  { id: 'usdc', name: 'USDC', symbol: 'USDC' },
];

export default function CryptoBacktestPage() {
  // 모드 상태
  const [mode, setMode] = useState<CryptoBacktestMode>('basic');

  // 공통 설정 상태
  const [coins] = useState<Coin[]>(MOCK_COINS);
  const [selectedCoin, setSelectedCoin] = useState('btc');
  const [markets] = useState<Market[]>(MOCK_MARKETS);
  const [selectedMarket, setSelectedMarket] = useState('usdt');
  const [initialCapitalStr, setInitialCapitalStr] = useState('10000');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [applyFee, setApplyFee] = useState(true);

  // 날짜 범위 조회 훅
  const { dateRange, isLoading: isDateRangeLoading } = useCryptoDateRange(selectedCoin, selectedMarket);

  // 날짜 범위 변경 시 시작일/종료일 초기화
  useEffect(() => {
    if (dateRange) {
      setStartDate(dateRange.min);
      setEndDate(dateRange.max);
    }
  }, [dateRange]);

  // Pairs 모드는 공통 설정 불필요
  const showCommonSettings = mode !== 'pairs';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">암호화폐 백테스팅</h1>
          <CryptoModeSelector mode={mode} onModeChange={setMode} />
        </div>

        {/* 설명 */}
        <div className={`rounded-lg p-3 mb-4 border ${
          mode === 'pairs'
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
        }`}>
          <p className={`text-sm ${
            mode === 'pairs'
              ? 'text-red-800 dark:text-red-200'
              : 'text-blue-800 dark:text-blue-200'
          }`}>
            {mode === 'basic' && (
              <><strong>Basic 모드:</strong> 단일 전략을 선택하여 백테스트를 수행합니다.</>
            )}
            {mode === 'compare' && (
              <><strong>Compare 모드:</strong> 여러 전략을 동시에 비교, 분석합니다.</>
            )}
            {mode === 'pairs' && (
              <><strong>Pairs 모드 (Beta):</strong> 동일 코인의 마켓별 가격을 비교, 분석합니다. 현재 개발 중인 베타 버전입니다.</>
            )}
          </p>
        </div>

        {/* 공통 설정 (Pairs 모드 제외) */}
        {showCommonSettings && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
            <CryptoCommonSettings
              coins={coins}
              selectedCoin={selectedCoin}
              onCoinChange={setSelectedCoin}
              markets={markets}
              selectedMarket={selectedMarket}
              onMarketChange={setSelectedMarket}
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
            />
          </div>
        )}

        {/* 모드별 컨텐츠 */}
        {mode === 'basic' && (
          <CryptoBasicBacktest
            coins={coins}
            selectedCoin={selectedCoin}
            markets={markets}
            selectedMarket={selectedMarket}
            initialCapitalStr={initialCapitalStr}
            startDate={startDate}
            endDate={endDate}
            applyFee={applyFee}
          />
        )}
        {mode === 'compare' && (
          <CryptoCompareBacktest
            coins={coins}
            selectedCoin={selectedCoin}
            markets={markets}
            selectedMarket={selectedMarket}
            initialCapitalStr={initialCapitalStr}
            startDate={startDate}
            endDate={endDate}
            applyFee={applyFee}
          />
        )}
        {mode === 'pairs' && (
          <CryptoPairsBacktest
            coins={coins}
            markets={markets}
            dateRange={dateRange ?? { min: '', max: '' }}
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
        )}
      </div>
    </div>
  );
}
