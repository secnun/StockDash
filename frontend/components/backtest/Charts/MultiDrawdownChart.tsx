'use client';

import { useEffect, useRef } from 'react';
import { createChart, UTCTimestamp, IChartApi } from 'lightweight-charts';
import { getChartTheme, isDarkMode } from '@/lib/theme/chartTheme';
import { CompareResult } from '@/types/backtest';

interface MultiDrawdownChartProps {
  results: CompareResult[];
}

// Drawdown 데이터 계산
function calculateDrawdown(equity: { time: number; value: number }[]) {
  let maxValue = equity[0]?.value || 0;

  return equity.map((point) => {
    if (point.value > maxValue) {
      maxValue = point.value;
    }
    const drawdown = ((point.value - maxValue) / maxValue) * 100;

    return {
      time: point.time as UTCTimestamp,
      value: drawdown,
    };
  });
}

export default function MultiDrawdownChart({ results }: MultiDrawdownChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || results.length === 0) return;

    const isDark = isDarkMode();
    const theme = getChartTheme(isDark);

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 150,
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
        visible: true,
        minimumWidth: 80,
      },
    });

    chartRef.current = chart;

    // 각 전략별 Drawdown 라인 추가
    results.forEach((compareResult) => {
      const drawdownData = calculateDrawdown(compareResult.result.equity);

      const lineSeries = chart.addLineSeries({
        color: compareResult.color,
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: false,
        title: compareResult.strategyName,
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => `${price.toFixed(1)}%`,
          minMove: 0.1,
        },
      });

      lineSeries.setData(drawdownData);
    });

    // 0% 기준선
    const zeroLineSeries = chart.addLineSeries({
      color: theme.zeroLine,
      lineWidth: 1,
      lineStyle: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // 모든 전략 중 최소/최대 시간 찾기
    let minTime = Infinity;
    let maxTime = -Infinity;
    results.forEach((r) => {
      r.result.equity.forEach((point) => {
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

    chart.timeScale().fitContent();

    // 반응형 처리
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 150,
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
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      chart.remove();
    };
  }, [results]);

  return (
    <div className="w-full h-full relative">
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
