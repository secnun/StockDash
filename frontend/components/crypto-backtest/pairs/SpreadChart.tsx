'use client';

import { useEffect, useRef } from 'react';
import { createChart, UTCTimestamp, IChartApi } from 'lightweight-charts';
import { getChartTheme, isDarkMode } from '@/lib/theme/chartTheme';
import { SpreadData } from './mockPairData';

interface SpreadChartProps {
  spreadDataList: SpreadData[];
}

/**
 * 선행/후행 스프레드 차트
 * base ROC - compare ROC를 영역 차트로 표시
 * 양수(초록): 기준 시장 선행
 * 음수(빨강): 비교 시장 선행
 */
export default function SpreadChart({ spreadDataList }: SpreadChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || spreadDataList.length === 0) return;

    const isDark = isDarkMode();
    const theme = getChartTheme(isDark);

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 200,
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
        mode: 1,
      },
    });

    chartRef.current = chart;

    // 각 스프레드 데이터에 대해 baseline 시리즈 추가
    spreadDataList.forEach((spreadData) => {
      // Baseline series: 0 기준으로 양수/음수 다른 색상
      const baselineSeries = chart.addBaselineSeries({
        baseValue: { type: 'price', price: 0 },
        topLineColor: '#22c55e', // 초록 (기준 선행)
        topFillColor1: 'rgba(34, 197, 94, 0.3)',
        topFillColor2: 'rgba(34, 197, 94, 0.05)',
        bottomLineColor: '#ef4444', // 빨강 (비교 선행)
        bottomFillColor1: 'rgba(239, 68, 68, 0.05)',
        bottomFillColor2: 'rgba(239, 68, 68, 0.3)',
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: false,
        priceFormat: {
          type: 'custom',
          formatter: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`,
          minMove: 0.01,
        },
      });

      const baselineData = spreadData.data.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.spread,
      }));

      baselineSeries.setData(baselineData);
    });

    chart.timeScale().fitContent();

    // 반응형 처리
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 200,
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
  }, [spreadDataList]);

  return (
    <div className="w-full h-full relative">
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
