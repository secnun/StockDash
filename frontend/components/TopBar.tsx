'use client';

import { useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { fetchDashboardHeatmap } from '@/lib/api/client';
import { MarketIndicator } from '@/types/dashboard';

interface TopBarProps {
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export default function TopBar({ sidebarOpen, onToggleSidebar }: TopBarProps) {
  const [indicators, setIndicators] = useState<MarketIndicator[]>([]);

  useEffect(() => {
    fetchDashboardHeatmap()
      .then((res) => setIndicators(res.marketIndicators ?? []))
      .catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-30 h-12 flex items-center justify-between px-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700/50">
      {/* Left side */}
      <div className="flex items-center gap-4">
        {!sidebarOpen && onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            aria-label="사이드바 열기"
            className="hidden md:flex p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        )}
        {/* Market Indicators */}
        {indicators.map((ind, i) => {
          const changeColor =
            ind.change != null
              ? ind.change >= 0
                ? 'text-green-500'
                : 'text-red-500'
              : '';
          const changeStr =
            ind.change != null
              ? `${ind.change >= 0 ? '+' : ''}${ind.change.toFixed(2)}%`
              : null;

          // 공포탐욕 지수 색상
          let fngColor = '';
          if (ind.label === '공포탐욕') {
            const score = parseInt(ind.value, 10);
            if (!isNaN(score)) {
              if (score <= 20) fngColor = 'text-red-600 dark:text-red-400';
              else if (score <= 40) fngColor = 'text-orange-500 dark:text-orange-400';
              else if (score <= 60) fngColor = 'text-yellow-500 dark:text-yellow-400';
              else if (score <= 80) fngColor = 'text-green-500 dark:text-green-400';
              else fngColor = 'text-emerald-500 dark:text-emerald-400';
            }
          }

          return (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-400 dark:text-gray-500">{ind.label}</span>
              <span className={`font-semibold ${fngColor || 'text-gray-700 dark:text-gray-200'}`}>{ind.value}</span>
              {changeStr && <span className={`font-medium ${changeColor}`}>{changeStr}</span>}
            </div>
          );
        })}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            />
          </svg>
          로그인
        </button>
      </div>
    </header>
  );
}
