import { Trade } from '@/types/backtest';

export interface YearlyStats {
  year: number;
  label?: string;      // 표시 라벨 (월별: "2024-03", 연도별: "2020")
  startValue: number;
  endValue: number;
  return: number;      // 연 수익률 (%)
  mdd: number;         // 연간 MDD (%)
  trades: number;      // 연간 거래 횟수
}

/**
 * 연도별 통계를 계산합니다.
 */
export function calculateYearlyStats(
  equity: { time: number; value: number }[],
  trades: Trade[]
): YearlyStats[] {
  if (equity.length === 0) return [];

  // equity 데이터를 연도별로 그룹화
  const yearlyEquity = new Map<number, { time: number; value: number }[]>();

  equity.forEach((point) => {
    const date = new Date(point.time * 1000);
    const year = date.getFullYear();

    if (!yearlyEquity.has(year)) {
      yearlyEquity.set(year, []);
    }
    yearlyEquity.get(year)!.push(point);
  });

  // trades를 연도별로 그룹화
  const yearlyTrades = new Map<number, number>();

  trades.forEach((trade) => {
    const date = new Date(trade.time * 1000);
    const year = date.getFullYear();

    yearlyTrades.set(year, (yearlyTrades.get(year) || 0) + 1);
  });

  // 연도별 통계 계산
  const result: YearlyStats[] = [];
  const sortedYears = Array.from(yearlyEquity.keys()).sort((a, b) => a - b);

  sortedYears.forEach((year) => {
    const yearData = yearlyEquity.get(year)!;
    const startValue = yearData[0].value;
    const endValue = yearData[yearData.length - 1].value;

    // 연간 수익률 계산
    const yearReturn = ((endValue - startValue) / startValue) * 100;

    // 연간 MDD 계산
    let peak = yearData[0].value;
    let maxDrawdown = 0;

    yearData.forEach((point) => {
      if (point.value > peak) {
        peak = point.value;
      }
      const drawdown = ((peak - point.value) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });

    result.push({
      year,
      startValue,
      endValue,
      return: yearReturn,
      mdd: maxDrawdown,
      trades: yearlyTrades.get(year) || 0,
    });
  });

  return result;
}

/**
 * 전체 기간 합계 통계를 계산합니다.
 */
export function calculateTotalStats(
  equity: { time: number; value: number }[],
  trades: Trade[]
): YearlyStats | null {
  if (equity.length === 0) return null;

  const startValue = equity[0].value;
  const endValue = equity[equity.length - 1].value;
  const totalReturn = ((endValue - startValue) / startValue) * 100;

  // 전체 MDD 계산
  let peak = equity[0].value;
  let maxDrawdown = 0;

  equity.forEach((point) => {
    if (point.value > peak) {
      peak = point.value;
    }
    const drawdown = ((peak - point.value) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  });

  return {
    year: 0, // 0은 "합계" 행을 나타냄
    startValue,
    endValue,
    return: totalReturn,
    mdd: maxDrawdown,
    trades: trades.length,
  };
}

/**
 * 월별 통계를 계산합니다.
 */
export function calculateMonthlyStats(
  equity: { time: number; value: number }[],
  trades: Trade[]
): YearlyStats[] {
  if (equity.length === 0) return [];

  // equity 데이터를 월별로 그룹화 (YYYY-MM 키)
  const monthlyEquity = new Map<string, { time: number; value: number }[]>();

  equity.forEach((point) => {
    const date = new Date(point.time * 1000);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyEquity.has(key)) {
      monthlyEquity.set(key, []);
    }
    monthlyEquity.get(key)!.push(point);
  });

  // trades를 월별로 그룹화
  const monthlyTrades = new Map<string, number>();

  trades.forEach((trade) => {
    const date = new Date(trade.time * 1000);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyTrades.set(key, (monthlyTrades.get(key) || 0) + 1);
  });

  // 월별 통계 계산
  const result: YearlyStats[] = [];
  const sortedKeys = Array.from(monthlyEquity.keys()).sort();

  sortedKeys.forEach((key) => {
    const monthData = monthlyEquity.get(key)!;
    const startValue = monthData[0].value;
    const endValue = monthData[monthData.length - 1].value;
    const monthReturn = ((endValue - startValue) / startValue) * 100;

    let peak = monthData[0].value;
    let maxDrawdown = 0;
    monthData.forEach((point) => {
      if (point.value > peak) peak = point.value;
      const drawdown = ((peak - point.value) / peak) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });

    result.push({
      year: 0,
      label: key,
      startValue,
      endValue,
      return: monthReturn,
      mdd: maxDrawdown,
      trades: monthlyTrades.get(key) || 0,
    });
  });

  return result;
}

/**
 * 데이터 기간에 따라 연도별 또는 월별 통계를 자동 선택합니다.
 * 1년 초과: 연도별, 1년 이하: 월별
 */
export function calculateAutoStats(
  equity: { time: number; value: number }[],
  trades: Trade[]
): { stats: YearlyStats[]; granularity: 'yearly' | 'monthly' } {
  if (equity.length === 0) return { stats: [], granularity: 'yearly' };

  const firstTime = equity[0].time * 1000;
  const lastTime = equity[equity.length - 1].time * 1000;
  const diffDays = (lastTime - firstTime) / (1000 * 60 * 60 * 24);

  if (diffDays > 365) {
    return { stats: calculateYearlyStats(equity, trades), granularity: 'yearly' };
  } else {
    return { stats: calculateMonthlyStats(equity, trades), granularity: 'monthly' };
  }
}
