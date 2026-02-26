import { BacktestResult, Trade } from '@/types/backtest';

/**
 * 거래 내역을 CSV 문자열로 변환
 * @param trades 거래 내역
 * @param cash 현금 잔액 시계열 (옵션)
 * @param equity 자산 가치 시계열 (옵션)
 */
export function tradesToCSV(
  trades: Trade[],
  cash?: { time: number; value: number }[],
  equity?: { time: number; value: number }[]
): string {
  const headers = [
    'Date',
    'Type',
    'Tier',
    'Quantity',
    'Price',
    'AvgCost',
    'TierSlots',
    'CashAfter',
    'CashRatio(%)',
  ];

  // cash/equity 배열을 time 기준으로 빠르게 조회하기 위한 Map 생성
  const cashMap = new Map<number, number>();
  const equityMap = new Map<number, number>();

  if (cash) {
    cash.forEach((c) => cashMap.set(c.time, c.value));
  }
  if (equity) {
    equity.forEach((e) => equityMap.set(e.time, e.value));
  }

  const rows = trades.map((trade) => {
    const date = new Date(trade.time * 1000).toISOString().split('T')[0];

    // 거래 시점의 현금과 자산 가치 조회
    const cashValue = cashMap.get(trade.time);
    const equityValue = equityMap.get(trade.time);

    // 현금 비율 계산
    let cashAfter = '-';
    let cashRatio = '-';

    if (cashValue !== undefined) {
      cashAfter = cashValue.toFixed(2);
      if (equityValue !== undefined && equityValue > 0) {
        cashRatio = ((cashValue / equityValue) * 100).toFixed(2);
      }
    }

    return [
      date,
      trade.type === 'buy' ? 'BUY' : 'SELL',
      trade.tier || '-',
      trade.quantity,
      trade.price.toFixed(4),
      trade.costBasis?.toFixed(4) || '-',
      trade.tierSlots || '-',
      cashAfter,
      cashRatio,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * 성과 요약을 CSV 문자열로 변환
 */
export function metricsToCSV(
  result: BacktestResult,
  strategyName: string,
  ticker: string,
  startDate: string,
  endDate: string,
  initialCapital: number
): string {
  const { metrics, equity } = result;
  const finalValue = equity.length > 0 ? equity[equity.length - 1].value : initialCapital;

  const rows = [
    ['Strategy', strategyName],
    ['Ticker', ticker],
    ['Period', `${startDate} ~ ${endDate}`],
    ['Initial Capital', initialCapital.toFixed(2)],
    ['Final Value', finalValue.toFixed(2)],
    ['Total Return (%)', metrics.totalReturn.toFixed(2)],
    ['CAGR (%)', metrics.cagr.toFixed(2)],
    ['MDD (%)', metrics.mdd.toFixed(2)],
    ['Win Rate (%)', metrics.winRate.toFixed(2)],
    ['Sharpe Ratio', metrics.sharpeRatio.toFixed(2)],
    ['Total Trades', metrics.totalTrades.toString()],
  ];

  return rows.map((row) => row.join(',')).join('\n');
}

/**
 * 전체 백테스트 결과를 CSV로 변환 (거래 내역 + 성과 요약)
 */
export function backestResultToCSV(
  result: BacktestResult,
  strategyName: string,
  ticker: string,
  startDate: string,
  endDate: string,
  initialCapital: number
): string {
  const summary = metricsToCSV(result, strategyName, ticker, startDate, endDate, initialCapital);
  const trades = tradesToCSV(result.trades, result.cash, result.equity);

  return `=== Performance Summary ===\n${summary}\n\n=== Trade History ===\n${trades}`;
}

/**
 * CSV 파일 다운로드
 */
export function downloadCSV(content: string, filename: string): void {
  const safeFilename = filename.replace(/[^a-zA-Z0-9가-힣\-_.]/g, '_');
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 파일명 생성 (전략명_티커_날짜)
 */
export function generateFilename(strategyName: string, ticker: string): string {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const safeName = strategyName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
  return `${safeName}_${ticker}_${date}.csv`;
}
