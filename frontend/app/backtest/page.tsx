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

export default function BacktestPage() {
  // 모드 상태
  const [mode, setMode] = useState<BacktestMode>('basic');

  // 공통 설정 상태
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [initialCapitalStr, setInitialCapitalStr] = useState('10000');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateRange, setDateRange] = useState<{ min: string; max: string }>({ min: '', max: '' });
  const [applyFee, setApplyFee] = useState(true);

  // Backend hook for date range API
  const { isBackendAvailable, getDateRange } = useBackendBacktest();

  // 티커 목록 로드
  useEffect(() => {
    async function fetchTickers() {
      try {
        const res = await fetch('/api/tickers');
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
  }, []);

  // 티커 변경 시 날짜 범위 업데이트 (백엔드 API 사용)
  useEffect(() => {
    async function loadDateRange() {
      if (!selectedTicker || !isBackendAvailable) return;

      try {
        const range = await getDateRange(selectedTicker);
        setDateRange({ min: range.min, max: range.max });
        setStartDate(range.min);
        setEndDate(range.max);
      } catch (err) {
        console.error('Failed to load date range:', err);
      }
    }
    if (selectedTicker && isBackendAvailable) {
      loadDateRange();
    }
  }, [selectedTicker, isBackendAvailable, getDateRange]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">퀀트투자</h1>
          <ModeSelector mode={mode} onModeChange={setMode} />
        </div>

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
          />
        ) : (
          <CompareBacktest
            tickers={tickers}
            selectedTicker={selectedTicker}
            initialCapitalStr={initialCapitalStr}
            startDate={startDate}
            endDate={endDate}
            applyFee={applyFee}
          />
        )}
      </div>
    </div>
  );
}
