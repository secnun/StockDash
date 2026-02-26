'use client';

import { useState, useEffect } from 'react';
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

const MOCK_COINS: Coin[] = [
  { id: 'btc', name: 'Bitcoin', symbol: 'BTC' },
  { id: 'eth', name: 'Ethereum', symbol: 'ETH' },
  { id: 'sol', name: 'Solana', symbol: 'SOL' },
  { id: 'xrp', name: 'Ripple', symbol: 'XRP' },
];

const MOCK_MARKETS: Market[] = [
  { id: 'usdt', name: 'USDT', symbol: 'USDT' },
  { id: 'krw', name: 'KRW', symbol: '₩' },
  { id: 'usd', name: 'USD', symbol: '$' },
  { id: 'usdc', name: 'USDC', symbol: 'USDC' },
];

export default function CryptoPairsPage() {
  const [coins] = useState<Coin[]>(MOCK_COINS);
  const [markets] = useState<Market[]>(MOCK_MARKETS);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { dateRange } = useCryptoDateRange('btc', 'usdt');

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">암호화폐 페어</h1>
        </div>

        <div className="rounded-lg p-3 mb-4 border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <p className="text-sm text-red-800 dark:text-red-200">
            <strong>Pairs (Beta):</strong> 동일 코인의 마켓별 가격을 비교, 분석합니다. 현재 개발 중인 베타 버전입니다.
          </p>
        </div>

        <CryptoPairsBacktest
          coins={coins}
          markets={markets}
          dateRange={dateRange ?? { min: '', max: '' }}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
      </div>
    </div>
  );
}
