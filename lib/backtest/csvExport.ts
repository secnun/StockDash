import { BacktestResult, Trade } from '@/types/backtest';

/**
 * 거래 내역을 CSV 문자열로 변환
 */
export function tradesToCSV(trades: Trade[], strategyName: string): string {
  const headers = [
    'Date',
    'Type',
    'Tier',
    'Quantity',
    'Price',
    'AvgCost',
    'TierSlots',
  ];

  const rows = trades.map((trade) => {
    const date = new Date(trade.time * 1000).toISOString().split('T')[0];

    return [
      date,
      trade.type === 'buy' ? 'BUY' : 'SELL',
      trade.tier || '-',
      trade.quantity,
      trade.price.toFixed(4),
      trade.costBasis?.toFixed(4) || '-',
      trade.tierSlots || '-',
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
  const trades = tradesToCSV(result.trades, strategyName);

  return `=== Performance Summary ===\n${summary}\n\n=== Trade History ===\n${trades}`;
}

/**
 * CSV 파일 다운로드
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
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
