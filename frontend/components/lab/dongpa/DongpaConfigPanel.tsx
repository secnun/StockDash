'use client';

import { DongpaMode, DongpaBacktestResponse, MODE_COLORS, STRATEGY_OPTIONS, STRATEGY_DEFAULTS, ModeId } from '@/types/dongpa';

interface DongpaConfigPanelProps {
  initialCapitalStr: string;
  onInitialCapitalChange: (v: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  dateRange: { min: string; max: string } | null;
  applyFee: boolean;
  onApplyFeeChange: (v: boolean) => void;
  modes: DongpaMode[];
  onModesChange: (modes: DongpaMode[]) => void;
  qqqMaPeriod: number;
  onQqqMaPeriodChange: (v: number) => void;
  positionHandling: 'carry' | 'liquidate';
  onPositionHandlingChange: (v: 'carry' | 'liquidate') => void;
  result: DongpaBacktestResponse | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function DongpaConfigPanel({
  initialCapitalStr,
  onInitialCapitalChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  dateRange,
  applyFee,
  onApplyFeeChange,
  modes,
  onModesChange,
  qqqMaPeriod,
  onQqqMaPeriodChange,
  positionHandling,
  onPositionHandlingChange,
  result,
  collapsed,
  onToggleCollapse,
}: DongpaConfigPanelProps) {
  const updateModeParam = (modeId: string, key: string, value: number | string | boolean) => {
    onModesChange(
      modes.map((m) =>
        m.modeId === modeId ? { ...m, parameters: { ...m.parameters, [key]: value } } : m,
      ),
    );
  };

  const updateModeStrategy = (modeId: string, strategyId: string) => {
    onModesChange(
      modes.map((m) =>
        m.modeId === modeId
          ? { ...m, strategyId, parameters: { ...STRATEGY_DEFAULTS[strategyId] } }
          : m,
      ),
    );
  };

  if (collapsed) {
    return (
      <div className="w-10 flex-shrink-0">
        <button
          onClick={onToggleCollapse}
          className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg shadow text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          title="설정 패널 펼치기"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-[320px] flex-shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">설정</h3>
          <button
            onClick={onToggleCollapse}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="접기"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* 기본 설정 */}
        <div className="space-y-2">
          <label className="block text-xs text-gray-500 dark:text-gray-400">초기 자본 ($)</label>
          <input
            type="text"
            value={initialCapitalStr}
            onChange={(e) => onInitialCapitalChange(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400">시작일</label>
              <input
                type="date"
                value={startDate}
                min={dateRange?.min}
                max={dateRange?.max}
                onChange={(e) => onStartDateChange(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400">종료일</label>
              <input
                type="date"
                value={endDate}
                min={dateRange?.min}
                max={dateRange?.max}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={applyFee}
              onChange={(e) => onApplyFeeChange(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <label className="text-xs text-gray-600 dark:text-gray-400">수수료 적용 (0.25%)</label>
          </div>
        </div>

        {/* QQQ MA 기간 */}
        <div className="space-y-2">
          <label className="block text-xs text-gray-500 dark:text-gray-400">QQQ 주봉 MA 기간</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={qqqMaPeriod}
              min={2}
              max={52}
              onChange={(e) => onQqqMaPeriodChange(parseInt(e.target.value) || 10)}
              className="w-20 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <span className="text-xs text-gray-400">주</span>
          </div>
        </div>

        {/* 포지션 처리 */}
        <div className="space-y-2">
          <label className="block text-xs text-gray-500 dark:text-gray-400">모드 전환 시 포지션</label>
          <div className="flex gap-1">
            {(['carry', 'liquidate'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onPositionHandlingChange(mode)}
                className={`flex-1 px-2 py-1.5 text-xs rounded ${
                  positionHandling === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {mode === 'carry' ? '유지' : '청산'}
              </button>
            ))}
          </div>
        </div>

        {/* 모드 설정 */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">모드 설정</h4>
          {modes.map((mode) => {
            const colors = MODE_COLORS[mode.modeId as ModeId] || MODE_COLORS.safe;
            return (
              <div key={mode.modeId} className={`rounded-lg border p-3 ${colors.bg} ${colors.border}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${colors.badge}`}>
                    {mode.name}
                  </span>
                  <select
                    value={mode.strategyId}
                    onChange={(e) => updateModeStrategy(mode.modeId, e.target.value)}
                    className="flex-1 text-xs px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {STRATEGY_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name} ({opt.ratios})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div>
                    <label className="text-gray-500 dark:text-gray-400">하락%</label>
                    <input
                      type="number"
                      step="0.005"
                      value={Number(mode.parameters.dropPercent || 0.01)}
                      onChange={(e) => updateModeParam(mode.modeId, 'dropPercent', parseFloat(e.target.value))}
                      className="w-full px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 dark:text-gray-400">목표수익%</label>
                    <input
                      type="number"
                      step="0.5"
                      value={Number(mode.parameters.targetProfit || 0.01)}
                      onChange={(e) => updateModeParam(mode.modeId, 'targetProfit', parseFloat(e.target.value))}
                      className="w-full px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 dark:text-gray-400">손절일</label>
                    <input
                      type="number"
                      value={Number(mode.parameters.stopLossDays || 10)}
                      onChange={(e) => updateModeParam(mode.modeId, 'stopLossDays', parseInt(e.target.value))}
                      className="w-full px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 dark:text-gray-400">손절일매수</label>
                    <select
                      value={String(mode.parameters.stopLossDayBuy || 'allow')}
                      onChange={(e) => updateModeParam(mode.modeId, 'stopLossDayBuy', e.target.value)}
                      className="w-full px-1.5 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="allow">허용</option>
                      <option value="block">차단</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 현재 성과 */}
        {result && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-1">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">성과 요약</h4>
            <div className="grid grid-cols-2 gap-1 text-xs">
              <div className="text-gray-500 dark:text-gray-400">수익률</div>
              <div className={`font-mono text-right ${result.metrics.totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {result.metrics.totalReturn.toFixed(1)}%
              </div>
              <div className="text-gray-500 dark:text-gray-400">CAGR</div>
              <div className="font-mono text-right text-gray-900 dark:text-white">{result.metrics.cagr.toFixed(1)}%</div>
              <div className="text-gray-500 dark:text-gray-400">MDD</div>
              <div className="font-mono text-right text-red-600 dark:text-red-400">{result.metrics.mdd.toFixed(1)}%</div>
              <div className="text-gray-500 dark:text-gray-400">Sharpe</div>
              <div className="font-mono text-right text-gray-900 dark:text-white">{result.metrics.sharpeRatio.toFixed(2)}</div>
              <div className="text-gray-500 dark:text-gray-400">전환 횟수</div>
              <div className="font-mono text-right text-gray-900 dark:text-white">{result.modeEvents.length}회</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
