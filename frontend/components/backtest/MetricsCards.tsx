'use client';

interface MetricCard {
  label: string;
  value: string;
  unit: string;
  color: string;
}

interface MetricsCardsProps {
  cards: MetricCard[];
}

export default function MetricsCards({ cards }: MetricsCardsProps) {
  return (
    <div className="grid grid-cols-5 gap-2 flex-1">
      {cards.map((metric) => (
        <div key={metric.label} className="bg-white dark:bg-gray-800 rounded-lg shadow p-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">{metric.label}</div>
          <div className={`text-lg font-bold ${metric.color}`}>
            {metric.value}<span className="text-xs font-normal ml-0.5">{metric.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function buildMetricCards(metrics: {
  totalReturn: number;
  cagr: number;
  mdd: number;
  winRate: number;
  totalTrades: number;
} | null): MetricCard[] {
  return [
    { label: '총 수익률', value: metrics?.totalReturn.toFixed(2) || '-', unit: '%', color: metrics && metrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600' },
    { label: 'CAGR', value: metrics?.cagr.toFixed(2) || '-', unit: '%', color: metrics && metrics.cagr >= 0 ? 'text-green-600' : 'text-red-600' },
    { label: 'MDD', value: metrics?.mdd.toFixed(2) || '-', unit: '%', color: 'text-red-600' },
    { label: '승률', value: metrics?.winRate.toFixed(1) || '-', unit: '%', color: 'text-gray-600 dark:text-gray-300' },
    { label: '거래', value: metrics?.totalTrades.toString() || '-', unit: '회', color: 'text-gray-600 dark:text-gray-300' },
  ];
}
