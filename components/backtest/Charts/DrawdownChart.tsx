'use client';

import { useEffect, useRef } from 'react';
import { createChart, UTCTimestamp, IChartApi } from 'lightweight-charts';
import { getChartTheme, isDarkMode } from '@/lib/theme/chartTheme';

interface DrawdownChartProps {
  equity: { time: number; value: number }[];
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
    const drawdown = ((point.value - maxValue) / maxValue) * 100;

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

export default function DrawdownChart({ equity }: DrawdownChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || equity.length === 0) return;

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

    const { data: drawdownData, mdd, mddTroughTime } = calculateDrawdown(equity);

    // Drawdown 히스토그램
    const drawdownSeries = chart.addHistogramSeries({
      color: theme.drawdown.histogram,
      priceScaleId: 'right',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(1)}%`,
        minMove: 0.1,
      },
      lastValueVisible: true,
    });

    drawdownSeries.setData(drawdownData);

    // MDD 마커
    drawdownSeries.setMarkers([
      {
        time: mddTroughTime as UTCTimestamp,
        position: 'belowBar',
        color: theme.markers.mddTrough,
        shape: 'arrowUp',
        text: `MDD ${mdd.toFixed(2)}%`,
      },
    ]);

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
  }, [equity]);

  return (
    <div className="w-full h-full relative">
      <div ref={chartContainerRef} className="w-full h-full" />
      <div className="absolute top-2 left-2 flex items-center gap-1 text-xs bg-white/80 dark:bg-gray-800/80 px-2 py-1 rounded">
        <div className="w-3 h-3 bg-red-500/50"></div>
        <span className="text-gray-700 dark:text-gray-300 font-medium">Drawdown (%)</span>
      </div>
    </div>
  );
}
