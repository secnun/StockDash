'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTheme } from 'next-themes';
import * as d3 from 'd3';
import { fetchDashboardHeatmap } from '@/lib/api/client';
import { HeatmapStrategyItem, HeatmapResponse } from '@/types/dashboard';

/** Use backend strategyName directly — no frontend override needed */

function getColor(ytdReturn: number, isDark: boolean): string {
  if (ytdReturn >= 0) {
    const t = Math.min(ytdReturn / 40, 1);
    if (isDark) {
      // dark: from #1a3a2a to #22c55e
      return d3.interpolateRgb('#1e3a2a', '#22c55e')(t * 0.85 + 0.15);
    }
    return d3.interpolateRgb('#dcfce7', '#15803d')(t * 0.85 + 0.15);
  } else {
    const t = Math.min(Math.abs(ytdReturn) / 40, 1);
    if (isDark) {
      return d3.interpolateRgb('#3a1a1a', '#ef4444')(t * 0.85 + 0.15);
    }
    return d3.interpolateRgb('#fecaca', '#b91c1c')(t * 0.85 + 0.15);
  }
}

function getTextColor(ytdReturn: number, isDark: boolean): string {
  if (isDark) return '#fff';
  const t = Math.min(Math.abs(ytdReturn) / 40, 1);
  return t > 0.4 ? '#fff' : '#111';
}

