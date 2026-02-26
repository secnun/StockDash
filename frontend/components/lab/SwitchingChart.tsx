'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, UTCTimestamp, IChartApi, MouseEventParams, ISeriesApi, SeriesType } from 'lightweight-charts';
import { getChartTheme, isDarkMode } from '@/lib/theme/chartTheme';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface LinePoint {
  time: number;
  value: number;
}

interface LegendValues {
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  ma20: number | null;
  ma60: number | null;
}

interface SwitchingChartProps {
  candles: CandleData[];
  ma20: LinePoint[];
  ma60: LinePoint[];
}

export default function SwitchingChart({ candles, ma20, ma60 }: SwitchingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [legend, setLegend] = useState<LegendValues>({ open: null, high: null, low: null, close: null, ma20: null, ma60: null });

  // Store series refs for crosshair lookup
  const candleSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const ma20SeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const ma60SeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  const handleCrosshairMove = useCallback((param: MouseEventParams) => {
    if (!param.time || !param.seriesData) {
      // Reset to last candle values
      const last = candles[candles.length - 1];
      const lastMa20 = ma20[ma20.length - 1];
      const lastMa60 = ma60[ma60.length - 1];
      setLegend({
        open: last?.open ?? null,
        high: last?.high ?? null,
        low: last?.low ?? null,
        close: last?.close ?? null,
        ma20: lastMa20?.value ?? null,
        ma60: lastMa60?.value ?? null,
      });
      return;
    }

    const candleData = candleSeriesRef.current ? param.seriesData.get(candleSeriesRef.current) as { open?: number; high?: number; low?: number; close?: number } | undefined : undefined;
    const ma20Data = ma20SeriesRef.current ? param.seriesData.get(ma20SeriesRef.current) as { value?: number } | undefined : undefined;
    const ma60Data = ma60SeriesRef.current ? param.seriesData.get(ma60SeriesRef.current) as { value?: number } | undefined : undefined;

    setLegend({
      open: candleData?.open ?? null,
      high: candleData?.high ?? null,
      low: candleData?.low ?? null,
      close: candleData?.close ?? null,
      ma20: ma20Data?.value ?? null,
      ma60: ma60Data?.value ?? null,
    });
  }, [candles, ma20, ma60]);

  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    const isDark = isDarkMode();
    const theme = getChartTheme(isDark);

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 450,
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
        scaleMargins: { top: 0.05, bottom: 0.05 },
        minimumWidth: 80,
      },
    });

    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: theme.candle.up,
      downColor: theme.candle.down,
      wickUpColor: theme.candle.wickUp,
      wickDownColor: theme.candle.wickDown,
      borderVisible: false,
    });
    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    candleSeriesRef.current = candleSeries;

    // MA20 line (blue)
    const ma20Color = isDark ? '#60a5fa' : '#3b82f6';
    const ma20Series = chart.addLineSeries({
      color: ma20Color,
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    ma20Series.setData(
      ma20.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
    );
    ma20SeriesRef.current = ma20Series;

    // MA60 line (orange)
    const ma60Color = isDark ? '#fbbf24' : '#f59e0b';
    const ma60Series = chart.addLineSeries({
      color: ma60Color,
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    ma60Series.setData(
      ma60.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
    );
    ma60SeriesRef.current = ma60Series;

    // Initialize legend with last values
    const lastCandle = candles[candles.length - 1];
    const lastMa20 = ma20[ma20.length - 1];
    const lastMa60 = ma60[ma60.length - 1];
    setLegend({
      open: lastCandle?.open ?? null,
      high: lastCandle?.high ?? null,
      low: lastCandle?.low ?? null,
      close: lastCandle?.close ?? null,
      ma20: lastMa20?.value ?? null,
      ma60: lastMa60?.value ?? null,
    });

    // Subscribe crosshair
    chart.subscribeCrosshairMove(handleCrosshairMove);

    chart.timeScale().fitContent();

    // Resize handler
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 450,
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

        candleSeries.applyOptions({
          upColor: newTheme.candle.up,
          downColor: newTheme.candle.down,
          wickUpColor: newTheme.candle.wickUp,
          wickDownColor: newTheme.candle.wickDown,
        });

        ma20Series.applyOptions({
          color: isDarkNow ? '#60a5fa' : '#3b82f6',
        });
        ma60Series.applyOptions({
          color: isDarkNow ? '#fbbf24' : '#f59e0b',
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
  }, [candles, ma20, ma60, handleCrosshairMove]);

  const fmt = (v: number | null) => v !== null ? v.toFixed(2) : '-';

  return (
    <div className="w-full h-full relative">
      <div ref={chartContainerRef} className="w-full h-full" />
      {/* Legend */}
      <div className="absolute top-2 left-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded px-2.5 py-1.5 pointer-events-none">
        <span className="font-semibold text-gray-800 dark:text-gray-200">SOXL</span>
        <span className="text-gray-500 dark:text-gray-400">
          O <span className="text-gray-800 dark:text-gray-200 font-medium">{fmt(legend.open)}</span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          H <span className="text-gray-800 dark:text-gray-200 font-medium">{fmt(legend.high)}</span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          L <span className="text-gray-800 dark:text-gray-200 font-medium">{fmt(legend.low)}</span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          C <span className="text-gray-800 dark:text-gray-200 font-medium">{fmt(legend.close)}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-blue-500 dark:bg-blue-400 rounded-full" />
          <span className="text-blue-600 dark:text-blue-400">MA20</span>
          <span className="text-gray-800 dark:text-gray-200 font-medium">{fmt(legend.ma20)}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-amber-500 dark:bg-amber-400 rounded-full" />
          <span className="text-amber-600 dark:text-amber-400">MA60</span>
          <span className="text-gray-800 dark:text-gray-200 font-medium">{fmt(legend.ma60)}</span>
        </span>
      </div>
    </div>
  );
}
