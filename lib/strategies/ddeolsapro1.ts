import { Strategy, OHLCV, BacktestResult, Trade } from '@/types/backtest';
import { calculateMetrics } from '@/lib/backtest/metrics';

/**
 * 티어별 포지션 정보
 */
interface TierPosition {
  tier: number; // 1~7
  buyPrice: number; // 매수가
  buyDayIndex: number; // 매수일 인덱스 (거래일 기준)
  quantity: number; // 보유 수량
  buyValue: number; // 매수 금액
}

/**
 * 떨사오팔 Pro1 전략
 *
 * 핵심 로직:
 * - 전일 종가 대비 0.01% 이상 하락시 티어별 분할 매수 (LOC)
 * - 티어별 매수가 기준 0.01% 수익률 도달시 개별 매도 (LOC)
 * - 티어별 매수일 기준 10거래일 경과시 개별 손절 (MOC)
 * - 빈 티어 슬롯 중 낮은 번호 순으로 재진입
 * - 7티어(예비티어): 잔여 시드 전액 사용
 * - 수수료 0.1% 적용, 시드 복리 계산
 */
export const ddeolsapro1Strategy: Strategy = {
  id: 'ddeolsapro1',
  name: '떨사오팔 Pro1',
  description:
    '티어별 분할 매수/매도, 목표 수익률 도달시 개별 매도, 티어별 10거래일 손절',
  parameters: [
    {
      key: 'splitCount',
      label: '시드 분할 횟수',
      type: 'number',
      default: 6,
      min: 1,
      max: 10,
    },
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

  execute: (data: OHLCV[], params: Record<string, any>): BacktestResult => {
    const initialCapital = params.initialCapital || 10000;
    const dropPercent = params.dropPercent ?? 0.01;
    const targetProfit = params.targetProfit ?? 0.01;
    const stopLossDays = params.stopLossDays ?? 10;
    const applyFee = params.applyFee ?? true;
    const feeRate = 0.001; // 0.1% 수수료

    // 분할 비율 (6등분: 5%, 10%, 15%, 20%, 25%, 25%)
    const splitRatios = [0.05, 0.1, 0.15, 0.2, 0.25, 0.25];
    const MAX_TIERS = 7; // 1~6티어 + 7티어(예비)

    let cash = initialCapital;
    let cycleBaseCash = initialCapital; // 사이클 기준 시드 (복리 적용)

    // 티어별 포지션 관리 (null이면 빈 슬롯)
    const tierPositions: (TierPosition | null)[] = Array(MAX_TIERS).fill(null);

    const trades: Trade[] = [];
    const equity: { time: number; value: number }[] = [];

    for (let i = 0; i < data.length; i++) {
      const candle = data[i];
      const prevCandle = i > 0 ? data[i - 1] : null;
      const soldTiersToday: number[] = []; // 오늘 매도된 티어 (목표수익률 매도)

      // ========== 1. 매도 조건 체크 (목표 수익률 도달) ==========
      for (let t = 0; t < MAX_TIERS; t++) {
        const pos = tierPositions[t];
        if (!pos) continue;

        const targetPrice = pos.buyPrice * (1 + targetProfit / 100);

        if (candle.close >= targetPrice) {
          // 목표 수익률 도달 - LOC 매도
          let sellValue = pos.quantity * candle.close;
          if (applyFee) {
            sellValue = sellValue * (1 - feeRate);
          }

          cash += sellValue;

          trades.push({
            time: candle.time,
            type: 'sell',
            price: candle.close,
            quantity: pos.quantity,
            value: sellValue,
          });

          tierPositions[t] = null;
          soldTiersToday.push(t);
        }
      }

      // ========== 2. 매도 조건 체크 (손절 - 10거래일 경과) ==========
      for (let t = 0; t < MAX_TIERS; t++) {
        const pos = tierPositions[t];
        if (!pos) continue;

        // 거래일 기준 경과일 계산 (매수일 = 1일차)
        const holdingDays = i - pos.buyDayIndex + 1;

        if (holdingDays >= stopLossDays) {
          // 손절 - MOC 매도
          let sellValue = pos.quantity * candle.close;
          if (applyFee) {
            sellValue = sellValue * (1 - feeRate);
          }

          cash += sellValue;

          trades.push({
            time: candle.time,
            type: 'sell',
            price: candle.close,
            quantity: pos.quantity,
            value: sellValue,
          });

          tierPositions[t] = null;
          // 손절 매도는 당일 매수 가능 (soldTiersToday에 추가하지 않음)
        }
      }

      // ========== 3. 사이클 종료 체크 (모든 티어 정리) ==========
      const hasAnyPosition = tierPositions.some((p) => p !== null);
      if (!hasAnyPosition && trades.length > 0) {
        // 사이클 종료 - 복리 적용 (현재 현금을 새 기준 시드로)
        cycleBaseCash = cash;
      }

      // ========== 4. 매수 조건 체크 ==========
      // 목표수익률 매도 당일에는 매수 불가 (손절 매도 당일은 매수 가능)
      if (soldTiersToday.length === 0 && prevCandle) {
        // 전일 종가 대비 하락률 계산
        const dropFromPrevClose =
          ((prevCandle.close - candle.close) / prevCandle.close) * 100;

        // 매수 조건: 당일 종가 <= 전일 종가 * (1 - dropPercent/100)
        if (dropFromPrevClose >= dropPercent) {
          // 빈 티어 슬롯 중 가장 낮은 번호 찾기
          let emptyTierIndex = -1;
          for (let t = 0; t < MAX_TIERS; t++) {
            if (tierPositions[t] === null) {
              emptyTierIndex = t;
              break;
            }
          }

          if (emptyTierIndex !== -1) {
            // 매수 금액 계산
            let buyAmount = 0;

            if (emptyTierIndex < 6) {
              // 1~6티어: 사이클 기준 시드의 비율만큼
              buyAmount = cycleBaseCash * splitRatios[emptyTierIndex];
            } else {
              // 7티어(예비): 잔여 시드 전액
              buyAmount = cash;
            }

            // 실제 사용 가능한 금액으로 제한
            buyAmount = Math.min(buyAmount, cash);

            if (buyAmount > 0) {
              // 수수료 적용 후 실제 매수 가능 금액
              let actualBuyAmount = buyAmount;
              if (applyFee) {
                actualBuyAmount = buyAmount * (1 - feeRate);
              }

              const quantity = actualBuyAmount / candle.close;

              if (quantity > 0) {
                cash -= buyAmount;

                tierPositions[emptyTierIndex] = {
                  tier: emptyTierIndex + 1,
                  buyPrice: candle.close,
                  buyDayIndex: i,
                  quantity: quantity,
                  buyValue: buyAmount,
                };

                trades.push({
                  time: candle.time,
                  type: 'buy',
                  price: candle.close,
                  quantity: quantity,
                  value: buyAmount,
                });
              }
            }
          }
        }
      }

      // ========== 5. Equity 기록 ==========
      const totalPosition = tierPositions.reduce(
        (sum, p) => sum + (p ? p.quantity : 0),
        0
      );
      const portfolioValue = cash + totalPosition * candle.close;
      equity.push({
        time: candle.time,
        value: portfolioValue,
      });
    }

    // ========== 6. 백테스트 종료 시 잔여 포지션 청산 ==========
    if (data.length > 0) {
      const lastCandle = data[data.length - 1];

      for (let t = 0; t < MAX_TIERS; t++) {
        const pos = tierPositions[t];
        if (!pos) continue;

        let sellValue = pos.quantity * lastCandle.close;
        if (applyFee) {
          sellValue = sellValue * (1 - feeRate);
        }

        cash += sellValue;

        trades.push({
          time: lastCandle.time,
          type: 'sell',
          price: lastCandle.close,
          quantity: pos.quantity,
          value: sellValue,
        });

        tierPositions[t] = null;
      }
    }

    // 성과 지표 계산
    const metrics = calculateMetrics(trades, equity, initialCapital);

    return {
      trades,
      equity,
      metrics,
    };
  },
};
