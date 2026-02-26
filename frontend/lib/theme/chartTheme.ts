/**
 * 차트 공통 테마 정의
 * Lightweight Charts 및 D3.js 차트에서 사용
 */

export interface ChartTheme {
  background: string;
  text: string;
  grid: string;
  equity: {
    positive: string;
    negative: string;
    positiveFill1: string;
    positiveFill2: string;
    negativeFill1: string;
    negativeFill2: string;
  };
  drawdown: {
    line: string;
    fill: string;
    fillBottom: string;
    histogram: string;
  };
  cash: {
    line: string;
    fill: string;
    fillBottom: string;
  };
  candle: {
    up: string;
    down: string;
    wickUp: string;
    wickDown: string;
  };
  markers: {
    buy: string;
    sell: string;
    mddPeak: string;
    mddTrough: string;
  };
  price: {
    line: string;
  };
  zeroLine: string;
}

export const lightTheme: ChartTheme = {
  background: '#ffffff',
  text: '#333333',
  grid: '#f0f0f0',
  equity: {
    positive: '#22c55e',
    negative: '#ef4444',
    positiveFill1: 'rgba(34, 197, 94, 0.28)',
    positiveFill2: 'rgba(34, 197, 94, 0.05)',
    negativeFill1: 'rgba(239, 68, 68, 0.05)',
    negativeFill2: 'rgba(239, 68, 68, 0.28)',
  },
  drawdown: {
    line: '#ef5350',
    fill: 'rgba(239, 83, 80, 0.4)',
    fillBottom: 'rgba(239, 83, 80, 0.0)',
    histogram: '#ef4444',
  },
  cash: {
    line: '#f59e0b',
    fill: 'rgba(245, 158, 11, 0.4)',
    fillBottom: 'rgba(245, 158, 11, 0.0)',
  },
  candle: {
    up: '#26a69a',
    down: '#ef5350',
    wickUp: '#26a69a',
    wickDown: '#ef5350',
  },
  markers: {
    buy: '#26a69a',
    sell: '#ef5350',
    mddPeak: '#f97316',
    mddTrough: '#dc2626',
  },
  price: {
    line: '#6366f1',
  },
  zeroLine: '#666666',
};

export const darkTheme: ChartTheme = {
  background: '#1f2937',
  text: '#9ca3af',
  grid: '#374151',
  equity: {
    positive: '#22c55e',
    negative: '#ef4444',
    positiveFill1: 'rgba(34, 197, 94, 0.28)',
    positiveFill2: 'rgba(34, 197, 94, 0.05)',
    negativeFill1: 'rgba(239, 68, 68, 0.05)',
    negativeFill2: 'rgba(239, 68, 68, 0.28)',
  },
  drawdown: {
    line: '#f87171',
    fill: 'rgba(248, 113, 113, 0.4)',
    fillBottom: 'rgba(248, 113, 113, 0.0)',
    histogram: '#f87171',
  },
  cash: {
    line: '#fbbf24',
    fill: 'rgba(251, 191, 36, 0.4)',
    fillBottom: 'rgba(251, 191, 36, 0.0)',
  },
  candle: {
    up: '#4ade80',
    down: '#f87171',
    wickUp: '#4ade80',
    wickDown: '#f87171',
  },
  markers: {
    buy: '#4ade80',
    sell: '#f87171',
    mddPeak: '#fb923c',
    mddTrough: '#f87171',
  },
  price: {
    line: '#818cf8',
  },
  zeroLine: '#9ca3af',
};

/**
 * 현재 테마에 맞는 차트 테마 반환
 */
export function getChartTheme(isDark: boolean): ChartTheme {
  return isDark ? darkTheme : lightTheme;
}

/**
 * document.documentElement의 class로 다크모드 여부 확인
 */
export function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

/**
 * Compare 모드용 전략별 색상 팔레트
 */
export const STRATEGY_COLORS = [
  '#22c55e', // 녹색
  '#3b82f6', // 파랑
  '#f59e0b', // 주황
  '#ef4444', // 빨강
] as const;

/**
 * 인덱스에 해당하는 전략 색상 반환
 */
export function getStrategyColor(index: number): string {
  return STRATEGY_COLORS[index % STRATEGY_COLORS.length];
}

/**
 * 스위칭 슬롯별 구간 배경색 (차트용, 반투명)
 */
export const SLOT_ZONE_COLORS: Record<string, { line: string; top: string; bottom: string }> = {
  A: { line: '#22c55e', top: 'rgba(34, 197, 94, 0.08)', bottom: 'rgba(34, 197, 94, 0.02)' },
  B: { line: '#3b82f6', top: 'rgba(59, 130, 246, 0.08)', bottom: 'rgba(59, 130, 246, 0.02)' },
  C: { line: '#f97316', top: 'rgba(249, 115, 22, 0.08)', bottom: 'rgba(249, 115, 22, 0.02)' },
  D: { line: '#a855f7', top: 'rgba(168, 85, 247, 0.08)', bottom: 'rgba(168, 85, 247, 0.02)' },
};
