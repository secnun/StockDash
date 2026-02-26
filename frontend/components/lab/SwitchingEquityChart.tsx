'use client';

import { useEffect, useRef, useMemo } from 'react';
import { createChart, UTCTimestamp, IChartApi } from 'lightweight-charts';
import { getChartTheme, isDarkMode, SLOT_ZONE_COLORS } from '@/lib/theme/chartTheme';
import { OHLCV } from '@/types/backtest';
import { StrategySlot, SwitchingEvent, SLOT_COLORS, SlotId } from '@/types/switching';

interface SwitchingEquityChartProps {
  equity: { time: number; value: number }[];
  initialCapital: number;
  priceData?: OHLCV[];
  timeline: { time: number; slotId: string }[];
  events: SwitchingEvent[];
  slots: StrategySlot[];
}

function findMDDPoints(equity: { time: number; value: number }[]) {
  let maxValue = equity[0]?.value || 0;
  let mddValue = 0;
  let mddTroughTime = equity[0]?.time || 0;

  for (const point of equity) {
    if (point.value > maxValue) maxValue = point.value;
    const drawdown = ((point.value - maxValue) / maxValue) * 100;
    if (drawdown < mddValue) {
      mddValue = drawdown;
      mddTroughTime = point.time;
    }
  }

  return { mdd: mddValue, mddTroughTime };
}

export default function SwitchingEquityChart({
  equity,
  initialCapital,
  priceData,
  timeline,
  events,
  slots,
}: SwitchingEquityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const lineData = useMemo(
    () => equity.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    [equity],
  );

  const mddPoints = useMemo(() => findMDDPoints(equity), [equity]);

  const priceLineData = useMemo(
    () => priceData?.map((d) => ({ time: d.time as UTCTimestamp, value: d.close })) ?? [],
    [priceData],
  );

  // 슬롯별 구간 데이터 생성
  const zoneDataBySlot = useMemo(() => {
    if (!timeline.length || !equity.length) return {};

    const slotIds = [...new Set(timeline.map((t) => t.slotId))];
    const result: Record<string, { time: UTCTimestamp; value: number }[]> = {};

    for (const slotId of slotIds) {
      result[slotId] = [];
    }

    // timeline과 equity를 매칭
    for (let i = 0; i < Math.min(timeline.length, equity.length); i++) {
      const activeSlot = timeline[i].slotId;
      for (const slotId of slotIds) {
        if (slotId === activeSlot) {
          result[slotId].push({
            time: equity[i].time as UTCTimestamp,
            value: equity[i].value,
          });
        } else {
          // 비활성 슬롯: NaN으로 gap 생성 (또는 skip)
          // lightweight-charts에서 gap을 자연스럽게 처리하도록 값을 넣지 않음
        }
      }
    }

    return result;
  }, [timeline, equity]);

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
        scaleMargins: { top: 0.1, bottom: 0.1 },
        minimumWidth: 80,
      },
      leftPriceScale: {
        visible: hasPriceData,
        scaleMargins: { top: 0.1, bottom: 0.1 },
        minimumWidth: 80,
      },
    });

    chartRef.current = chart;

    // 슬롯별 구간 배경색 Area 시리즈
    for (const [slotId, data] of Object.entries(zoneDataBySlot)) {
      if (data.length === 0) continue;
      const colors = SLOT_ZONE_COLORS[slotId] || SLOT_ZONE_COLORS.A;

      const areaSeries = chart.addAreaSeries({
        topColor: colors.top,
        bottomColor: colors.bottom,
        lineColor: colors.line,
        lineWidth: 1,
        priceScaleId: 'right',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      areaSeries.setData(data);
    }

    // Equity 곡선 (Baseline)
    const equitySeries = chart.addBaselineSeries({
      baseValue: { type: 'price', price: initialCapital },
      topLineColor: theme.equity.positive,
      topFillColor1: 'rgba(0,0,0,0)',
      topFillColor2: 'rgba(0,0,0,0)',
      bottomLineColor: theme.equity.negative,
      bottomFillColor1: 'rgba(0,0,0,0)',
      bottomFillColor2: 'rgba(0,0,0,0)',
      lineWidth: 2,
      priceScaleId: 'right',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
        minMove: 1,
      },
    });
    equitySeries.setData(lineData);

    // MDD + 스위칭 이벤트 마커
    const markers = [
      {
        time: mddPoints.mddTroughTime as UTCTimestamp,
        position: 'belowBar' as const,
        color: theme.markers.mddTrough,
        shape: 'arrowUp' as const,
        text: `MDD ${mddPoints.mdd.toFixed(2)}%`,
      },
      ...events.map((evt) => {
        const targetSlot = slots.find((s) => s.slotId === evt.toSlotId);
        const isAggressive = targetSlot?.name === '공격형';
        return {
          time: evt.time as UTCTimestamp,
          position: 'aboveBar' as const,
          color: isAggressive ? '#ef4444' : (SLOT_ZONE_COLORS[evt.toSlotId]?.line || '#6b7280'),
          shape: 'square' as const,
          text: `${evt.fromSlotId}>${evt.toSlotId}`,
        };
      }),
    ].sort((a, b) => (a.time as number) - (b.time as number));

    equitySeries.setMarkers(markers);

    // 가격 오버레이
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
      priceSeries.setData(priceLineData);
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 350,
        });
      }
    };
    window.addEventListener('resize', handleResize);

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
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      chart.remove();
    };
  }, [equity, initialCapital, priceData, lineData, mddPoints, priceLineData, events, zoneDataBySlot]);

  // 범례
  const slotMap = useMemo(() => {
    const map: Record<string, string> = {};
    slots.forEach((s) => { map[s.slotId] = s.name; });
    return map;
  }, [slots]);

  const activeSlotIds = useMemo(
    () => [...new Set(timeline.map((t) => t.slotId))],
    [timeline],
  );

  return (
    <div className="w-full h-full relative">
      <div ref={chartContainerRef} className="w-full h-full" />
      {/* 범례 */}
      <div className="absolute top-2 left-2 flex items-center gap-2 text-xs bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded px-2.5 py-1.5 pointer-events-none">
        <span className="font-semibold text-gray-800 dark:text-gray-200">Equity</span>
        {activeSlotIds.map((id) => {
          const colors = SLOT_ZONE_COLORS[id] || SLOT_ZONE_COLORS.A;
          return (
            <span key={id} className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: colors.line, opacity: 0.6 }} />
              <span className="text-gray-600 dark:text-gray-400">{id} {slotMap[id] || ''}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
