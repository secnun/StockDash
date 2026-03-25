'use client';

import { useEffect, useRef } from 'react';
import { createChart, IChartApi } from 'lightweight-charts';

interface EquityPoint {
  time: number;
  value: number;
}

interface Props {
  compoundEquity: EquityPoint[];
  baselineEquity: EquityPoint[];
}

export default function ComparisonChart({ compoundEquity, baselineEquity }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || compoundEquity.length === 0) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: 'transparent' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: 'rgba(156, 163, 175, 0.1)' },
        horzLines: { color: 'rgba(156, 163, 175, 0.1)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(156, 163, 175, 0.2)',
      },
      timeScale: {
        borderColor: 'rgba(156, 163, 175, 0.2)',
        timeVisible: false,
      },
      crosshair: {
        mode: 0,
      },
    });
    chartRef.current = chart;

    // 비대칭 복리 적용 라인
    const compoundSeries = chart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 2,
      title: '비대칭 복리',
    });
    compoundSeries.setData(
      compoundEquity.map((e) => ({
        time: e.time as any,
        value: e.value,
      }))
    );

    // 기본 (미적용) 라인
    const baselineSeries = chart.addLineSeries({
      color: '#9ca3af',
      lineWidth: 1,
      lineStyle: 2,
      title: '기본',
    });
    baselineSeries.setData(
      baselineEquity.map((e) => ({
        time: e.time as any,
        value: e.value,
      }))
    );

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [compoundEquity, baselineEquity]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex items-center gap-4 mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">에쿼티 커브 비교</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-blue-500 inline-block" />
            비대칭 복리
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-gray-400 inline-block" style={{ borderTop: '1px dashed' }} />
            기본
          </span>
        </div>
      </div>
      <div ref={containerRef} />
    </div>
  );
}
