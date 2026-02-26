"""Optimizer utility functions for parameter handling."""

from decimal import Decimal


def get_decimal_places(value: float) -> int:
    """step의 소수점 자릿수 반환.

    Examples:
        1 -> 0
        0.1 -> 1
        0.01 -> 2
        0.5 -> 1
    """
    d = Decimal(str(value))
    return max(0, -d.as_tuple().exponent)


def round_to_step(value: float, step: float) -> float | int:
    """값을 step 배수로 반올림.

    step이 정수(소수점 0자리)면 int 반환.
    """
    decimal_places = get_decimal_places(step)
    rounded = round(value / step) * step
    rounded = round(rounded, decimal_places)

    if decimal_places == 0:
        return int(rounded)
    return rounded


def generate_range_values(min_val: float, max_val: float, step: float) -> list:
    """정수 인덱스 기반으로 범위 값 생성 (부동소수점 오차 방지).

    step이 정수면 int 리스트 반환.

    Examples:
        (5, 10, 1) -> [5, 6, 7, 8, 9, 10]
        (0.0, 0.3, 0.1) -> [0.0, 0.1, 0.2, 0.3]
    """
    decimal_places = get_decimal_places(step)
    n_steps = round((max_val - min_val) / step)

    values = []
    for i in range(n_steps + 1):
        val = round(min_val + i * step, decimal_places)
        if decimal_places == 0:
            val = int(val)
        values.append(val)

    return values
