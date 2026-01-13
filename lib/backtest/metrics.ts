import { Trade, PerformanceMetrics } from '@/types/backtest';

/**
 * 백테스트 성과 지표 계산
 */
export function calculateMetrics(
  trades: Trade[],
  equity: { time: number; value: number }[],
  initialCapital: number
): PerformanceMetrics {
  if (equity.length === 0) {
    return {
      totalReturn: 0,
      cagr: 0,
      mdd: 0,
      winRate: 0,
      sharpeRatio: 0,
      totalTrades: 0,
    };
  }

  const finalValue = equity[equity.length - 1].value;
  const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100;

  // 거래 쌍 분석 (매수-매도)
  const tradePairs = getTradePairs(trades);
  const winRate = calculateWinRate(tradePairs);

  // MDD 계산
  const mdd = calculateMDD(equity);

  // CAGR 계산
  const cagr = calculateCAGR(equity, initialCapital);

  // 샤프 비율 계산
  const sharpeRatio = calculateSharpeRatio(equity);

  return {
    totalReturn: roundTo(totalReturn, 2),
    cagr: roundTo(cagr, 2),
    mdd: roundTo(mdd, 2),
    winRate: roundTo(winRate, 2),
    sharpeRatio: roundTo(sharpeRatio, 2),
    totalTrades: tradePairs.length,
  };
}

/**
 * 거래 쌍 추출 (매수-매도)
 */
function getTradePairs(trades: Trade[]): { buy: Trade; sell: Trade }[] {
  const pairs: { buy: Trade; sell: Trade }[] = [];

  for (let i = 0; i < trades.length - 1; i += 2) {
    if (trades[i].type === 'buy' && trades[i + 1]?.type === 'sell') {
      pairs.push({ buy: trades[i], sell: trades[i + 1] });
    }
  }

  return pairs;
}

/**
 * 승률 계산
 */
function calculateWinRate(tradePairs: { buy: Trade; sell: Trade }[]): number {
  if (tradePairs.length === 0) return 0;

  const winningTrades = tradePairs.filter(
    (pair) => pair.sell.price > pair.buy.price
  );

  return (winningTrades.length / tradePairs.length) * 100;
}

/**
 * MDD (Maximum Drawdown) 계산
 */
function calculateMDD(equity: { time: number; value: number }[]): number {
  let maxValue = equity[0].value;
  let maxDrawdown = 0;

  for (const point of equity) {
    if (point.value > maxValue) {
      maxValue = point.value;
    }

    const drawdown = ((maxValue - point.value) / maxValue) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

/**
 * CAGR (연평균 성장률) 계산
 */
function calculateCAGR(
  equity: { time: number; value: number }[],
  initialCapital: number
): number {
  if (equity.length < 2) return 0;

  const startTime = equity[0].time;
  const endTime = equity[equity.length - 1].time;
  const finalValue = equity[equity.length - 1].value;

  // 연 단위로 변환 (타임스탬프는 초 단위)
  const years = (endTime - startTime) / (365.25 * 24 * 60 * 60);

  if (years <= 0) return 0;

  const cagr =
    (Math.pow(finalValue / initialCapital, 1 / years) - 1) * 100;

  return cagr;
}

/**
 * 샤프 비율 계산 (간소화 버전)
 * 일일 수익률의 평균 / 표준편차 * sqrt(252)
 */
function calculateSharpeRatio(equity: { time: number; value: number }[]): number {
  if (equity.length < 2) return 0;

  // 일일 수익률 계산
  const dailyReturns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const returnRate =
      (equity[i].value - equity[i - 1].value) / equity[i - 1].value;
    dailyReturns.push(returnRate);
  }

  if (dailyReturns.length === 0) return 0;

  // 평균 수익률
  const meanReturn =
    dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;

  // 표준편차
  const variance =
    dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) /
    dailyReturns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  // 샤프 비율 (무위험 수익률은 0으로 가정)
  const sharpeRatio = (meanReturn / stdDev) * Math.sqrt(252);

  return sharpeRatio;
}

/**
 * 소수점 반올림
 */
function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * 일별 수익률 계산
 */
export function calculateDailyReturns(
  equity: { time: number; value: number }[]
): { time: number; return: number }[] {
  const returns: { time: number; return: number }[] = [];

  for (let i = 1; i < equity.length; i++) {
    const returnRate =
      ((equity[i].value - equity[i - 1].value) / equity[i - 1].value) * 100;

    returns.push({
      time: equity[i].time,
      return: returnRate,
    });
  }

  return returns;
}
