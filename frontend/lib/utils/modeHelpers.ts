import type { ExecutionMode } from '@/lib/backtest/useBackendBacktest';

export function getModeLabel(mode: ExecutionMode): string {
  switch (mode) {
    case 'backend': return 'Online';
    case 'checking': return '...';
    case 'unavailable': return 'Offline';
  }
}

export function getModeStyle(mode: ExecutionMode): string {
  switch (mode) {
    case 'backend':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'checking':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'unavailable':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  }
}
