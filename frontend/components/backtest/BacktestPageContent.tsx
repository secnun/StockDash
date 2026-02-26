'use client';

import { useState, useEffect } from 'react';
import ModeSelector, { BacktestMode } from '@/components/backtest/ModeSelector';
import CommonSettings from '@/components/backtest/CommonSettings';
import BasicBacktest from '@/components/backtest/basic/BasicBacktest';
import CompareBacktest from '@/components/backtest/compare/CompareBacktest';
import { useBackendBacktest } from '@/lib/backtest/useBackendBacktest';

interface Ticker {
  id: string;
  name: string;
  file: string;
}

interface BacktestPageContentProps {
  market: 'us' | 'kr';
  title: string;
}

export default function BacktestPageContent({ market, title }: BacktestPageContentProps) {
  // 모드 상태
  const [mode, setMode] = useState<BacktestMode>('basic');

  // 공통 설정 상태
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [initialCapitalStr, setInitialCapitalStr] = useState(market === 'kr' ? '10000000' : '10000');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateRange, setDateRange] = useState<{ min: string; max: string }>({ min: '', max: '' });
  const [applyFee, setApplyFee] = useState(true);
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);

  // Backend hook for date range API
  const { isBackendAvailable, getDateRange } = useBackendBacktest();

  // 티커 목록 로드
  useEffect(() => {
    async function fetchTickers() {
      try {
        const res = await fetch(`/api/tickers?market=${market}`);
        const data = await res.json();
        setTickers(data.tickers);
        if (data.tickers.length > 0) {
          setSelectedTicker(data.tickers[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch tickers:', err);
      }
    }
    fetchTickers();
  }, [market]);

  // 티커 변경 시 날짜 범위 업데이트 (백엔드 API 사용)
  useEffect(() => {
    async function loadDateRange() {
      if (!selectedTicker || !isBackendAvailable) return;

      setDateRangeError(null);
      try {
        const range = await getDateRange(selectedTicker, market);
        setDateRange({ min: range.min, max: range.max });
        setStartDate(range.min);
        setEndDate(range.max);
      } catch (err) {
        console.error('Failed to load date range:', err);
        setDateRangeError('날짜 범위를 불러올 수 없습니다. 서버 연결을 확인해주세요.');
      }
    }
    if (selectedTicker && isBackendAvailable) {
      loadDateRange();
    }
  }, [selectedTicker, isBackendAvailable, getDateRange, market]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* 헤더 */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
        </div>

        {/* 모드 탭 + 설명 */}
        <div className="flex items-center gap-3 mb-4">
          <ModeSelector mode={mode} onModeChange={setMode} />
          <div className={`flex-1 rounded-lg p-3 border ${mode === 'basic' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
            <p className={`text-sm ${mode === 'basic' ? 'text-blue-800 dark:text-blue-200' : 'text-green-800 dark:text-green-200'}`}>
              {mode === 'basic' ? (
                <><strong>Basic 모드:</strong> 단일 전략을 선택하여 백테스트를 수행합니다.</>
              ) : (
                <><strong>Compare 모드:</strong> 여러 전략을 동시에 비교, 분석합니다.</>
              )}
            </p>
          </div>
        </div>

        {/* 날짜 범위 에러 */}
        {dateRangeError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
            <p className="text-red-800 dark:text-red-200 text-sm">{dateRangeError}</p>
          </div>
        )}

        {/* 공통 설정 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
          <CommonSettings
            tickers={tickers}
            selectedTicker={selectedTicker}
            onTickerChange={setSelectedTicker}
            initialCapitalStr={initialCapitalStr}
            onInitialCapitalChange={setInitialCapitalStr}
            startDate={startDate}
            endDate={endDate}
            dateRange={dateRange}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            applyFee={applyFee}
            onApplyFeeChange={setApplyFee}
            market={market}
          />
        </div>

        {/* 모드별 컨텐츠 */}
        {mode === 'basic' ? (
          <BasicBacktest
            tickers={tickers}
            selectedTicker={selectedTicker}
            initialCapitalStr={initialCapitalStr}
            startDate={startDate}
            endDate={endDate}
            applyFee={applyFee}
            market={market}
          />
        ) : (
          <CompareBacktest
            tickers={tickers}
            selectedTicker={selectedTicker}
            initialCapitalStr={initialCapitalStr}
            startDate={startDate}
            endDate={endDate}
            applyFee={applyFee}
            market={market}
          />
        )}
      </div>
    </div>
  );
}
