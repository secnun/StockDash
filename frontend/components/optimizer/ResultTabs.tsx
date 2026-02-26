'use client';

export type ResultTabMode = 'current' | 'cumulative';

interface ResultTabsProps {
  mode: ResultTabMode;
  onModeChange: (mode: ResultTabMode) => void;
  currentCount: number;
  cumulativeCount: number;
}

export default function ResultTabs({
  mode,
  onModeChange,
  currentCount,
  cumulativeCount,
}: ResultTabsProps) {
  return (
    <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
      <button
        onClick={() => onModeChange('current')}
        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
          mode === 'current'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        현재 결과
        {currentCount > 0 && (
          <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
            {currentCount}
          </span>
        )}
      </button>
      <button
        onClick={() => onModeChange('cumulative')}
        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
          mode === 'cumulative'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        누적 순위
        {cumulativeCount > 0 && (
          <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300">
            {cumulativeCount}
          </span>
        )}
      </button>
    </div>
  );
}
