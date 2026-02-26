'use client';

import { useEffect, useRef } from 'react';
import { createChart, UTCTimestamp, IChartApi } from 'lightweight-charts';
import { getChartTheme, isDarkMode } from '@/lib/theme/chartTheme';
import { CompareResult, OHLCV } from '@/types/backtest';

interface MultiEquityChartProps {
  results: CompareResult[];
  initialCapital: number;
  priceData?: OHLCV[];
  tickerName?: string;
  currencySymbol?: string;
}

export default function MultiEquityChart({ results, initialCapital, priceData, tickerName, currencySymbol = '$' }: MultiEquityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || results.length === 0) return;

    const isDark = isDarkMode();
    const theme = getChartTheme(isDark);
    const hasPriceData = priceData && priceData.length > 0;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 350,
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
        minimumWidth: 80,
      },
      leftPriceScale: {
        visible: hasPriceData,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        minimumWidth: 80,
      },
    });

    chartRef.current = chart;

    // 가격 데이터 (전략보다 먼저 추가하여 뒤에 표시)
    if (hasPriceData) {
      const priceLineData = priceData.map((d) => ({
        time: d.time as UTCTimestamp,
        value: d.close,
      }));

      const priceSeries = chart.addLineSeries({
        priceScaleId: 'left',
        color: isDark ? 'rgba(129, 140, 248, 0.4)' : 'rgba(99, 102, 241, 0.4)',
        lineWidth: 1,
        lastValueVisible: true,
        priceLineVisible: false,
        title: tickerName || 'Price',
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => `${currencySymbol}${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
          minMove: 0.01,
        },
      });

      priceSeries.setData(priceLineData);
    }

    // 각 전략별 Equity 라인 추가
    results.forEach((compareResult) => {
      const lineData = compareResult.result.equity.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.value,
      }));

      const lineSeries = chart.addLineSeries({
        color: compareResult.color,
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: false,
        title: compareResult.strategyName,
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => `${currencySymbol}${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
          minMove: 1,
        },
      });

      lineSeries.setData(lineData);
    });

    // 기준선 (초기 자본)
    const baselineSeries = chart.addLineSeries({
      color: theme.zeroLine,
      lineWidth: 1,
      lineStyle: 2, // dashed
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
      baselineSeries.setData([
        { time: minTime as UTCTimestamp, value: initialCapital },
        { time: maxTime as UTCTimestamp, value: initialCapital },
      ]);
    }

    chart.timeScale().fitContent();

    // 반응형 처리
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 350,
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
  }, [results, initialCapital, priceData, tickerName, currencySymbol]);

  return (
    <div className="w-full h-full relative">
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
