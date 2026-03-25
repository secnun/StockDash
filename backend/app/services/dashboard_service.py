"""대시보드 서비스 — 히트맵 백테스트, 캐시, 시장 지표 조회."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx

from app.core.config import get_settings
from app.models.dashboard import (
    HeatmapResponse,
    HeatmapStrategyItem,
    MarketIndicator,
    MonthlyBreakdown,
)
from app.services.data_loader import filter_by_date_range, find_data_file, load_csv_pandas
from app.services.yearly_backtest import run_period_independent
from app.strategies import StrategyRegistry
from app.strategies.utils import FEE_RATE_US

logger = logging.getLogger(__name__)

HEATMAP_STRATEGIES = [
    "ddeolsapro1",
    "ddeolsapro2",
    "ddeolsapro3",
    "ddeolsapro_custom",
    "ddeolsapro_at",
    "moomae21",
    "jongjong5",
    "wadaeri_v1",
]
HEATMAP_TICKERS = ["SOXL", "TQQQ"]
INITIAL_CAPITAL = 10000.0

CACHE_FILE = "dashboard_heatmap.json"


def _get_cache_path() -> Path:
    settings = get_settings()
    return settings.cache_dir / CACHE_FILE


def get_market_date() -> str:
    """미장 기준 날짜 반환. 한국시간 06:00 이전이면 전일 기준."""
    now_kst = datetime.now(ZoneInfo("Asia/Seoul"))
    if now_kst.hour < 6:
        market_date = (now_kst - timedelta(days=1)).strftime("%Y-%m-%d")
    else:
        market_date = now_kst.strftime("%Y-%m-%d")
    return market_date


def is_cache_valid() -> bool:
    """캐시 파일이 미장 기준 날짜로 유효한지 확인."""
    cache_path = _get_cache_path()
    if not cache_path.exists():
        return False
    try:
        with open(cache_path, encoding="utf-8") as f:
            data = json.load(f)
        cached_date = data.get("generatedDate", "")
        return cached_date == get_market_date()
    except Exception:
        return False


def load_cache() -> HeatmapResponse | None:
    """캐시 파일에서 백테스트 결과 로드."""
    cache_path = _get_cache_path()
    try:
        with open(cache_path, encoding="utf-8") as f:
            data = json.load(f)
        return HeatmapResponse(**data["response"])
    except Exception:
        logger.debug("Cache load failed", exc_info=True)
        return None


def save_cache(response: HeatmapResponse) -> None:
    """백테스트 결과를 캐시 파일에 저장."""
    cache_path = _get_cache_path()
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        data = {
            "generatedDate": get_market_date(),
            "response": response.model_dump(by_alias=True),
        }
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        logger.info("Dashboard cache saved: %s", cache_path)
    except Exception:
        logger.warning("Cache save failed", exc_info=True)


def run_single_heatmap_backtest(
    strategy, ticker: str, start_date: str
) -> dict | None:
    """히트맵용 단일 백테스트 실행."""
    data_path = find_data_file(ticker, "us")
    if data_path is None or not data_path.exists():
        return None

    try:
        df = load_csv_pandas(data_path)
        df = filter_by_date_range(df, start_date, None)
        if len(df) == 0:
            return None

        params = {p.key: p.default for p in strategy.parameters}
        params["applyFee"] = True
        params["feeRate"] = FEE_RATE_US

        result = strategy.execute(df, params, INITIAL_CAPITAL)

        monthly: list[MonthlyBreakdown] = []
        try:
            period_result = run_period_independent(strategy, df, INITIAL_CAPITAL, params)
            for stat in period_result.seed_reset:
                monthly.append(
                    MonthlyBreakdown(
                        month=stat.label,
                        total_return=stat.total_return,
                        mdd=stat.mdd,
                    )
                )
        except Exception:
            pass

        equity = result.equity
        current_seed = equity[-1].value if equity else INITIAL_CAPITAL

        return {
            "ytd_return": result.metrics.total_return,
            "current_seed": round(current_seed, 2),
            "max_mdd": abs(result.metrics.mdd),
            "win_rate": result.metrics.win_rate,
            "total_trades": result.metrics.total_trades,
            "monthly_breakdown": monthly,
        }
    except Exception:
        logger.warning("Heatmap backtest failed: strategy=%s, ticker=%s", strategy.id, ticker, exc_info=True)
        return None


async def fetch_market_indicators() -> list[MarketIndicator]:
    """외부 API에서 시장 지표 조회 (best-effort)."""
    indicators: list[MarketIndicator] = []

    async with httpx.AsyncClient(timeout=5.0) as client:
        # VIX
        try:
            resp = await client.get(
                "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX",
                params={"interval": "1d", "range": "2d"},
                headers={"User-Agent": "Mozilla/5.0"},
            )
            if resp.status_code == 200:
                data = resp.json()
                meta = data["chart"]["result"][0]["meta"]
                price = meta.get("regularMarketPrice", 0)
                prev = meta.get("chartPreviousClose", 0)
                change = ((price - prev) / prev * 100) if prev else 0
                indicators.append(MarketIndicator(
                    label="VIX",
                    value=f"{price:.1f}",
                    change=round(change, 2),
                ))
        except Exception:
            logger.debug("Failed to fetch VIX", exc_info=True)

        # Fear & Greed Index
        try:
            resp = await client.get(
                "https://api.alternative.me/fng/",
                params={"limit": "1"},
            )
            if resp.status_code == 200:
                data = resp.json()
                entry = data.get("data", [{}])[0]
                score = entry.get("value")
                classification = entry.get("value_classification", "")
                if score is not None:
                    label_map = {
                        "Extreme Fear": "극단적 공포",
                        "Fear": "공포",
                        "Neutral": "중립",
                        "Greed": "탐욕",
                        "Extreme Greed": "극단적 탐욕",
                    }
                    kr_rating = label_map.get(classification, classification)
                    indicators.append(MarketIndicator(
                        label="공포탐욕",
                        value=f"{score} {kr_rating}",
                    ))
        except Exception:
            logger.debug("Failed to fetch Fear & Greed", exc_info=True)

        # S&P 500
        try:
            resp = await client.get(
                "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC",
                params={"interval": "1d", "range": "2d"},
                headers={"User-Agent": "Mozilla/5.0"},
            )
            if resp.status_code == 200:
                data = resp.json()
                meta = data["chart"]["result"][0]["meta"]
                price = meta.get("regularMarketPrice", 0)
                prev = meta.get("chartPreviousClose", 0)
                change = ((price - prev) / prev * 100) if prev else 0
                indicators.append(MarketIndicator(
                    label="S&P 500",
                    value=f"{price:,.0f}",
                    change=round(change, 2),
                ))
        except Exception:
            logger.debug("Failed to fetch S&P 500", exc_info=True)

        # NASDAQ
        try:
            resp = await client.get(
                "https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC",
                params={"interval": "1d", "range": "2d"},
                headers={"User-Agent": "Mozilla/5.0"},
            )
            if resp.status_code == 200:
                data = resp.json()
                meta = data["chart"]["result"][0]["meta"]
                price = meta.get("regularMarketPrice", 0)
                prev = meta.get("chartPreviousClose", 0)
                change = ((price - prev) / prev * 100) if prev else 0
                indicators.append(MarketIndicator(
                    label="NASDAQ",
                    value=f"{price:,.0f}",
                    change=round(change, 2),
                ))
        except Exception:
            logger.debug("Failed to fetch NASDAQ", exc_info=True)

    return indicators


async def get_heatmap_data() -> HeatmapResponse:
    """히트맵 데이터 생성 (캐시 사용)."""
    # 1. 캐시 유효하면 로드
    if is_cache_valid():
        cached = load_cache()
        if cached is not None:
            return cached

    # 2. 백테스트 실행
    current_year = datetime.now().year
    start_date = f"{current_year}-01-01"
    generated_at = datetime.now().isoformat()

    items: list[HeatmapStrategyItem] = []

    for strategy_id in HEATMAP_STRATEGIES:
        strategy = StrategyRegistry.get(strategy_id)
        if strategy is None:
            logger.warning("Strategy not found: %s", strategy_id)
            continue

        results: dict[str, dict | None] = {}
        for ticker in HEATMAP_TICKERS:
            results[ticker] = run_single_heatmap_backtest(strategy, ticker, start_date)

        valid = {t: r for t, r in results.items() if r is not None}
        if not valid:
            continue

        def score(t: str) -> tuple[float, float]:
            r = valid[t]
            return (r["ytd_return"], -r["max_mdd"])

        best_ticker = max(valid.keys(), key=score)
        alt_ticker = [t for t in HEATMAP_TICKERS if t != best_ticker][0]
        best = valid[best_ticker]
        alt_return = valid[alt_ticker]["ytd_return"] if alt_ticker in valid else 0.0

        items.append(
            HeatmapStrategyItem(
                strategy_id=strategy_id,
                strategy_name=strategy.name,
                representative_ticker=best_ticker,
                alt_ticker=alt_ticker,
                ytd_return=round(best["ytd_return"], 2),
                alt_ytd_return=round(alt_return, 2),
                current_seed=best["current_seed"],
                max_mdd=round(best["max_mdd"], 2),
                win_rate=round(best["win_rate"], 2),
                total_trades=best["total_trades"],
                monthly_breakdown=best["monthly_breakdown"],
            )
        )

    # 시장 지표
    try:
        market_indicators = await fetch_market_indicators()
    except Exception:
        market_indicators = []

    response = HeatmapResponse(
        generated_at=generated_at,
        initial_capital=INITIAL_CAPITAL,
        strategies=items,
        market_indicators=market_indicators,
    )

    # 3. 캐시 저장
    save_cache(response)

    return response
