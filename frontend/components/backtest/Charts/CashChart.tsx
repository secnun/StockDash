'use client';

import { useEffect, useRef } from 'react';
import { createChart, UTCTimestamp, IChartApi } from 'lightweight-charts';
import { getChartTheme, isDarkMode } from '@/lib/theme/chartTheme';

interface CashChartProps {
  cash: { time: number; value: number }[];
  equity: { time: number; value: number }[];
  initialCapital: number;
  displayMode: 'amount' | 'ratio';
  currencySymbol?: string;
}

export default function CashChart({ cash, equity, initialCapital, displayMode, currencySymbol = '$' }: CashChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || cash.length === 0) return;

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
      leftPriceScale: {
        visible: true,
        minimumWidth: 80,
      },
    });

    chartRef.current = chart;

    // Calculate data based on display mode
    const chartData = cash.map((point, index) => {
      if (displayMode === 'ratio') {
        const equityValue = equity[index]?.value || initialCapital;
        const ratio = equityValue > 0 ? (point.value / equityValue) * 100 : 0;
        return {
          time: point.time as UTCTimestamp,
          value: ratio,
        };
      }
      return {
        time: point.time as UTCTimestamp,
        value: point.value,
      };
    });

    // Area series for cash
    const cashSeries = chart.addAreaSeries({
      lineColor: theme.cash.line,
      topColor: theme.cash.fill,
      bottomColor: theme.cash.fillBottom,
      lineWidth: 2,
      priceScaleId: 'right',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) =>
          displayMode === 'ratio'
            ? `${price.toFixed(1)}%`
            : `${currencySymbol}${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        minMove: displayMode === 'ratio' ? 0.1 : 1,
      },
      lastValueVisible: false,
    });

    cashSeries.setData(chartData);

    // 0% 진입 시점 마커 (ratio 모드에서만 표시)
    if (displayMode === 'ratio') {
      const zeroEntryPoints = chartData.filter((point, index) => {
        const isZero = point.value === 0 || point.value < 0.1;
        const prevWasNotZero = index === 0 || chartData[index - 1].value >= 0.1;
        return isZero && prevWasNotZero;
      });

      const markers = zeroEntryPoints.map((point) => ({
        time: point.time,
        position: 'belowBar' as const,
        color: '#ef4444',
        shape: 'circle' as const,
      }));

      cashSeries.setMarkers(markers);
    }

    chart.timeScale().fitContent();

    // Resize handler
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 150,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // Dark mode observer
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
  }, [cash, equity, initialCapital, displayMode, currencySymbol]);

  return (
    <div ref={chartContainerRef} className="w-full h-full" />
  );
}
