"""도메인 예외 클래스.

API 레이어(FastAPI)에 의존하지 않는 비즈니스 로직 전용 예외.
API 핸들러에서 이 예외를 잡아 HTTPException으로 변환합니다.
"""


class ServiceError(Exception):
    """서비스 레이어 기본 예외."""


class StrategyNotFoundError(ServiceError):
    """전략을 찾을 수 없음."""

    def __init__(self, strategy_id: str) -> None:
        self.strategy_id = strategy_id
        super().__init__(f"'{strategy_id}' 전략을 찾을 수 없습니다")


class DataNotFoundError(ServiceError):
    """데이터 파일을 찾을 수 없음."""

    def __init__(self, ticker_id: str) -> None:
        self.ticker_id = ticker_id
        super().__init__(f"'{ticker_id}' 티커의 데이터 파일을 찾을 수 없습니다")


class EmptyDataError(ServiceError):
    """데이터가 비어있음."""

    def __init__(self, message: str = "데이터가 비어있습니다") -> None:
        super().__init__(message)


class BacktestExecutionError(ServiceError):
    """백테스트 실행 실패."""

    def __init__(self, message: str) -> None:
        super().__init__(message)


class InsufficientDataError(ServiceError):
    """분석에 필요한 데이터가 부족."""

    def __init__(self, message: str = "분석에 필요한 데이터가 부족합니다") -> None:
        super().__init__(message)
