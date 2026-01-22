"""
공통 매수/매도 유틸리티

모든 전략에서 공유하는 핵심 계산 로직.
각 전략은 이 함수들의 결과를 받아 고유 상태만 추가 업데이트.
"""

from dataclasses import dataclass

from app.models.backtest import Trade


# ========== 상수 ==========
DEFAULT_FEE_RATE = 0.001  # 0.1%


# ========== 수수료 계산 ==========
def apply_sell_fee(amount: float, fee_rate: float, apply_fee: bool) -> float:
    """매도 금액에서 수수료 차감"""
    return amount * (1 - fee_rate) if apply_fee else amount


def apply_buy_fee(amount: float, fee_rate: float, apply_fee: bool) -> float:
    """매수 금액에 수수료 추가"""
    return amount * (1 + fee_rate) if apply_fee else amount


# ========== 이동평균 계산 ==========
def calc_avg_cost_after_buy(
    current_avg: float,
    current_qty: int,
    buy_price: float,
    buy_qty: int,
) -> float:
    """매수 후 새로운 이동평균가 계산"""
    new_qty = current_qty + buy_qty
    if new_qty <= 0:
        return 0.0
    total_cost = current_avg * current_qty + buy_price * buy_qty
    return total_cost / new_qty


def calc_avg_cost_after_sell(
    current_avg: float,
    current_qty: int,
    sell_qty: int,
) -> float:
    """매도 후 이동평균가 (수량 0이면 리셋)"""
    new_qty = current_qty - sell_qty
    return current_avg if new_qty > 0 else 0.0


# ========== 수량 계산 ==========
def calc_buy_quantity(
    budget: float,
    price: float,
    fee_rate: float,
    apply_fee: bool,
) -> int:
    """예산으로 매수 가능한 최대 수량 (정수, 내림)"""
    if price <= 0 or budget <= 0:
        return 0
    # 수수료 포함 가격으로 나눔
    effective_price = price * (1 + fee_rate) if apply_fee else price
    return int(budget / effective_price)


def calc_buy_quantity_net(
    budget: float,
    price: float,
    fee_rate: float,
    apply_fee: bool,
) -> int:
    """예산에서 수수료 먼저 빼고 수량 계산 (ddeolsapro 방식)"""
    if price <= 0 or budget <= 0:
        return 0
    net_amount = budget * (1 - fee_rate) if apply_fee else budget
    return int(net_amount // price)


# ========== 매도 실행 핵심 ==========
@dataclass
class SellResult:
    """매도 실행 결과"""
    new_cash: float
    new_avg_cost: float
    new_total_qty: int
    sell_qty: int  # 실제 매도 수량
    sell_value: float  # 수수료 차감 후 실제 입금액
    cost_basis: float  # 매도 시점 평균단가


def execute_sell_core(
    cash: float,
    avg_cost: float,
    total_qty: int,
    sell_qty: int,
    sell_price: float,
    fee_rate: float,
    apply_fee: bool,
) -> SellResult:
    """
    매도 핵심 로직 (상태 업데이트 없이 계산만)

    Returns:
        SellResult with all calculated values
    """
    actual_qty = min(sell_qty, total_qty)
    if actual_qty <= 0:
        return SellResult(cash, avg_cost, total_qty, 0, 0.0, avg_cost)

    gross_value = actual_qty * sell_price
    net_value = apply_sell_fee(gross_value, fee_rate, apply_fee)

    cost_basis = avg_cost
    new_cash = cash + net_value
    new_qty = total_qty - actual_qty
    new_avg = calc_avg_cost_after_sell(avg_cost, total_qty, actual_qty)

    return SellResult(new_cash, new_avg, new_qty, actual_qty, net_value, cost_basis)


# ========== 매수 실행 핵심 ==========
@dataclass
class BuyResult:
    """매수 실행 결과"""
    new_cash: float
    new_avg_cost: float
    new_total_qty: int
    quantity: int  # 매수 수량
    total_cost: float  # 수수료 포함 총 비용


def execute_buy_core(
    cash: float,
    avg_cost: float,
    total_qty: int,
    buy_budget: float,
    buy_price: float,
    fee_rate: float,
    apply_fee: bool,
    use_net_calculation: bool = False,
) -> BuyResult:
    """
    매수 핵심 로직 (상태 업데이트 없이 계산만)

    Args:
        use_net_calculation: True면 ddeolsapro 방식 (예산에서 수수료 먼저 차감)

    Returns:
        BuyResult with all calculated values
    """
    budget = min(buy_budget, cash)
    if budget <= 0:
        return BuyResult(cash, avg_cost, total_qty, 0, 0.0)

    # 수량 계산 (두 가지 방식 지원)
    if use_net_calculation:
        quantity = calc_buy_quantity_net(budget, buy_price, fee_rate, apply_fee)
    else:
        quantity = calc_buy_quantity(budget, buy_price, fee_rate, apply_fee)

    if quantity < 1:
        return BuyResult(cash, avg_cost, total_qty, 0, 0.0)

    actual_value = quantity * buy_price
    total_cost = apply_buy_fee(actual_value, fee_rate, apply_fee)

    new_cash = cash - total_cost
    new_avg = calc_avg_cost_after_buy(avg_cost, total_qty, buy_price, quantity)
    new_qty = total_qty + quantity

    return BuyResult(new_cash, new_avg, new_qty, quantity, total_cost)


# ========== 포트폴리오 ==========
def calc_portfolio_value(cash: float, qty: int, price: float) -> float:
    """포트폴리오 총 가치"""
    return cash + qty * price


# ========== Trade 생성 헬퍼 ==========
def create_sell_trade(
    time: int,
    price: float,
    result: SellResult,
    tier: int | None = None,
    tier_slots: str | None = None,
) -> Trade:
    """SellResult로부터 Trade 객체 생성"""
    return Trade(
        time=time,
        type="sell",
        price=price,
        quantity=result.sell_qty,
        value=result.sell_value,
        cost_basis=result.cost_basis,
        tier=tier,
        tier_slots=tier_slots,
    )


def create_buy_trade(
    time: int,
    price: float,
    result: BuyResult,
    tier: int | None = None,
    tier_slots: str | None = None,
) -> Trade:
    """BuyResult로부터 Trade 객체 생성"""
    return Trade(
        time=time,
        type="buy",
        price=price,
        quantity=result.quantity,
        value=result.total_cost,
        cost_basis=result.new_avg_cost,
        tier=tier,
        tier_slots=tier_slots,
    )
