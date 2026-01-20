'use client';

import { useEffect, useRef } from 'react';
import { createChart, UTCTimestamp, IChartApi } from 'lightweight-charts';
import { OHLCV, Trade } from '@/types/backtest';
import { getChartTheme, isDarkMode } from '@/lib/theme/chartTheme';

interface PriceChartProps {
  data: OHLCV[];
  trades: Trade[];
}

export default function PriceChart({ data, trades }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    const isDark = isDarkMode();
    const theme = getChartTheme(isDark);

    // 차트 생성
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 400,
      layout: {
        background: { color: theme.background },
        textColor: theme.text,
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // 캔들스틱 시리즈 추가
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: theme.candle.up,
      downColor: theme.candle.down,
      borderVisible: false,
      wickUpColor: theme.candle.wickUp,
      wickDownColor: theme.candle.wickDown,
    });

    // OHLCV 데이터 변환
    const candleData = data.map((candle) => ({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));

    candlestickSeries.setData(candleData);

    // 매수/매도 마커 추가
    if (trades.length > 0) {
      const markers = trades.map((trade) => ({
        time: trade.time as UTCTimestamp,
        position: trade.type === 'buy' ? 'belowBar' as const : 'aboveBar' as const,
        color: trade.type === 'buy' ? theme.markers.buy : theme.markers.sell,
        shape: trade.type === 'buy' ? 'arrowUp' as const : 'arrowDown' as const,
        text: trade.type === 'buy' ? '매수' : '매도',
      }));

      candlestickSeries.setMarkers(markers);
    }

    // 차트 자동 피팅
    chart.timeScale().fitContent();

    // 반응형 처리
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 400,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // 다크모드 변경 감지
    const observer = new MutationObserver(() => {
      const isDarkNow = isDarkMode();
      const newTheme = getChartTheme(isDarkNow);

      if (chartRef.current) {
        chartRef.current.applyOptions({
          layout: {
            background: { color: newTheme.background },
            textColor: newTheme.text,
          },
          grid: {
            vertLines: { color: newTheme.grid },
            horzLines: { color: newTheme.grid },
          },
        });
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    // 클린업
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      chart.remove();
    };
  }, [data, trades]);

  return (
    <div className="w-full h-full">
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
