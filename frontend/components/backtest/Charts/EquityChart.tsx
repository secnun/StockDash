'use client';

import { useEffect, useRef } from 'react';
import { createChart, UTCTimestamp, IChartApi } from 'lightweight-charts';
import { getChartTheme, isDarkMode } from '@/lib/theme/chartTheme';
import { OHLCV } from '@/types/backtest';

interface EquityChartProps {
  equity: { time: number; value: number }[];
  initialCapital: number;
  priceData?: OHLCV[];
}

// MDD 지점 계산 (마커용)
function findMDDPoints(equity: { time: number; value: number }[]) {
  let maxValue = equity[0]?.value || 0;
  let mddValue = 0;
  let mddPeakTime = equity[0]?.time || 0;
  let mddTroughTime = equity[0]?.time || 0;

  for (const point of equity) {
    if (point.value > maxValue) {
      maxValue = point.value;
    }
    const drawdown = ((point.value - maxValue) / maxValue) * 100;
    if (drawdown < mddValue) {
      mddValue = drawdown;
      mddTroughTime = point.time;
    }
  }

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

  return { mdd: mddValue, mddPeakTime, mddTroughTime };
}

export default function EquityChart({ equity, initialCapital, priceData }: EquityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || equity.length === 0) return;

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

    // Equity 데이터 변환
    const lineData = equity.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.value,
    }));

    // MDD 지점 계산
    const { mdd, mddPeakTime, mddTroughTime } = findMDDPoints(equity);

    // Equity 곡선 (Baseline)
    const equitySeries = chart.addBaselineSeries({
      baseValue: { type: 'price', price: initialCapital },
      topLineColor: theme.equity.positive,
      topFillColor1: theme.equity.positiveFill1,
      topFillColor2: theme.equity.positiveFill2,
      bottomLineColor: theme.equity.negative,
      bottomFillColor1: theme.equity.negativeFill1,
      bottomFillColor2: theme.equity.negativeFill2,
      lineWidth: 2,
      priceScaleId: 'right',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
        minMove: 1,
      },
    });
    equitySeries.setData(lineData);

    // MDD 구간 마커 추가
    equitySeries.setMarkers([
      {
        time: mddPeakTime as UTCTimestamp,
        position: 'aboveBar',
        color: theme.markers.mddPeak,
        shape: 'arrowDown',
        text: 'MDD Peak',
      },
      {
        time: mddTroughTime as UTCTimestamp,
        position: 'belowBar',
        color: theme.markers.mddTrough,
        shape: 'arrowUp',
        text: `MDD ${mdd.toFixed(2)}%`,
      },
    ]);

    // 가격 오버레이 (priceData가 있을 때만)
    if (hasPriceData) {
      const priceSeries = chart.addLineSeries({
        priceScaleId: 'left',
        color: theme.price.line,
        lineWidth: 1,
        lastValueVisible: true,
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
          minMove: 0.01,
        },
      });

      const priceLineData = priceData.map((d) => ({
        time: d.time as UTCTimestamp,
        value: d.close,
      }));
      priceSeries.setData(priceLineData);
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
  }, [equity, initialCapital, priceData]);

  return (
    <div className="w-full h-full relative">
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
