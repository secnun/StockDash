'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCryptoDateRange } from '@/lib/api/client';

export interface CryptoDateRange {
  min: string;
  max: string;
}

export interface UseCryptoDateRangeReturn {
  dateRange: CryptoDateRange | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * 암호화폐 데이터의 날짜 범위를 조회하는 훅
 * @param coin - 코인 ID (예: 'btc')
 * @param market - 마켓 ID (예: 'usdt')
 */
export function useCryptoDateRange(coin: string, market: string): UseCryptoDateRangeReturn {
  const [dateRange, setDateRange] = useState<CryptoDateRange | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 캐시: coin/market 조합별 결과 저장
  const cacheRef = useRef<Record<string, CryptoDateRange>>({});

  const fetchDateRange = useCallback(async () => {
    if (!coin || !market) {
      setDateRange(null);
      return;
    }

    const cacheKey = `${coin.toLowerCase()}-${market.toLowerCase()}`;

    // 캐시 확인
    if (cacheRef.current[cacheKey]) {
      setDateRange(cacheRef.current[cacheKey]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchCryptoDateRange(coin, market);

      // 캐시에 저장
      cacheRef.current[cacheKey] = data;
      setDateRange(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '날짜 범위 조회 실패';
      setError(errorMessage);
      setDateRange(null);
    } finally {
      setIsLoading(false);
    }
  }, [coin, market]);

  // coin/market 변경 시 자동 조회
  useEffect(() => {
    void fetchDateRange();
  }, [fetchDateRange]);

  const refetch = useCallback(() => {
    // 캐시 무효화 후 재조회
    const cacheKey = `${coin.toLowerCase()}-${market.toLowerCase()}`;
    delete cacheRef.current[cacheKey];
    void fetchDateRange();
  }, [coin, market, fetchDateRange]);

  return {
    dateRange,
    isLoading,
    error,
    refetch,
  };
}

export default useCryptoDateRange;
