'use client';

import { useState } from 'react';
import {
  DongpaMode,
  DongpaTrigger,
  DongpaBacktestResponse,
  DongpaIndicatorInfo,
  DongpaConfig,
  MODE_COLORS,
  ModeId,
  OPERATOR_LABELS,
} from '@/types/dongpa';
import { runDongpaBacktest } from '@/lib/api/client';
import DongpaRuleBuilder from './DongpaRuleBuilder';

interface DongpaBacktestTabProps {
  modes: DongpaMode[];
  triggers: DongpaTrigger[];
  onTriggersChange: (triggers: DongpaTrigger[]) => void;
  defaultModeId: string;
  onDefaultModeIdChange: (v: string) => void;
  qqqMaPeriod: number;
  positionHandling: 'carry' | 'liquidate';
  indicators: DongpaIndicatorInfo[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  applyFee: boolean;
  result: DongpaBacktestResponse | null;
  onResultChange: (r: DongpaBacktestResponse | null) => void;
  loading: boolean;
  onLoadingChange: (v: boolean) => void;
}

export default function DongpaBacktestTab({
  modes,
  triggers,
  onTriggersChange,
  defaultModeId,
  onDefaultModeIdChange,
  qqqMaPeriod,
  positionHandling,
  indicators,
  startDate,
  endDate,
  initialCapital,
  applyFee,
  result,
  onResultChange,
  loading,
  onLoadingChange,
}: DongpaBacktestTabProps) {
  const [error, setError] = useState<string | null>(null);

  const handleRunBacktest = async () => {
    setError(null);
    onLoadingChange(true);
    try {
      const config: DongpaConfig = {
        modes,
        triggers,
        defaultModeId,
        qqqMaPeriod,
        positionHandling,
      };
      const res = await runDongpaBacktest({
        tickerId: 'SOXL',
        startDate,
        endDate,
        initialCapital,
        applyFee,
        market: 'us',
        dongpaConfig: config,
      });
      onResultChange(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : '백테스트 실패');
      onResultChange(null);
    } finally {
      onLoadingChange(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 룰 빌더 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">모드 전환 규칙</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 dark:text-gray-400">기본 모드</label>
            <select
              value={defaultModeId}
              onChange={(e) => onDefaultModeIdChange(e.target.value)}
              className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {modes.map((m) => (
                <option key={m.modeId} value={m.modeId}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        <DongpaRuleBuilder
          triggers={triggers}
          onTriggersChange={onTriggersChange}
          modes={modes}
          indicators={indicators}
        />
      </div>

      {/* 실행 버튼 */}
      <button
        onClick={handleRunBacktest}
        disabled={loading}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {loading ? '실행 중...' : '백테스트 실행'}
      </button>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className="space-y-4">
          {/* 메트릭 카드 */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: '수익률', value: `${result.metrics.totalReturn.toFixed(1)}%`, color: result.metrics.totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
              { label: 'CAGR', value: `${result.metrics.cagr.toFixed(1)}%`, color: 'text-gray-900 dark:text-white' },
              { label: 'MDD', value: `${result.metrics.mdd.toFixed(1)}%`, color: 'text-red-600 dark:text-red-400' },
              { label: 'Sharpe', value: result.metrics.sharpeRatio.toFixed(2), color: 'text-gray-900 dark:text-white' },
              { label: '승률', value: `${result.metrics.winRate.toFixed(1)}%`, color: 'text-gray-900 dark:text-white' },
              { label: '전환', value: `${result.modeEvents.length}회`, color: 'text-gray-900 dark:text-white' },
            ].map((m) => (
              <div key={m.label} className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 text-center">
                <div className="text-xs text-gray-500 dark:text-gray-400">{m.label}</div>
                <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* 구간 결과 */}
          {result.segments.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">구간별 성과</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400">#</th>
                      <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400">모드</th>
                      <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400">기간</th>
                      <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">수익률</th>
                      <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">MDD</th>
                      <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">거래</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {result.segments.map((seg, idx) => {
                      const colors = MODE_COLORS[seg.modeId as ModeId] || MODE_COLORS.safe;
                      const startStr = new Date(seg.startTime * 1000).toLocaleDateString();
                      const endStr = new Date(seg.endTime * 1000).toLocaleDateString();
                      return (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors.badge}`}>
                              {seg.modeName}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{startStr} ~ {endStr}</td>
                          <td className={`px-3 py-2 text-right font-mono ${seg.segmentReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {seg.segmentReturn.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-red-600 dark:text-red-400">
                            {seg.segmentMdd.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400">
                            {seg.tradeCount}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 전환 이벤트 */}
          {result.modeEvents.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">모드 전환 이벤트</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400">날짜</th>
                      <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400">전환</th>
                      <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400">사유</th>
                      <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">포트폴리오</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {result.modeEvents.map((evt, idx) => {
                      const fromColors = MODE_COLORS[evt.fromModeId as ModeId] || MODE_COLORS.safe;
                      const toColors = MODE_COLORS[evt.toModeId as ModeId] || MODE_COLORS.safe;
                      const fromMode = modes.find((m) => m.modeId === evt.fromModeId);
                      const toMode = modes.find((m) => m.modeId === evt.toModeId);
                      return (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                            {new Date(evt.time * 1000).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${fromColors.badge}`}>
                              {fromMode?.name || evt.fromModeId}
                            </span>
                            <span className="mx-1 text-gray-400">&rarr;</span>
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${toColors.badge}`}>
                              {toMode?.name || evt.toModeId}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{evt.triggerName}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-white">
                            ${evt.portfolioValue.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 실행 시간 */}
          <div className="text-xs text-gray-400 text-right">
            실행 시간: {result.executionTime.toFixed(0)}ms
          </div>
        </div>
      )}
    </div>
  );
}
