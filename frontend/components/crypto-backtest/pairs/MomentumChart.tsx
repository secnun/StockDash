'use client';

import { useEffect, useRef } from 'react';
import { createChart, UTCTimestamp, IChartApi } from 'lightweight-charts';
import { getChartTheme, isDarkMode } from '@/lib/theme/chartTheme';
import { RocData } from './mockPairData';

interface MomentumChartProps {
  rocDataList: RocData[];
  rocPeriod: number;
}

/**
 * 모멘텀 (ROC) 비교 차트
 * 각 시장의 N일 변화율을 라인 차트로 오버레이
 */
export default function MomentumChart({ rocDataList, rocPeriod }: MomentumChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || rocDataList.length === 0) return;

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

    // 0% 기준선
    const zeroLineSeries = chart.addLineSeries({
      color: theme.zeroLine,
      lineWidth: 1,
      lineStyle: 2,
      lastValueVisible: false,
      priceLineVisible: false,
      title: '0%',
    });

    // 전체 시간 범위 찾기
    let minTime = Infinity;
    let maxTime = -Infinity;
    rocDataList.forEach((rocData) => {
      rocData.data.forEach((point) => {
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

    // 각 페어의 ROC 라인 추가
    rocDataList.forEach((rocData) => {
      const lineSeries = chart.addLineSeries({
        color: rocData.color,
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: false,
        title: rocData.label,
        priceFormat: {
          type: 'custom',
          formatter: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`,
          minMove: 0.01,
        },
      });

      const lineData = rocData.data.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.roc,
      }));

      lineSeries.setData(lineData);
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
  }, [rocDataList, rocPeriod]);

  return (
    <div className="w-full h-full relative">
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
