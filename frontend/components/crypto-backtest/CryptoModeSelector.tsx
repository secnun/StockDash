'use client';

export type CryptoBacktestMode = 'basic' | 'compare' | 'pairs';

interface CryptoModeSelectorProps {
  mode: CryptoBacktestMode;
  onModeChange: (mode: CryptoBacktestMode) => void;
}

export default function CryptoModeSelector({ mode, onModeChange }: CryptoModeSelectorProps) {
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
      <button
        onClick={() => onModeChange('pairs')}
        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
          mode === 'pairs'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        Pairs
      </button>
    </div>
  );
}
