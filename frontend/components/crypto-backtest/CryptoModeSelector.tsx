'use client';

export type CryptoBacktestMode = 'basic' | 'compare';

// Re-export the shared ModeSelector — works with any string union type
export { default } from '@/components/backtest/ModeSelector';
