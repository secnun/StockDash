'use client';

import { useEffect, useRef } from 'react';
import { createChart, UTCTimestamp } from 'lightweight-charts';
import { OHLCV, Trade } from '@/types/backtest';

interface PriceChartProps {
  data: OHLCV[];
  trades: Trade[];
}

export default function PriceChart({ data, trades }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    // 차트 생성
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 400,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // 캔들스틱 시리즈 추가
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
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
        color: trade.type === 'buy' ? '#26a69a' : '#ef5350',
        shape: trade.type === 'buy' ? 'arrowUp' as const : 'arrowDown' as const,
        text: trade.type === 'buy' ? '매수' : '매도',
      }));

      candlestickSeries.setMarkers(markers);
    }

    // 차트 자동 피팅
    chart.timeScale().fitContent();

    // 반응형 처리
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 400,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // 클린업
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, trades]);

  return (
    <div className="w-full h-full">
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
