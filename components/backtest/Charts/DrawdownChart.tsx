'use client';

import { useEffect, useRef } from 'react';
import { createChart, UTCTimestamp } from 'lightweight-charts';

interface DrawdownChartProps {
  equity: { time: number; value: number }[];
}

export default function DrawdownChart({ equity }: DrawdownChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current || equity.length === 0) return;

    // Drawdown 계산
    const drawdownData = [];
    let maxValue = equity[0].value;

    for (const point of equity) {
      if (point.value > maxValue) {
        maxValue = point.value;
      }

      const drawdown = ((point.value - maxValue) / maxValue) * 100;

      drawdownData.push({
        time: point.time as UTCTimestamp,
        value: drawdown,
      });
    }

    // 차트 생성
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 200,
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

    // Area 시리즈 추가
    const areaSeries = chart.addAreaSeries({
      lineColor: '#ef5350',
      topColor: 'rgba(239, 83, 80, 0.4)',
      bottomColor: 'rgba(239, 83, 80, 0.0)',
      lineWidth: 2,
    });

    areaSeries.setData(drawdownData);

    // 0 라인 추가를 위한 라인 시리즈
    const zeroLine = chart.addLineSeries({
      color: '#000000',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      priceLineVisible: false,
    });

    zeroLine.setData([
      { time: drawdownData[0].time as UTCTimestamp, value: 0 },
      { time: drawdownData[drawdownData.length - 1].time as UTCTimestamp, value: 0 },
    ]);

    // 차트 자동 피팅
    chart.timeScale().fitContent();

    // 반응형 처리
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // 클린업
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [equity]);

  return (
    <div className="w-full">
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