function formatCurrency(v: number): string {
  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatPercent(v: number): string {
  const sign = v >= 0 ? '+' : '';
  return sign + v.toFixed(2) + '%';
}

const StrategyHeatmap = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && (theme === 'dark' || resolvedTheme === 'dark');

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDashboardHeatmap()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Render treemap
  const renderTreemap = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !data || !mounted) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = Math.max(280, Math.min(width * 0.38, 400));

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const strategies = data.strategies;
    if (strategies.length === 0) return;

    // Build hierarchy — use currentSeed as value, with a minimum so negative returns are still visible
    const root = d3
      .hierarchy<{ children: HeatmapStrategyItem[] } | HeatmapStrategyItem>({
        children: strategies,
      } as { children: HeatmapStrategyItem[] })
      .sum((d) => {
        const item = d as HeatmapStrategyItem;
        return item.currentSeed != null ? Math.max(item.currentSeed, data.initialCapital * 0.3) : 0;
      })
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3.treemap<{ children: HeatmapStrategyItem[] } | HeatmapStrategyItem>()
      .size([width, height])
      .padding(3)
      .round(true)(root);

    const leaves = root.leaves();

    // Draw rectangles
    const cells = svg
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<HeatmapStrategyItem>>('g')
      .data(leaves as d3.HierarchyRectangularNode<HeatmapStrategyItem>[])
      .enter()
      .append('g')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`);

    cells
      .append('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d) => Math.max(0, d.y1 - d.y0))
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', (d) => getColor(d.data.ytdReturn, isDark))
      .attr('stroke', isDark ? '#374151' : '#e5e7eb')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer');

    // Strategy name text
    cells
      .append('text')
      .attr('x', (d) => (d.x1 - d.x0) / 2)
      .attr('y', (d) => (d.y1 - d.y0) / 2 - 10)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', (d) => getTextColor(d.data.ytdReturn, isDark))
      .attr('font-weight', '700')
      .attr('font-size', (d) => {
        const w = d.x1 - d.x0;
        if (w > 180) return '16px';
        if (w > 120) return '14px';
        if (w > 80) return '12px';
        return '10px';
      })
      .text((d) => {
        const w = d.x1 - d.x0;
        if (w < 50) return '';
        return d.data.strategyName;
      });

    // Return % text
    cells
      .append('text')
      .attr('x', (d) => (d.x1 - d.x0) / 2)
      .attr('y', (d) => (d.y1 - d.y0) / 2 + 12)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', (d) => getTextColor(d.data.ytdReturn, isDark))
      .attr('font-weight', '600')
      .attr('font-size', (d) => {
        const w = d.x1 - d.x0;
        if (w > 180) return '20px';
        if (w > 120) return '16px';
        if (w > 80) return '13px';
        return '11px';
      })
      .text((d) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 50 || h < 40) return '';
        return formatPercent(d.data.ytdReturn);
      });

    // Ticker badge text
    cells
      .append('text')
      .attr('x', (d) => (d.x1 - d.x0) / 2)
      .attr('y', (d) => (d.y1 - d.y0) / 2 + 32)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', (d) => getTextColor(d.data.ytdReturn, isDark))
      .attr('font-size', '10px')
      .attr('opacity', 0.7)
      .text((d) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 80 || h < 60) return '';
        return d.data.representativeTicker;
      });

    // Tooltip interactions
    const tooltip = d3.select(tooltipRef.current);

    cells
      .on('mouseenter', (event, d) => {
        const item = d.data;
        const monthly = item.monthlyBreakdown
          .map(
            (m) =>
              `<tr>
                <td class="pr-4 text-gray-500">${m.month}</td>
                <td class="pr-4 font-medium ${m.totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}">${formatPercent(m.totalReturn)}</td>
                <td class="font-medium text-orange-500">-${m.mdd.toFixed(1)}%</td>
              </tr>`
          )
          .join('');

        tooltip.html(`
          <div class="font-bold text-base mb-2 pb-2 border-b ${isDark ? 'border-gray-600' : 'border-gray-200'}">
            ${item.strategyName}
            <span class="ml-2 text-xs font-normal opacity-70">${item.representativeTicker}</span>
          </div>
          <table class="text-xs w-full mb-3">
            <thead>
              <tr class="text-gray-400">
                <th class="text-left pr-4 pb-1 font-medium">월</th>
                <th class="text-left pr-4 pb-1 font-medium">수익률</th>
                <th class="text-left pb-1 font-medium">MDD</th>
              </tr>
            </thead>
            <tbody>${monthly}</tbody>
          </table>
          <div class="pt-2 border-t ${isDark ? 'border-gray-600' : 'border-gray-200'} grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div>
              <span class="text-gray-400">YTD 수익률</span>
              <span class="ml-1 font-bold ${item.ytdReturn >= 0 ? 'text-green-500' : 'text-red-500'}">${formatPercent(item.ytdReturn)}</span>
            </div>
            <div>
              <span class="text-gray-400">현재 시드</span>
              <span class="ml-1 font-bold">${formatCurrency(item.currentSeed)}</span>
            </div>
            <div>
              <span class="text-gray-400">최대 MDD</span>
              <span class="ml-1 font-bold text-orange-500">-${item.maxMdd.toFixed(1)}%</span>
            </div>
            <div>
              <span class="text-gray-400">승률</span>
              <span class="ml-1 font-bold">${item.winRate.toFixed(1)}%</span>
            </div>
          </div>
          <div class="mt-2 pt-2 border-t ${isDark ? 'border-gray-600' : 'border-gray-200'} text-[10px] text-gray-400">
            대표: ${item.representativeTicker} / ${item.altTicker} ${formatPercent(item.altYtdReturn)}
          </div>
        `);

        tooltip.style('opacity', '1').style('pointer-events', 'auto');
      })
      .on('mousemove', (event) => {
        const containerRect = container.getBoundingClientRect();
        const tooltipEl = tooltipRef.current;
        if (!tooltipEl) return;

        const mouseX = event.clientX - containerRect.left;
        const mouseY = event.clientY - containerRect.top;
        const tw = tooltipEl.offsetWidth;
        const th = tooltipEl.offsetHeight;

        let left = mouseX + 16;
        let top = mouseY - 16;

        // Keep tooltip within container bounds
        if (left + tw > containerRect.width) {
          left = mouseX - tw - 16;
        }
        if (top + th > containerRect.height) {
          top = containerRect.height - th - 8;
        }
        if (top < 0) top = 8;

        tooltip.style('left', `${left}px`).style('top', `${top}px`);
      })
      .on('mouseleave', () => {
        tooltip.style('opacity', '0').style('pointer-events', 'none');
      });
  }, [data, isDark, mounted]);

  // Render on data/theme change
  useEffect(() => {
    renderTreemap();
  }, [renderTreemap]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => renderTreemap());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [renderTreemap]);

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Performance Matrix</h1>
        </div>
        <div className="flex items-center justify-center h-72 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">전략 백테스트 실행 중...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Performance Matrix</h1>
        </div>
        <div className="flex items-center justify-center h-72 bg-white dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-800">
          <div className="text-center text-red-500">
            <p className="text-lg font-semibold mb-1">데이터 로드 실패</p>
            <p className="text-sm opacity-80">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
        Performance Matrix
      </h1>

      {/* Treemap */}
      <div
        ref={containerRef}
        className="relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <svg ref={svgRef} className="w-full" />
        <div
          ref={tooltipRef}
          className="absolute opacity-0 pointer-events-none transition-opacity duration-150 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl p-3 min-w-[240px] max-w-[320px]"
          style={{ top: 0, left: 0 }}
        />
        {data && (
          <div className="absolute bottom-2 right-3 text-[10px] text-gray-400 dark:text-gray-500">
            초기자본 {formatCurrency(data.initialCapital)} | YTD {new Date().getFullYear()}
          </div>
        )}
      </div>
    </div>
  );
};

export default StrategyHeatmap;
