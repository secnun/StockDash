import { Strategy, OHLCV, BacktestResult, Trade } from '@/types/backtest';
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
 * 떨사오팔 PRO 테스트 전략
 *
 * 핵심 로직:
 * - 전일 종가 대비 설정% 이상 하락시 티어별 분할 매수 (LOC)
 * - 티어별 매수가 기준 목표 수익률 도달시 개별 매도 (LOC)
 * - 티어별 매수일 기준 N거래일 경과시 개별 손절 (MOC)
 * - 이동평균 방식: 손익 계산 시 평균 매수가 기준
 * - 소수점 처리: 매수 수량 정수 내림
 * - 우선순위: 손절 > 익절 > 매수 (같은 티어 손절+익절 동시면 익절 우선)
 */
export const ddeolsapro1TestStrategy: Strategy = {
  id: 'ddeolsapro1-test',
  name: '떨사오팔 PRO 테스트',
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
    {
      key: 'applyFee',
      label: '수수료 적용',
      type: 'select',
      default: true,
      options: [
        { label: '적용 (0.1%)', value: true },
        { label: '미적용', value: false },
      ],
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
    let cycleSeed = initialCapital; // 사이클 기준 시드 (복리 적용)

    // 이동평균 관련
    let avgCost = 0; // 평균 매수가
    let totalQty = 0; // 총 보유 수량

    // 티어별 포지션 관리 (null이면 빈 슬롯)
    const tierPositions: (TierPosition | null)[] = Array(MAX_TIERS).fill(null);

    const trades: Trade[] = [];
    const equity: { time: number; value: number }[] = [];

    /**
     * 이동평균가 업데이트 (매수 시)
     */
    const updateAvgCostOnBuy = (buyPrice: number, buyQty: number) => {
      const newTotalCost = avgCost * totalQty + buyPrice * buyQty;
      totalQty += buyQty;
      avgCost = totalQty > 0 ? newTotalCost / totalQty : 0;
    };

    /**
     * 이동평균가 업데이트 (매도 시)
     * - 매도 후에도 평균가는 유지 (남은 주식이 있으면)
     * - totalQty === 0이면 avgCost 리셋
     */
    const updateAvgCostOnSell = (sellQty: number) => {
      totalQty -= sellQty;
      if (totalQty <= 0) {
        totalQty = 0;
        avgCost = 0;
      }
    };

    /**
     * 현재 보유 티어 상태 문자열 생성
     */
    const getCurrentTierSlots = (): string => {
      const slots = tierPositions
        .map((p, i) => (p ? i + 1 : null))
        .filter((t) => t !== null);
      return slots.length > 0 ? slots.join(',') : '-';
    };

    for (let i = 0; i < data.length; i++) {
      const candle = data[i];
      const prevCandle = i > 0 ? data[i - 1] : null;

      // 오늘 처리할 이벤트 분류
      const stopLossTiers: number[] = []; // 손절 대상 티어
      const profitTiers: number[] = []; // 익절 대상 티어

      // ========== 1. 조건 판단: 손절 대상 체크 ==========
      for (let t = 0; t < MAX_TIERS; t++) {
        const pos = tierPositions[t];
        if (!pos) continue;

        // 거래일 기준 경과일 계산 (매수일 = 1일차)
        const holdingDays = i - pos.buyDayIndex + 1;

        if (holdingDays >= stopLossDays) {
          stopLossTiers.push(t);
        }
      }

      // ========== 2. 조건 판단: 익절 대상 체크 ==========
      for (let t = 0; t < MAX_TIERS; t++) {
        const pos = tierPositions[t];
        if (!pos) continue;

        // 이미 손절 대상이면 건너뛰기 (같은 티어 손절+익절 동시면 익절 우선 처리를 위해)
        const targetPrice = pos.buyPrice * (1 + targetProfit / 100);

        if (candle.close >= targetPrice) {
          // 손절과 익절 동시 충족 시 익절 우선
          const stopLossIndex = stopLossTiers.indexOf(t);
          if (stopLossIndex !== -1) {
            stopLossTiers.splice(stopLossIndex, 1); // 손절 목록에서 제거
          }
          profitTiers.push(t);
        }
      }

      // ========== 3. 실행: 손절 매도 (1순위) ==========
      for (const t of stopLossTiers) {
        const pos = tierPositions[t]!;
        const sellQty = pos.quantity;
        const tierNumber = t + 1;

        let sellValue = sellQty * candle.close;
        if (applyFee) {
          sellValue = sellValue * (1 - feeRate);
        }

        // 매도 전 avgCost 저장 (손익 계산용)
        const costBasisAtSell = avgCost;

        cash += sellValue;

        // 티어 슬롯 해제 전 상태 기록
        tierPositions[t] = null;
        const tierSlotsAfterSell = getCurrentTierSlots();

        // 이동평균 업데이트
        updateAvgCostOnSell(sellQty);

        trades.push({
          time: candle.time,
          type: 'sell',
          price: candle.close,
          quantity: sellQty,
          value: sellValue,
          costBasis: costBasisAtSell,
          tier: tierNumber,
          tierSlots: tierSlotsAfterSell,
        });
      }

      // ========== 4. 실행: 익절 매도 (2순위) ==========
      for (const t of profitTiers) {
        const pos = tierPositions[t]!;
        const sellQty = pos.quantity;
        const tierNumber = t + 1;

        let sellValue = sellQty * candle.close;
        if (applyFee) {
          sellValue = sellValue * (1 - feeRate);
        }

        // 매도 전 avgCost 저장 (손익 계산용)
        const costBasisAtSell = avgCost;

        cash += sellValue;

        // 티어 슬롯 해제 전 상태 기록
        tierPositions[t] = null;
        const tierSlotsAfterSell = getCurrentTierSlots();

        // 이동평균 업데이트
        updateAvgCostOnSell(sellQty);

        trades.push({
          time: candle.time,
          type: 'sell',
          price: candle.close,
          quantity: sellQty,
          value: sellValue,
          costBasis: costBasisAtSell,
          tier: tierNumber,
          tierSlots: tierSlotsAfterSell,
        });
      }

      // ========== 5. 사이클 종료 체크 (모든 티어 정리) ==========
      const hasAnyPosition = tierPositions.some((p) => p !== null);
      if (!hasAnyPosition && trades.length > 0) {
        // 사이클 종료 - 복리 적용 (현재 현금을 새 기준 시드로)
        cycleSeed = cash;
        avgCost = 0;
        totalQty = 0;
      }

      // ========== 6. 실행: 매수 (3순위) ==========
      if (prevCandle) {
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
            let buyBudget = 0;

            if (emptyTierIndex < 6) {
              // 1~6티어: 사이클 기준 시드의 비율만큼
              buyBudget = cycleSeed * splitRatios[emptyTierIndex];
            } else {
              // 7티어(예비): 잔여 시드 전액 (1~6티어 모두 채워진 경우만)
              const allMainTiersFilled = tierPositions
                .slice(0, 6)
                .every((p) => p !== null);
              if (allMainTiersFilled) {
                buyBudget = cash;
              }
            }

            // 실제 사용 가능한 금액으로 제한
            buyBudget = Math.min(buyBudget, cash);

            if (buyBudget > 0) {
              // 수수료 적용 후 실제 매수 가능 금액
              let netBuyAmount = buyBudget;
              if (applyFee) {
                netBuyAmount = buyBudget * (1 - feeRate);
              }

              // 소수점 내림 처리 (정수 수량만)
              const quantity = Math.floor(netBuyAmount / candle.close);

              // 최소 1주 이상 매수 가능한 경우에만 진입
              if (quantity >= 1) {
                // 실제 매수 금액 재계산 (정수 수량 기준)
                const actualBuyValue = quantity * candle.close;
                let totalCost = actualBuyValue;
                if (applyFee) {
                  totalCost = actualBuyValue * (1 + feeRate);
                }

                const tierNumber = emptyTierIndex + 1;

                cash -= totalCost;

                // 이동평균 업데이트
                updateAvgCostOnBuy(candle.close, quantity);

                tierPositions[emptyTierIndex] = {
                  tier: tierNumber,
                  buyPrice: candle.close,
                  buyDayIndex: i,
                  quantity: quantity,
                  buyValue: totalCost,
                };

                // 매수 후 티어 슬롯 상태
                const tierSlotsAfterBuy = getCurrentTierSlots();

                trades.push({
                  time: candle.time,
                  type: 'buy',
                  price: candle.close,
                  quantity: quantity,
                  value: totalCost,
                  costBasis: avgCost,
                  tier: tierNumber,
                  tierSlots: tierSlotsAfterBuy,
                });
              }
            }
          }
        }
      }

      // ========== 7. Equity 기록 ==========
      const portfolioValue = cash + totalQty * candle.close;
      equity.push({
        time: candle.time,
        value: portfolioValue,
      });
    }

    // ========== 8. 백테스트 종료 시 잔여 포지션 청산 ==========
    if (data.length > 0) {
      const lastCandle = data[data.length - 1];

      for (let t = 0; t < MAX_TIERS; t++) {
        const pos = tierPositions[t];
        if (!pos) continue;

        const sellQty = pos.quantity;
        const tierNumber = t + 1;
        let sellValue = sellQty * lastCandle.close;
        if (applyFee) {
          sellValue = sellValue * (1 - feeRate);
        }

        // 매도 전 avgCost 저장 (손익 계산용)
        const costBasisAtSell = avgCost;

        cash += sellValue;

        // 티어 슬롯 해제 전 상태 기록
        tierPositions[t] = null;
        const tierSlotsAfterSell = getCurrentTierSlots();

        // 이동평균 업데이트
        updateAvgCostOnSell(sellQty);

        trades.push({
          time: lastCandle.time,
          type: 'sell',
          price: lastCandle.close,
          quantity: sellQty,
          value: sellValue,
          costBasis: costBasisAtSell,
          tier: tierNumber,
          tierSlots: tierSlotsAfterSell,
        });
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
