'use client';

import { useEffect, useRef } from 'react';
import { createChart, UTCTimestamp, IChartApi } from 'lightweight-charts';

interface EquityChartProps {
  equity: { time: number; value: number }[];
  initialCapital: number;
}

// Drawdown 데이터 계산
function calculateDrawdown(equity: { time: number; value: number }[]) {
  let maxValue = equity[0]?.value || 0;
  let mddValue = 0;
  let mddPeakTime = equity[0]?.time || 0;
  let mddTroughTime = equity[0]?.time || 0;

  const drawdownData = equity.map((point) => {
    if (point.value > maxValue) {
      maxValue = point.value;
    }
    const drawdown = ((point.value - maxValue) / maxValue) * 100; // 음수 값

    // MDD 추적
    if (drawdown < mddValue) {
      mddValue = drawdown;
      mddTroughTime = point.time;
    }

    return {
      time: point.time as UTCTimestamp,
      value: drawdown,
    };
  });

  // MDD 고점 찾기
  let currentMax = equity[0]?.value || 0;
  for (const point of equity) {
    if (point.value > currentMax) {
      currentMax = point.value;
      mddPeakTime = point.time;
    }
    const dd = ((point.value - currentMax) / currentMax) * 100;
    if (Math.abs(dd - mddValue) < 0.0001) {
      break;
    }
  }

  return {
    data: drawdownData,
    mdd: mddValue,
    mddPeakTime,
    mddTroughTime,
  };
}

export default function EquityChart({ equity, initialCapital }: EquityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || equity.length === 0) return;

    const isDark = document.documentElement.classList.contains('dark');
    const bgColor = isDark ? '#1f2937' : '#ffffff';
    const textColor = isDark ? '#9ca3af' : '#333333';
    const gridColor = isDark ? '#374151' : '#f0f0f0';

    // 차트 생성
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 500,
      layout: {
        background: { color: bgColor },
        textColor: textColor,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        scaleMargins: {
          top: 0.1,
          bottom: 0.4, // Drawdown 영역을 위한 공간
        },
      },
    });

    chartRef.current = chart;

    // Equity 데이터 변환
    const lineData = equity.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.value,
    }));

    // Drawdown 계산
    const { data: drawdownData, mdd, mddPeakTime, mddTroughTime } = calculateDrawdown(equity);

    // Equity 곡선 (Baseline)
    const equitySeries = chart.addBaselineSeries({
      baseValue: { type: 'price', price: initialCapital },
      topLineColor: '#22c55e',
      topFillColor1: 'rgba(34, 197, 94, 0.28)',
      topFillColor2: 'rgba(34, 197, 94, 0.05)',
      bottomLineColor: '#ef4444',
      bottomFillColor1: 'rgba(239, 68, 68, 0.05)',
      bottomFillColor2: 'rgba(239, 68, 68, 0.28)',
      lineWidth: 2,
      priceScaleId: 'right',
    });
    equitySeries.setData(lineData);

    // MDD 구간 마커 추가
    equitySeries.setMarkers([
      {
        time: mddPeakTime as UTCTimestamp,
        position: 'aboveBar',
        color: '#f97316',
        shape: 'arrowDown',
        text: 'MDD Peak',
      },
      {
        time: mddTroughTime as UTCTimestamp,
        position: 'belowBar',
        color: '#dc2626',
        shape: 'arrowUp',
        text: `MDD ${mdd.toFixed(2)}%`,
      },
    ]);

    // Drawdown 히스토그램 (별도 스케일)
    const drawdownSeries = chart.addHistogramSeries({
      color: '#ef4444',
      priceScaleId: 'drawdown',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(1)}%`,
      },
      crosshairMarkerVisible: true,
      lastValueVisible: true,
    });

    // Drawdown 스케일 설정 (왼쪽에 표시, 하단에 배치)
    chart.priceScale('drawdown').applyOptions({
      scaleMargins: {
        top: 0.7, // 상단 70%는 Equity용
        bottom: 0.05,
      },
      position: 'left',
    });

    drawdownSeries.setData(drawdownData);

    // 차트 자동 피팅
    chart.timeScale().fitContent();

    // 반응형 처리
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 500,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // 다크모드 변경 감지
    const observer = new MutationObserver(() => {
      const isDarkNow = document.documentElement.classList.contains('dark');
      if (chartRef.current) {
        chartRef.current.applyOptions({
          layout: {
            background: { color: isDarkNow ? '#1f2937' : '#ffffff' },
            textColor: isDarkNow ? '#9ca3af' : '#333333',
          },
          grid: {
            vertLines: { color: isDarkNow ? '#374151' : '#f0f0f0' },
            horzLines: { color: isDarkNow ? '#374151' : '#f0f0f0' },
          },
        });
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    // 클린업
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      chart.remove();
    };
  }, [equity, initialCapital]);

  return (
    <div className="w-full h-full relative">
      <div ref={chartContainerRef} className="w-full h-full" />
      {/* 범례 */}
      <div className="absolute top-2 left-2 flex gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-green-500"></div>
          <span className="text-gray-600 dark:text-gray-400">Equity</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-500/50"></div>
          <span className="text-gray-600 dark:text-gray-400">Drawdown</span>
        </div>
      </div>
    </div>
  );
}
