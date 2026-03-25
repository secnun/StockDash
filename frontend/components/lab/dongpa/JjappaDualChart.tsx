'use client';

import { useEffect, useRef } from 'react';
import { createChart, UTCTimestamp, IChartApi, MouseEventParams, ISeriesApi, SeriesType } from 'lightweight-charts';
import { getChartTheme, isDarkMode } from '@/lib/theme/chartTheme';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Props {
  qqqCandles: CandleData[];
  soxlCandles: CandleData[];
  collapsed: boolean;
}

export default function JjappaDualChart({ qqqCandles, soxlCandles, collapsed }: Props) {
  const qqqContainerRef = useRef<HTMLDivElement>(null);
  const soxlContainerRef = useRef<HTMLDivElement>(null);
  const qqqChartRef = useRef<IChartApi | null>(null);
  const soxlChartRef = useRef<IChartApi | null>(null);
  const qqqSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const soxlSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const isSyncing = useRef(false);

  useEffect(() => {
    if (collapsed || !qqqContainerRef.current || !soxlContainerRef.current) return;
    if (qqqCandles.length === 0 || soxlCandles.length === 0) return;

    const isDark = isDarkMode();
    const theme = getChartTheme(isDark);

    const makeChartOptions = (container: HTMLDivElement, height: number) => ({
      width: container.clientWidth,
      height,
      layout: { background: { color: theme.background }, textColor: theme.text },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      timeScale: { timeVisible: false, secondsVisible: false },
      rightPriceScale: { scaleMargins: { top: 0.05, bottom: 0.05 }, minimumWidth: 70 },
      crosshair: { mode: 0 as const },
    });

    const candleOpts = {
      upColor: theme.candle.up, downColor: theme.candle.down,
      wickUpColor: theme.candle.wickUp, wickDownColor: theme.candle.wickDown,
      borderVisible: false,
    };

    // QQQ chart
    const qqqChart = createChart(qqqContainerRef.current, makeChartOptions(qqqContainerRef.current, 200));
    qqqChartRef.current = qqqChart;
    const qqqSeries = qqqChart.addCandlestickSeries(candleOpts);
    qqqSeries.setData(qqqCandles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    qqqSeriesRef.current = qqqSeries;

    // SOXL chart
    const soxlChart = createChart(soxlContainerRef.current, makeChartOptions(soxlContainerRef.current, 200));
    soxlChartRef.current = soxlChart;
    const soxlSeries = soxlChart.addCandlestickSeries(candleOpts);
    soxlSeries.setData(soxlCandles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    soxlSeriesRef.current = soxlSeries;

    // SOXL 일봉 timestamp → 인덱스 맵 (빠른 조회용)
    const soxlTimeIndex = new Map<number, number>();
    soxlCandles.forEach((c, i) => soxlTimeIndex.set(c.time, i));

    // QQQ 주봉 timestamp → 인덱스 맵
    const qqqTimeIndex = new Map<number, number>();
    qqqCandles.forEach((c, i) => qqqTimeIndex.set(c.time, i));

    // QQQ 주봉 날짜 → 해당 주의 SOXL 일봉 중 가장 가까운 날짜 찾기
    // QQQ hover → SOXL: QQQ 주봉 시작일(월요일) 이후 가장 가까운 SOXL 일봉
    const findClosestSoxlTime = (qqqTime: number): number | null => {
      // qqqTime 이후 7일 이내에서 가장 가까운 SOXL 캔들 찾기
      for (let offset = 0; offset <= 6; offset++) {
        const targetTs = qqqTime + offset * 86400;
        if (soxlTimeIndex.has(targetTs)) return targetTs;
      }
      // 못 찾으면 이전 방향으로
      for (let offset = 1; offset <= 3; offset++) {
        const targetTs = qqqTime - offset * 86400;
        if (soxlTimeIndex.has(targetTs)) return targetTs;
      }
      return null;
    };

    // SOXL hover → QQQ: 해당 일봉이 속하는 주의 QQQ 주봉 찾기
    const findClosestQqqTime = (soxlTime: number): number | null => {
      // soxlTime 이전 7일 이내에서 QQQ 주봉 찾기 (주봉은 주 시작일)
      for (let offset = 0; offset <= 6; offset++) {
        const targetTs = soxlTime - offset * 86400;
        if (qqqTimeIndex.has(targetTs)) return targetTs;
      }
      return null;
    };

    // Crosshair sync: QQQ → SOXL
    qqqChart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      if (!param.time) {
        soxlChart.clearCrosshairPosition();
      } else {
        const qqqTs = typeof param.time === 'number' ? param.time : 0;
        const soxlTs = findClosestSoxlTime(qqqTs);
        if (soxlTs !== null) {
          soxlChart.setCrosshairPosition(NaN, soxlTs as UTCTimestamp, soxlSeries);
        }
      }
      isSyncing.current = false;
    });

    // Crosshair sync: SOXL → QQQ
    soxlChart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      if (!param.time) {
        qqqChart.clearCrosshairPosition();
      } else {
        const soxlTs = typeof param.time === 'number' ? param.time : 0;
        const qqqTs = findClosestQqqTime(soxlTs);
        if (qqqTs !== null) {
          qqqChart.setCrosshairPosition(NaN, qqqTs as UTCTimestamp, qqqSeries);
        }
      }
      isSyncing.current = false;
    });

    qqqChart.timeScale().fitContent();
    soxlChart.timeScale().fitContent();

    // Resize
    const handleResize = () => {
      if (qqqContainerRef.current && qqqChartRef.current) {
        qqqChartRef.current.applyOptions({ width: qqqContainerRef.current.clientWidth });
      }
      if (soxlContainerRef.current && soxlChartRef.current) {
        soxlChartRef.current.applyOptions({ width: soxlContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    // Dark mode
    const observer = new MutationObserver(() => {
      const isDarkNow = isDarkMode();
      const t = getChartTheme(isDarkNow);
      const opts = { layout: { background: { color: t.background }, textColor: t.text }, grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } } };
      const cOpts = { upColor: t.candle.up, downColor: t.candle.down, wickUpColor: t.candle.wickUp, wickDownColor: t.candle.wickDown };
      qqqChartRef.current?.applyOptions(opts);
      soxlChartRef.current?.applyOptions(opts);
      qqqSeries.applyOptions(cOpts);
      soxlSeries.applyOptions(cOpts);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      qqqChart.remove();
      soxlChart.remove();
    };
  }, [qqqCandles, soxlCandles, collapsed]);

  if (collapsed) return null;

  return (
    <div className="space-y-1">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden relative">
        <div className="absolute top-2 left-3 z-10 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80 px-2 py-0.5 rounded">
          QQQ 주봉
        </div>
        <div ref={qqqContainerRef} className="w-full h-[200px]" />
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden relative">
        <div className="absolute top-2 left-3 z-10 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80 px-2 py-0.5 rounded">
          SOXL 일봉
        </div>
        <div ref={soxlContainerRef} className="w-full h-[200px]" />
      </div>
    </div>
  );
}
