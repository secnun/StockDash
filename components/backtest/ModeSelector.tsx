'use client';

export type BacktestMode = 'basic' | 'compare';

interface ModeSelectorProps {
  mode: BacktestMode;
  onModeChange: (mode: BacktestMode) => void;
}

export default function ModeSelector({ mode, onModeChange }: ModeSelectorProps) {
  return (
    <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
      <button
        onClick={() => onModeChange('basic')}
        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
          mode === 'basic'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        Basic
      </button>
      <button
        onClick={() => onModeChange('compare')}
        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
          mode === 'compare'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        Compare
      </button>
    </div>
  );
}
