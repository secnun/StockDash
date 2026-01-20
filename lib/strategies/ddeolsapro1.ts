import { Strategy, OHLCV, BacktestResult, Trade, ParameterValue } from '@/types/backtest';
import { calculateMetrics } from '@/lib/backtest/metrics';

/**
 * 티어별 포지션 정보
 */
interface TierPosition {
  tier: number; // 1~7
  buyPrice: number; // 매수가 (익절 조건 판단용)
  buyDayIndex: number; // 매수일 인덱스 (거래일 기준)
  quantity: number; // 보유 수량 (정수)
  buyValue: number; // 매수 금액 (수수료 포함)
}

/**
 * 매도 주문 실행 컨텍스트
 */
interface SellContext {
  tierPositions: (TierPosition | null)[];
  candle: OHLCV;
  applyFee: boolean;
  feeRate: number;
  avgCost: number;
  totalQty: number;
  cash: number;
  trades: Trade[];
}

/**
 * 매수 주문 실행 컨텍스트
 */
interface BuyContext {
  tierPositions: (TierPosition | null)[];
  candle: OHLCV;
  dayIndex: number;
  applyFee: boolean;
  feeRate: number;
  avgCost: number;
  totalQty: number;
  cash: number;
  cycleSeed: number;
  splitRatios: number[];
  trades: Trade[];
}

// ========== 헬퍼 함수 ==========

/**
 * 손절 대상 티어 확인
 */
function findStopLossTiers(
  tierPositions: (TierPosition | null)[],
  currentDayIndex: number,
  stopLossDays: number
): number[] {
  const stopLossTiers: number[] = [];
  for (let t = 0; t < tierPositions.length; t++) {
    const pos = tierPositions[t];
    if (!pos) continue;
    const holdingDays = currentDayIndex - pos.buyDayIndex + 1;
    if (holdingDays >= stopLossDays) {
      stopLossTiers.push(t);
    }
  }
  return stopLossTiers;
}

/**
 * 익절 대상 티어 확인 (손절과 동시 충족 시 익절 우선)
 */
function findProfitTiers(
  tierPositions: (TierPosition | null)[],
  stopLossTiers: number[],
  closePrice: number,
  targetProfit: number
): { profitTiers: number[]; updatedStopLossTiers: number[] } {
  const profitTiers: number[] = [];
  const updatedStopLossTiers = [...stopLossTiers];

  for (let t = 0; t < tierPositions.length; t++) {
    const pos = tierPositions[t];
    if (!pos) continue;

    const targetPrice = pos.buyPrice * (1 + targetProfit / 100);
    if (closePrice >= targetPrice) {
      // 손절과 익절 동시 충족 시 익절 우선
      const stopLossIndex = updatedStopLossTiers.indexOf(t);
      if (stopLossIndex !== -1) {
        updatedStopLossTiers.splice(stopLossIndex, 1);
      }
      profitTiers.push(t);
    }
  }

  return { profitTiers, updatedStopLossTiers };
}

/**
 * 현재 보유 티어 상태 문자열 생성
 */
function getTierSlotsString(tierPositions: (TierPosition | null)[]): string {
  const slots = tierPositions
    .map((p, i) => (p ? i + 1 : null))
    .filter((t) => t !== null);
  return slots.length > 0 ? slots.join(',') : '-';
}

/**
 * 매도 주문 실행 (손절 또는 익절)
 */
function executeSellOrder(
  tierIndex: number,
  ctx: SellContext
): { cash: number; avgCost: number; totalQty: number } {
  const pos = ctx.tierPositions[tierIndex]!;
  const sellQty = pos.quantity;
  const tierNumber = tierIndex + 1;

  let sellValue = sellQty * ctx.candle.close;
  if (ctx.applyFee) {
    sellValue = sellValue * (1 - ctx.feeRate);
  }

  const costBasisAtSell = ctx.avgCost;
  const newCash = ctx.cash + sellValue;

  // 티어 슬롯 해제 전 상태 기록
  ctx.tierPositions[tierIndex] = null;
  const tierSlotsAfterSell = getTierSlotsString(ctx.tierPositions);

  // 이동평균 업데이트
  let newTotalQty = ctx.totalQty - sellQty;
  let newAvgCost = ctx.avgCost;
  if (newTotalQty <= 0) {
    newTotalQty = 0;
    newAvgCost = 0;
  }

  ctx.trades.push({
    time: ctx.candle.time,
    type: 'sell',
    price: ctx.candle.close,
    quantity: sellQty,
    value: sellValue,
    costBasis: costBasisAtSell,
    tier: tierNumber,
    tierSlots: tierSlotsAfterSell,
  });

  return { cash: newCash, avgCost: newAvgCost, totalQty: newTotalQty };
}

