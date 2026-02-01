import { Trade } from '@/types/backtest';

export interface YearlyStats {
  year: number;
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
