'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createChart, UTCTimestamp, IChartApi, Time, MouseEventParams } from 'lightweight-charts';
import { getChartTheme, isDarkMode } from '@/lib/theme/chartTheme';
import { PairData } from './mockPairData';

interface PairPriceChartProps {
  pairs: PairData[];
  onCrosshairMove?: (time: number | null, values: Map<string, number>) => void;
}

/**
 * 가격 변화율 차트 (시작일 = 0%)
 * 각 마켓의 % 변화를 오버레이하여 선반영/후반영 파악
 */
export default function PairPriceChart({ pairs, onCrosshairMove }: PairPriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const pairDataMapRef = useRef<Map<string, PairData>>(new Map());

  const handleCrosshairMove = useCallback(
    (param: MouseEventParams<Time>) => {
      if (!onCrosshairMove) return;

      if (!param.time) {
        onCrosshairMove(null, new Map());
        return;
      }

      const time = param.time as number;
      const values = new Map<string, number>();

      pairDataMapRef.current.forEach((pair, pairId) => {
        const point = pair.data.find((d) => d.time === time);
        if (point) {
          values.set(pairId, point.changePercent);
        }
      });

      onCrosshairMove(time, values);
    },
    [onCrosshairMove]
  );

  useEffect(() => {
    if (!chartContainerRef.current || pairs.length === 0) return;

    const isDark = isDarkMode();
    const theme = getChartTheme(isDark);

    // 페어 데이터 맵 업데이트
    pairDataMapRef.current.clear();
    pairs.forEach((pair) => {
      pairDataMapRef.current.set(pair.pairId, pair);
    });

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 300,
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
      rightPriceScale: {
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        minimumWidth: 60,
      },
      crosshair: {
        mode: 1, // Normal
      },
    });

    chartRef.current = chart;

    // 0% 기준선 추가
    const zeroLineSeries = chart.addLineSeries({
      color: theme.zeroLine,
      lineWidth: 1,
      lineStyle: 2, // dashed
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // 전체 시간 범위 찾기
    let minTime = Infinity;
    let maxTime = -Infinity;
    pairs.forEach((pair) => {
      pair.data.forEach((point) => {
        if (point.time < minTime) minTime = point.time;
        if (point.time > maxTime) maxTime = point.time;
      });
    });

    if (minTime !== Infinity && maxTime !== -Infinity) {
      zeroLineSeries.setData([
        { time: minTime as UTCTimestamp, value: 0 },
        { time: maxTime as UTCTimestamp, value: 0 },
      ]);
    }

    // 각 페어별 라인 추가
    pairs.forEach((pair) => {
      const lineData = pair.data.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.changePercent,
      }));

      const lineSeries = chart.addLineSeries({
        color: pair.color,
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: false,
        title: `${pair.coinSymbol}/${pair.marketName}`,
        priceFormat: {
          type: 'custom',
          formatter: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`,
          minMove: 0.01,
        },
      });

      lineSeries.setData(lineData);
    });

    // 크로스헤어 이벤트
    chart.subscribeCrosshairMove(handleCrosshairMove);

    chart.timeScale().fitContent();

    // 반응형 처리
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 300,
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

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      chart.remove();
    };
  }, [pairs, handleCrosshairMove]);

  return (
    <div className="w-full h-full relative">
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