/**
 * 매수 주문 실행
 */
function executeBuyOrder(
  emptyTierIndex: number,
  ctx: BuyContext
): { cash: number; avgCost: number; totalQty: number } | null {
  // 매수 금액 계산
  let buyBudget = 0;

  if (emptyTierIndex < 6) {
    buyBudget = ctx.cycleSeed * ctx.splitRatios[emptyTierIndex];
  } else {
    // 7티어(예비): 1~6티어 모두 채워진 경우만
    const allMainTiersFilled = ctx.tierPositions
      .slice(0, 6)
      .every((p) => p !== null);
    if (allMainTiersFilled) {
      buyBudget = ctx.cash;
    }
  }

  buyBudget = Math.min(buyBudget, ctx.cash);
  if (buyBudget <= 0) return null;

  let netBuyAmount = buyBudget;
  if (ctx.applyFee) {
    netBuyAmount = buyBudget * (1 - ctx.feeRate);
  }

  const quantity = Math.floor(netBuyAmount / ctx.candle.close);
  if (quantity < 1) return null;

  const actualBuyValue = quantity * ctx.candle.close;
  let totalCost = actualBuyValue;
  if (ctx.applyFee) {
    totalCost = actualBuyValue * (1 + ctx.feeRate);
  }

  const tierNumber = emptyTierIndex + 1;
  const newCash = ctx.cash - totalCost;

  // 이동평균 업데이트
  const newTotalCost = ctx.avgCost * ctx.totalQty + ctx.candle.close * quantity;
  const newTotalQty = ctx.totalQty + quantity;
  const newAvgCost = newTotalQty > 0 ? newTotalCost / newTotalQty : 0;

  ctx.tierPositions[emptyTierIndex] = {
    tier: tierNumber,
    buyPrice: ctx.candle.close,
    buyDayIndex: ctx.dayIndex,
    quantity: quantity,
    buyValue: totalCost,
  };

  const tierSlotsAfterBuy = getTierSlotsString(ctx.tierPositions);

  ctx.trades.push({
    time: ctx.candle.time,
    type: 'buy',
    price: ctx.candle.close,
    quantity: quantity,
    value: totalCost,
    costBasis: newAvgCost,
    tier: tierNumber,
    tierSlots: tierSlotsAfterBuy,
  });

  return { cash: newCash, avgCost: newAvgCost, totalQty: newTotalQty };
}

/**
 * 빈 티어 슬롯 중 가장 낮은 번호 찾기
 */
function findEmptyTierSlot(tierPositions: (TierPosition | null)[]): number {
  for (let t = 0; t < tierPositions.length; t++) {
    if (tierPositions[t] === null) {
      return t;
    }
  }
  return -1;
}

/**
 * 떨사오팔 PRO1 전략
 *
 * 핵심 로직:
 * - 전일 종가 대비 설정% 이상 하락시 티어별 분할 매수 (LOC)
 * - 티어별 매수가 기준 목표 수익률 도달시 개별 매도 (LOC)
 * - 티어별 매수일 기준 N거래일 경과시 개별 손절 (MOC)
 * - 이동평균 방식: 손익 계산 시 평균 매수가 기준
 * - 소수점 처리: 매수 수량 정수 내림
 * - 우선순위: 손절 > 익절 > 매수 (같은 티어 손절+익절 동시면 익절 우선)
 */
