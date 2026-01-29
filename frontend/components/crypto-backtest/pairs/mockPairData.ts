/**
 * Pairs 모드용 Mock 데이터 생성기
 * 각 마켓별로 약간 다른 변동 패턴을 적용하여 선반영/후반영 분석 가능
 *
 * 실제 데이터 경로 구조:
 * data/crypto/{coin}/day/{market}/~.csv
 * 예: data/crypto/btc/day/usdt/1d_BINANCE_20260122.csv
 *     data/crypto/btc/day/krw/~.csv
 *
 * TODO: 실제 API 연동 시 이 Mock 데이터를 백엔드 API 호출로 대체
 */

export interface PairPricePoint {
  time: number; // Unix timestamp
  price: number;
  changePercent: number; // 시작일 대비 변화율
}

export interface PairData {
  pairId: string;
  coinSymbol: string;
  marketName: string;
  color: string;
  data: PairPricePoint[];
  startPrice: number;
  endPrice: number;
  totalChange: number; // 총 변화율 (%)
}

interface MockOptions {
  startDate: string;
  endDate: string;
}

// 마켓별 기준 가격 (실제 스케일 시뮬레이션)
const MARKET_BASE_PRICES: Record<string, Record<string, number>> = {
  BTC: {
    USDT: 60000,
    KRW: 80000000,
    USD: 60000,
    USDC: 60000,
  },
  ETH: {
    USDT: 3500,
    KRW: 4700000,
    USD: 3500,
    USDC: 3500,
  },
  SOL: {
    USDT: 150,
    KRW: 200000,
    USD: 150,
    USDC: 150,
  },
};

// 마켓별 프리미엄/변동성 특성
const MARKET_CHARACTERISTICS: Record<string, { premiumBias: number; volatilityMult: number; lagDays: number }> = {
  USDT: { premiumBias: 0, volatilityMult: 1.0, lagDays: 0 },
  KRW: { premiumBias: 0.03, volatilityMult: 1.1, lagDays: 1 }, // 3% 프리미엄, 1일 후행
  USD: { premiumBias: -0.001, volatilityMult: 0.95, lagDays: 0 },
  USDC: { premiumBias: 0.001, volatilityMult: 1.0, lagDays: 0 },
};

/**
 * 날짜 범위에 대한 일별 타임스탬프 배열 생성
 */
function generateDateRange(startDate: string, endDate: string): number[] {
  const timestamps: number[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  const current = new Date(start);
  while (current <= end) {
    timestamps.push(Math.floor(current.getTime() / 1000));
    current.setDate(current.getDate() + 1);
  }

  return timestamps;
}

/**
 * 기본 가격 움직임 생성 (모든 마켓의 기반)
 */
function generateBaseMovements(length: number, seed: number = 42): number[] {
  const movements: number[] = [];
  let randomState = seed;

  // 간단한 난수 생성기
  const random = () => {
    randomState = (randomState * 1103515245 + 12345) & 0x7fffffff;
    return randomState / 0x7fffffff;
  };

  // 트렌드와 노이즈를 결합한 움직임 생성
  let trend = 0;
  for (let i = 0; i < length; i++) {
    // 트렌드 변경 (가끔)
    if (random() < 0.1) {
      trend = (random() - 0.5) * 0.02;
    }

    // 일일 변동 (-3% ~ +3%)
    const noise = (random() - 0.5) * 0.06;
    const movement = trend + noise;

    movements.push(movement);
  }

  return movements;
}

/**
 * 단일 페어의 가격 데이터 생성
 */
export function generatePairData(
  pairId: string,
  coinSymbol: string,
  marketName: string,
  color: string,
  options: MockOptions
): PairData {
  const timestamps = generateDateRange(options.startDate, options.endDate);
  const baseMovements = generateBaseMovements(timestamps.length, pairId.charCodeAt(0) * 1000);

  // 마켓 특성 가져오기
  const characteristics = MARKET_CHARACTERISTICS[marketName] || MARKET_CHARACTERISTICS.USDT;
  const basePrice = MARKET_BASE_PRICES[coinSymbol]?.[marketName] || 1000;

  const data: PairPricePoint[] = [];
  let cumulativeReturn = 0;

  for (let i = 0; i < timestamps.length; i++) {
    // 후행 효과 적용 (lagDays만큼 이전 움직임 참조)
    const lagIndex = Math.max(0, i - characteristics.lagDays);
    const movement = baseMovements[lagIndex] * characteristics.volatilityMult;

    cumulativeReturn += movement;

    // 프리미엄 바이어스 추가 (시간에 따라 변동)
    const premiumNoise = Math.sin(i * 0.1) * 0.01;
    const effectivePremium = characteristics.premiumBias + premiumNoise;

    const changePercent = (cumulativeReturn + effectivePremium) * 100;
    const price = basePrice * (1 + cumulativeReturn + effectivePremium);

    data.push({
      time: timestamps[i],
      price,
      changePercent,
    });
  }

  const startPrice = data[0]?.price || basePrice;
  const endPrice = data[data.length - 1]?.price || basePrice;
  const totalChange = data[data.length - 1]?.changePercent || 0;

  return {
    pairId,
    coinSymbol,
    marketName,
    color,
    data,
    startPrice,
    endPrice,
    totalChange,
  };
}

/**
 * 프리미엄 데이터 계산 (기준 페어 대비)
 */
export interface PremiumPoint {
  time: number;
  premium: number; // %
}

export interface PremiumData {
  pairId: string;
  label: string;
  color: string;
  data: PremiumPoint[];
  avgPremium: number;
  currentPremium: number;
}

/**
 * ROC (Rate of Change) 관련 타입
 */
export interface RocPoint {
  time: number;
  roc: number; // N일 변화율 (%)
}

export interface RocData {
  pairId: string;
  label: string;
  color: string;
  data: RocPoint[];
}

export interface SpreadPoint {
  time: number;
  spread: number; // base ROC - compare ROC (%)
}

export interface SpreadData {
  basePairLabel: string;
  comparePairLabel: string;
  color: string;
  data: SpreadPoint[];
  avgSpread: number;
  currentSpread: number;
}

/**
 * 기준 페어 대비 다른 페어들의 프리미엄 계산
 */
export function calculatePremiumData(
  basePair: PairData,
  targetPairs: PairData[]
): PremiumData[] {
  return targetPairs.map((target) => {
    const premiumPoints: PremiumPoint[] = [];
    let sumPremium = 0;

    target.data.forEach((point, index) => {
      const basePoint = basePair.data[index];
      if (!basePoint) return;

      // 프리미엄 = (타겟 변화율 - 기준 변화율)
      const premium = point.changePercent - basePoint.changePercent;
      premiumPoints.push({
        time: point.time,
        premium,
      });
      sumPremium += premium;
    });

    const avgPremium = premiumPoints.length > 0 ? sumPremium / premiumPoints.length : 0;
    const currentPremium = premiumPoints[premiumPoints.length - 1]?.premium || 0;

    return {
      pairId: target.pairId,
      label: `${target.coinSymbol}/${target.marketName}`,
      color: target.color,
      data: premiumPoints,
      avgPremium,
      currentPremium,
    };
  });
}
