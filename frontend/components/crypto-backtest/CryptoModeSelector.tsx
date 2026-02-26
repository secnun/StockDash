'use client';

export type CryptoBacktestMode = 'basic' | 'compare';

interface CryptoModeSelectorProps {
  mode: CryptoBacktestMode;
  onModeChange: (mode: CryptoBacktestMode) => void;
}

export default function CryptoModeSelector({ mode, onModeChange }: CryptoModeSelectorProps) {
  return (
    <div className={`flex gap-1 rounded-lg p-1 transition-colors ${
      mode === 'basic'
        ? 'bg-blue-100 dark:bg-blue-900/30'
        : 'bg-green-100 dark:bg-green-900/30'
    }`}>
      <button
        onClick={() => onModeChange('basic')}
        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
          mode === 'basic'
            ? 'bg-blue-500 dark:bg-blue-600 text-white shadow-sm'
            : 'text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-white'
        }`}
      >
        Basic
      </button>
      <button
        onClick={() => onModeChange('compare')}
        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
          mode === 'compare'
            ? 'bg-green-500 dark:bg-green-600 text-white shadow-sm'
            : 'text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-white'
        }`}
      >
        Compare
      </button>
    </div>
  );
}
