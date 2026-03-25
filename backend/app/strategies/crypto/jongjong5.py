"""암호화폐 종사종팔 v5 (JONGv5) 전략.

매 캔들 종가(LOC)에 분할매수, 개별 로트별 목표 수익률 익절 + 캔들 수 기반 손절.
주식 버전과 동일한 로직이나, 소수점 매수 및 거래소별 수수료 지원.
"""

import time
from typing import Any

import pandas as pd

from app.models.backtest import BacktestResponse, Trade
from app.models.strategy import ParameterDefinition, ParameterOption
from app.services.data_loader import get_crypto_fee_rate
from app.strategies.base import StrategyRegistry, TierPosition, TieredStrategy
from app.strategies.crypto.registry import CryptoStrategyRegistry
from app.strategies.utils import apply_buy_fee, apply_sell_fee, record_equity


class CryptoJongJong5Strategy(TieredStrategy):
    """매 캔들 종가 분할매수, 목표 수익률 익절 + 캔들 수 기반 손절 (암호화폐)."""

    id = "crypto_jongjong5"
    name = "종사종팔 v5 (Crypto)"
    description = "매 캔들 종가 분할매수, 목표 수익률 익절 + 캔들 수 기반 손절"
    parameters = [
        ParameterDefinition(
            key="dailyInvestRatio",
            label="캔들당 투자금%",
            type="number",
            default=10,
            min=1,
            max=50,
            step=1,
        ),
        ParameterDefinition(
            key="targetProfit",
            label="목표 수익률%",
            type="number",
            default=2.75,
            min=0.5,
            max=20,
            step=0.25,
        ),
        ParameterDefinition(
            key="stopLossDays",
            label="손절 캔들수",
            type="number",
            default=10,
            min=3,
            max=100,
            step=1,
        ),
    ]

    def execute(
        self,
        data: pd.DataFrame,
        params: dict[str, Any],
        initial_capital: float,
    ) -> BacktestResponse:
        start_time = time.perf_counter()

        closes = data["close"].values
        times = data["time"].values.astype(int)
        n = len(closes)

        daily_invest_ratio = float(params.get("dailyInvestRatio", 10)) / 100.0
        target_profit = float(params.get("targetProfit", 2.75)) / 100.0
        stop_loss_candles = int(params.get("stopLossDays", 10))
        apply_fee = bool(params.get("applyFee", True))
        fee_rate = float(params.get("feeRate", 0.001))

        cash = float(initial_capital)
        lots: list[TierPosition] = []
        trades: list[Trade] = []
        equity: list[dict[str, float]] = []
        cash_history: list[dict[str, float]] = []

        for i in range(n):
            close = float(closes[i])
            prev_close = float(closes[i - 1]) if i > 0 else close
            t = int(times[i])

            # --- 1. buy_budget 산출 (전봉 총자산평가금 기준) ---
            if i == 0:
                prev_total = initial_capital
            else:
                prev_total = cash + sum(
                    lot.quantity * prev_close for lot in lots
                )
            buy_budget = prev_total * daily_invest_ratio

            # --- 2. 매도 판정 ---
            sold_this_candle = False
            remaining_lots: list[TierPosition] = []
            for lot in lots:
                profit = (close - lot.buy_price) / lot.buy_price
                candles_held = i - lot.buy_day_index

                if profit >= target_profit:
                    # 익절
                    sold_this_candle = True
                    gross = lot.quantity * close
                    net = apply_sell_fee(gross, fee_rate, apply_fee)
                    cash += net
                    trades.append(Trade(
                        time=t,
                        type="sell",
                        price=close,
                        quantity=lot.quantity,
                        value=net,
                        cost_basis=lot.buy_price,
                    ))
                elif candles_held >= stop_loss_candles:
                    # 손절
                    sold_this_candle = True
                    gross = lot.quantity * close
                    net = apply_sell_fee(gross, fee_rate, apply_fee)
                    cash += net
                    trades.append(Trade(
                        time=t,
                        type="sell",
                        price=close,
                        quantity=lot.quantity,
                        value=net,
                        cost_basis=lot.buy_price,
                    ))
                else:
                    remaining_lots.append(lot)
            lots = remaining_lots

            # --- 3. 매수 (소수점 허용) ---
            is_last_candle = i == n - 1
            if not is_last_candle and not sold_this_candle:
                actual_budget = min(buy_budget, cash)
                # 암호화폐: 소수점 매수 허용 (전봉 종가 기준 수량 산정)
                if prev_close > 0:
                    raw_qty = actual_budget / (prev_close * (1 + fee_rate if apply_fee else 1))
                    quantity = round(raw_qty, 8)  # 소수점 8자리
                else:
                    quantity = 0.0

                if quantity > 0 and quantity * close > 0.01:
                    total_cost = apply_buy_fee(quantity * close, fee_rate, apply_fee)
                    if total_cost <= cash:
                        cash -= total_cost
                        lots.append(TierPosition(
                            tier=len(lots) + 1,
                            buy_price=close,
                            buy_day_index=i,
                            quantity=quantity,
                            buy_value=total_cost,
                            target_profit=target_profit,
                            stop_loss_days=stop_loss_candles,
                        ))
                        trades.append(Trade(
                            time=t,
                            type="buy",
                            price=close,
                            quantity=quantity,
                            value=total_cost,
                        ))

            # --- 4. 마지막 캔들: 잔여 로트 강제 매도 ---
            if is_last_candle and lots:
                for lot in lots:
                    gross = lot.quantity * close
                    net = apply_sell_fee(gross, fee_rate, apply_fee)
                    cash += net
                    trades.append(Trade(
                        time=t,
                        type="sell",
                        price=close,
                        quantity=lot.quantity,
                        value=net,
                        cost_basis=lot.buy_price,
                    ))
                lots = []

            # --- 5. equity/cash 기록 ---
            total_qty = sum(lot.quantity for lot in lots)
            record_equity(equity, cash_history, t, cash, total_qty, close)

        return self._build_response(
            trades=trades,
            equity=equity,
            initial_capital=initial_capital,
            start_time=start_time,
            cash_history=cash_history,
        )


# Module-level instance → import triggers registration
crypto_jongjong5_strategy = CryptoJongJong5Strategy()
CryptoStrategyRegistry.register(crypto_jongjong5_strategy)
