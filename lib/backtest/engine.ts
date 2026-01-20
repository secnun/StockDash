import { OHLCV, Trade, Signal } from '@/types/backtest';

/**
 * 백테스트 엔진 - 매매 신호를 실행하고 포지션을 관리
 */
export class BacktestEngine {
  private initialCapital: number;
  private cash: number;
  private position: number; // 보유 수량
  private trades: Trade[] = [];
  private equity: { time: number; value: number }[] = [];

  constructor(initialCapital: number) {
    this.initialCapital = initialCapital;
    this.cash = initialCapital;
    this.position = 0;
  }

  /**
   * 매수 주문 실행
   */
  buy(time: number, price: number, quantity?: number): void {
    // quantity가 지정되지 않으면 전액 매수
    const buyQuantity = quantity || Math.floor(this.cash / price);

    if (buyQuantity <= 0) return;

    const totalCost = buyQuantity * price;

    if (totalCost > this.cash) {
      // 현금이 부족하면 가능한 만큼만 매수
      const affordableQuantity = Math.floor(this.cash / price);
      if (affordableQuantity <= 0) return;

      this.executeBuy(time, price, affordableQuantity);
    } else {
      this.executeBuy(time, price, buyQuantity);
    }
  }

  /**
   * 매도 주문 실행
   */
  sell(time: number, price: number, quantity?: number): void {
    // quantity가 지정되지 않으면 전량 매도
    const sellQuantity = quantity || this.position;

    if (sellQuantity <= 0 || sellQuantity > this.position) return;

    this.executeSell(time, price, sellQuantity);
  }

  /**
   * 매수 실행 (내부 메서드)
   */
  private executeBuy(time: number, price: number, quantity: number): void {
    const totalCost = quantity * price;

    this.cash -= totalCost;
    this.position += quantity;

    this.trades.push({
      time,
      type: 'buy',
      price,
      quantity,
      value: totalCost,
    });
  }

  /**
   * 매도 실행 (내부 메서드)
   */
  private executeSell(time: number, price: number, quantity: number): void {
    const totalValue = quantity * price;

    this.cash += totalValue;
    this.position -= quantity;

    this.trades.push({
      time,
      type: 'sell',
      price,
      quantity,
      value: totalValue,
    });
  }

  /**
   * 현재 포트폴리오 가치 계산
   */
  getPortfolioValue(currentPrice: number): number {
    return this.cash + this.position * currentPrice;
  }

  /**
   * Equity curve 기록
   */
  recordEquity(time: number, currentPrice: number): void {
    const value = this.getPortfolioValue(currentPrice);
    this.equity.push({ time, value });
  }

  /**
   * 백테스트 결과 반환
   */
  getResults(): { trades: Trade[]; equity: { time: number; value: number }[] } {
    return {
      trades: this.trades,
      equity: this.equity,
    };
  }

  /**
   * 현재 포지션 상태
   */
  hasPosition(): boolean {
    return this.position > 0;
  }

  /**
   * 리셋 (새로운 백테스트를 위해)
   */
  reset(initialCapital?: number): void {
    this.initialCapital = initialCapital || this.initialCapital;
    this.cash = this.initialCapital;
    this.position = 0;
    this.trades = [];
    this.equity = [];
  }
}

/**
 * 백테스트 실행 헬퍼 함수
 * @param data OHLCV 데이터
 * @param signalGenerator 매매 신호 생성 함수
 * @param initialCapital 초기 자본
 * @returns 백테스트 결과 (거래 내역, equity curve)
 */
export function runBacktest(
  data: OHLCV[],
  signalGenerator: (data: OHLCV[], index: number) => Signal,
  initialCapital: number
): { trades: Trade[]; equity: { time: number; value: number }[] } {
  const engine = new BacktestEngine(initialCapital);

  for (let i = 0; i < data.length; i++) {
    const candle = data[i];
    const signal = signalGenerator(data, i);

    // 매매 신호에 따라 주문 실행
    if (signal === 'buy' && !engine.hasPosition()) {
      engine.buy(candle.time, candle.close);
    } else if (signal === 'sell' && engine.hasPosition()) {
      engine.sell(candle.time, candle.close);
    }

    // Equity curve 기록
    engine.recordEquity(candle.time, candle.close);
  }

  // 백테스트 종료 시 포지션이 남아있으면 청산
  if (engine.hasPosition() && data.length > 0) {
    const lastCandle = data[data.length - 1];
    engine.sell(lastCandle.time, lastCandle.close);
  }

  return engine.getResults();
}
