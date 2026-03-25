'use client';

interface Metrics {
  totalReturn: number;
  cagr: number;
  mdd: number;
  winRate: number;
  sharpeRatio: number;
  totalTrades: number;
}

interface Props {
  compound: Metrics;
  baseline: Metrics;
}

function formatValue(value: number, suffix: string = '%'): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}${suffix}`;
}

function getDiffColor(compound: number, baseline: number, inverse: boolean = false): string {
  const diff = compound - baseline;
  const better = inverse ? diff < 0 : diff > 0;
  if (Math.abs(diff) < 0.01) return 'text-gray-500 dark:text-gray-400';
  return better
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';
}

export default function MetricsComparison({ compound, baseline }: Props) {
  const rows = [
    { label: '총 수익률', cVal: compound.totalReturn, bVal: baseline.totalReturn, suffix: '%', inverse: false },
    { label: 'CAGR', cVal: compound.cagr, bVal: baseline.cagr, suffix: '%', inverse: false },
    { label: 'MDD', cVal: compound.mdd, bVal: baseline.mdd, suffix: '%', inverse: true },
    { label: '승률', cVal: compound.winRate, bVal: baseline.winRate, suffix: '%', inverse: false },
    { label: 'Sharpe', cVal: compound.sharpeRatio, bVal: baseline.sharpeRatio, suffix: '', inverse: false },
    { label: '거래 수', cVal: compound.totalTrades, bVal: baseline.totalTrades, suffix: '', inverse: false },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">성과 비교</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-2 font-medium">지표</th>
            <th className="text-right py-2 font-medium">기본</th>
            <th className="text-right py-2 font-medium">비대칭 복리</th>
            <th className="text-right py-2 font-medium">차이</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const diff = row.cVal - row.bVal;
            const isCount = row.label === '거래 수';
            return (
              <tr key={row.label} className="border-b border-gray-100 dark:border-gray-700/50">
                <td className="py-2 text-gray-600 dark:text-gray-400">{row.label}</td>
                <td className="py-2 text-right text-gray-700 dark:text-gray-300 font-mono">
                  {isCount ? row.bVal : `${row.bVal.toFixed(2)}${row.suffix}`}
                </td>
                <td className="py-2 text-right font-mono font-semibold text-gray-900 dark:text-white">
                  {isCount ? row.cVal : `${row.cVal.toFixed(2)}${row.suffix}`}
                </td>
                <td className={`py-2 text-right font-mono ${getDiffColor(row.cVal, row.bVal, row.inverse)}`}>
                  {isCount
                    ? (diff > 0 ? `+${diff}` : `${diff}`)
                    : formatValue(diff, row.suffix)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