export const ddeolsapro1Strategy: Strategy = {
  id: 'ddeolsapro1',
  name: '떨사오팔 PRO1',
  description:
    '이동평균 방식 적용, 티어별 분할 매수/매도, 소수점 내림 처리',
  parameters: [
    {
      key: 'dropPercent',
      label: '매수 트리거 하락률 (%)',
      type: 'number',
      default: 0.01,
      min: 0.01,
      max: 20,
      step: 0.01,
    },
    {
      key: 'targetProfit',
      label: '목표 수익률 (%)',
      type: 'number',
      default: 0.01,
      min: 0.01,
      max: 50,
      step: 0.01,
    },
    {
      key: 'stopLossDays',
      label: '손절 기간 (거래일)',
      type: 'number',
      default: 10,
      min: 1,
      max: 100,
    },
  ],

  execute: (data: OHLCV[], params: Record<string, ParameterValue>): BacktestResult => {
    const initialCapital = (params.initialCapital as number) || 10000;
    const dropPercent = (params.dropPercent as number) ?? 0.01;
    const targetProfit = (params.targetProfit as number) ?? 0.01;
    const stopLossDays = (params.stopLossDays as number) ?? 10;
    const applyFee = (params.applyFee as boolean) ?? true;
    const feeRate = 0.001; // 0.1% 수수료

    // 분할 비율 (6등분: 5%, 10%, 15%, 20%, 25%, 25%)
    const splitRatios = [0.05, 0.1, 0.15, 0.2, 0.25, 0.25];
    const MAX_TIERS = 7; // 1~6티어 + 7티어(예비)

    let cash = initialCapital;
    let cycleSeed = initialCapital;
    let avgCost = 0;
    let totalQty = 0;

    const tierPositions: (TierPosition | null)[] = Array(MAX_TIERS).fill(null);
    const trades: Trade[] = [];
    const equity: { time: number; value: number }[] = [];

    for (let i = 0; i < data.length; i++) {
      const candle = data[i];
      const prevCandle = i > 0 ? data[i - 1] : null;

      // 1. 손절/익절 대상 확인
      let stopLossTiers = findStopLossTiers(tierPositions, i, stopLossDays);
      const { profitTiers, updatedStopLossTiers } = findProfitTiers(
        tierPositions,
        stopLossTiers,
        candle.close,
        targetProfit
      );
      stopLossTiers = updatedStopLossTiers;

      // 2. 매도 컨텍스트 생성
      const sellCtx: SellContext = {
        tierPositions,
        candle,
        applyFee,
        feeRate,
        avgCost,
        totalQty,
        cash,
        trades,
      };

      // 3. 손절 매도 실행 (1순위)
      for (const t of stopLossTiers) {
        const result = executeSellOrder(t, sellCtx);
        cash = result.cash;
        avgCost = result.avgCost;
        totalQty = result.totalQty;
        sellCtx.cash = cash;
        sellCtx.avgCost = avgCost;
        sellCtx.totalQty = totalQty;
      }

      // 4. 익절 매도 실행 (2순위)
      for (const t of profitTiers) {
        const result = executeSellOrder(t, sellCtx);
        cash = result.cash;
        avgCost = result.avgCost;
        totalQty = result.totalQty;
        sellCtx.cash = cash;
        sellCtx.avgCost = avgCost;
        sellCtx.totalQty = totalQty;
      }

      // 5. 사이클 종료 체크
      const hasAnyPosition = tierPositions.some((p) => p !== null);
      if (!hasAnyPosition && trades.length > 0) {
        cycleSeed = cash;
        avgCost = 0;
        totalQty = 0;
      }

      // 6. 매수 실행 (3순위)
      if (prevCandle) {
        const dropFromPrevClose =
          ((prevCandle.close - candle.close) / prevCandle.close) * 100;

        if (dropFromPrevClose >= dropPercent) {
          const emptyTierIndex = findEmptyTierSlot(tierPositions);

          if (emptyTierIndex !== -1) {
            const buyCtx: BuyContext = {
              tierPositions,
              candle,
              dayIndex: i,
              applyFee,
              feeRate,
              avgCost,
              totalQty,
              cash,
              cycleSeed,
              splitRatios,
              trades,
            };

            const result = executeBuyOrder(emptyTierIndex, buyCtx);
            if (result) {
              cash = result.cash;
              avgCost = result.avgCost;
              totalQty = result.totalQty;
            }
          }
        }
      }

      // 7. Equity 기록
      const portfolioValue = cash + totalQty * candle.close;
      equity.push({ time: candle.time, value: portfolioValue });
    }

    // 8. 백테스트 종료 시 잔여 포지션 청산
    if (data.length > 0) {
      const lastCandle = data[data.length - 1];
      const sellCtx: SellContext = {
        tierPositions,
        candle: lastCandle,
        applyFee,
        feeRate,
        avgCost,
        totalQty,
        cash,
        trades,
      };

      for (let t = 0; t < MAX_TIERS; t++) {
        if (tierPositions[t]) {
          const result = executeSellOrder(t, sellCtx);
          cash = result.cash;
          avgCost = result.avgCost;
          totalQty = result.totalQty;
          sellCtx.cash = cash;
          sellCtx.avgCost = avgCost;
          sellCtx.totalQty = totalQty;
        }
      }
    }

    const metrics = calculateMetrics(trades, equity, initialCapital);
    return { trades, equity, metrics };
  },
};
