'use client';

import { useEffect, useRef } from 'react';
import { createChart, UTCTimestamp, IChartApi } from 'lightweight-charts';
import { getChartTheme, isDarkMode } from '@/lib/theme/chartTheme';
import { PremiumData } from './mockPairData';

interface PremiumChartProps {
  basePairLabel: string;
  premiumData: PremiumData[];
}

/**
 * 프리미엄 차트 (기준 페어 대비 상대 프리미엄)
 * 김치 프리미엄 등 마켓 간 괴리 분석용
 */
export default function PremiumChart({ basePairLabel, premiumData }: PremiumChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || premiumData.length === 0) return;

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
          top: 0.2,
          bottom: 0.2,
        },
        minimumWidth: 60,
      },
      crosshair: {
        mode: 1,
      },
    });

    chartRef.current = chart;

    // 0% 기준선 (기준 페어)
    const zeroLineSeries = chart.addLineSeries({
      color: theme.zeroLine,
      lineWidth: 1,
      lineStyle: 2,
      lastValueVisible: false,
      priceLineVisible: false,
      title: `${basePairLabel} (기준)`,
    });

    // 전체 시간 범위 찾기
    let minTime = Infinity;
    let maxTime = -Infinity;
    premiumData.forEach((premium) => {
      premium.data.forEach((point) => {
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

    // 각 페어의 프리미엄 라인/영역 추가
    premiumData.forEach((premium) => {
      // Area 시리즈로 프리미엄 영역 표시
      const areaSeries = chart.addAreaSeries({
        lineColor: premium.color,
        topColor: `${premium.color}40`, // 40% opacity
        bottomColor: `${premium.color}10`, // 10% opacity
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: false,
        title: premium.label,
        priceFormat: {
          type: 'custom',
          formatter: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`,
          minMove: 0.01,
        },
      });

      const areaData = premium.data.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.premium,
      }));

      areaSeries.setData(areaData);
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
  }, [basePairLabel, premiumData]);

  return (
    <div className="w-full h-full relative">
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
