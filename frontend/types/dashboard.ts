export interface MonthlyBreakdown {
  month: string;
  totalReturn: number;
  mdd: number;
}

export interface HeatmapStrategyItem {
  strategyId: string;
  strategyName: string;
  representativeTicker: string;
  altTicker: string;
  ytdReturn: number;
  altYtdReturn: number;
  currentSeed: number;
  maxMdd: number;
  winRate: number;
  totalTrades: number;
  monthlyBreakdown: MonthlyBreakdown[];
}

export interface MarketIndicator {
  label: string;
  value: string;
  change?: number | null;
}

export interface HeatmapResponse {
  generatedAt: string;
  initialCapital: number;
  strategies: HeatmapStrategyItem[];
  marketIndicators: MarketIndicator[];
}
