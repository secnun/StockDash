'use client';

import { useState, useCallback } from 'react';
import { fetchStrategyRecommendation, StrategyParamsOverride } from '@/lib/api/client';
import {
  RecommendResponse,
  RecommendIndicators,
  SimilarPattern,
  StrategyScore,
  ChartPoint,
} from '@/types/recommend';
import RadarBacktestTab from '@/components/lab/recommend/RadarBacktestTab';

// ── 지표 배지 ──

function IndicatorBadge({
  label,
  value,
  unit = '',
  negative,
}: {
  label: string;
  value: string | number | boolean;
  unit?: string;
  negative?: boolean;
}) {
  const display = typeof value === 'boolean' ? (value ? '✅' : '❌') : value;
  let color = 'text-gray-900 dark:text-gray-100';
  if (typeof value === 'boolean') {
    color = value ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  } else if (typeof value === 'number') {
    color = value < 0 || negative ? 'text-red-600 dark:text-red-400' : value > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-gray-100';
  }
  return (
    <div className="flex flex-col items-center rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 min-w-0">
      <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 truncate">{label}</span>
      <span className={`text-sm font-bold ${color}`}>
        {display}
        {unit}
      </span>
    </div>
  );
}

function IndicatorGrid({ indicators }: { indicators: RecommendIndicators }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      <IndicatorBadge label="정배열(20ma-60ma)" value={indicators.maAlignment} />
      <IndicatorBadge label="기울기(20ma 10일)" value={`${indicators.ma20Slope}%`} />
      <IndicatorBadge label="이격도(주가/20ma)" value={`${indicators.ma20Disparity}%`} />
      <IndicatorBadge label="RSI(14)" value={indicators.rsi} negative={indicators.rsi < 40} />
      <IndicatorBadge label="ROC(12)" value={`${indicators.roc}%`} />
      <IndicatorBadge label="변동성(20day)" value={indicators.volatility} negative={indicators.volatility > 0.3} />
    </div>
  );
}

function PatternIndicatorGrid({ indicators }: { indicators: RecommendIndicators }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <IndicatorBadge label="정배열" value={indicators.maAlignment} />
      <IndicatorBadge label="기울기20" value={`${indicators.ma20Slope}%`} />
      <IndicatorBadge label="이격도20" value={`${indicators.ma20Disparity}%`} />
      <IndicatorBadge label="RSI" value={indicators.rsi} negative={indicators.rsi < 40} />
      <IndicatorBadge label="ROC" value={`${indicators.roc}%`} />
      <IndicatorBadge label="변동성" value={indicators.volatility} negative={indicators.volatility > 0.3} />
    </div>
  );
}

// ── SVG 차트 ──

function SvgChart({
  chartData,
  splitIndex,
  width = 360,
  height = 160,
}: {
  chartData: ChartPoint[];
  splitIndex?: number;
  width?: number;
  height?: number;
}) {
  if (!chartData || chartData.length < 2) return null;

  const W = width;
  const H = height;
  const PAD_X = 10;
  const PAD_Y = 10;

  const closes = chartData.map((d) => Math.log(d.close));
  const ma20s = chartData.map((d) => Math.log(Math.max(d.ma20, 0.01)));
  const ma60s = chartData.map((d) => Math.log(Math.max(d.ma60, 0.01)));
  const allVals = [...closes, ...ma20s, ...ma60s];
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;

  const toX = (i: number) => PAD_X + ((W - 2 * PAD_X) * i) / (chartData.length - 1);
  const toY = (v: number) => H - PAD_Y - ((v - minV) / range) * (H - 2 * PAD_Y);

  const pathFrom = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

  const splitX = splitIndex !== undefined ? toX(splitIndex) : undefined;

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return `${d.toLocaleString('en', { month: 'short' })} ${d.getDate()}`;
  };

  const labelIndices = [0, Math.floor(chartData.length * 0.33), Math.floor(chartData.length * 0.66), chartData.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full h-auto rounded-lg bg-gray-900">
      <rect x={0} y={0} width={W} height={H} fill="transparent" rx={4} />
      {splitX !== undefined && (
        <>
          <rect x={splitX} y={0} width={W - splitX} height={H} fill="rgba(220, 38, 38, 0.1)" />
          <line x1={splitX} y1={0} x2={splitX} y2={H} stroke="#ef4444" strokeWidth={1.2} strokeDasharray="4 3" />
        </>
      )}
      <path d={pathFrom(ma60s)} fill="none" stroke="#22c55e" strokeWidth={1.3} opacity={0.8} />
      <path d={pathFrom(ma20s)} fill="none" stroke="#f59e0b" strokeWidth={1.3} opacity={0.8} />
      <path d={pathFrom(closes)} fill="none" stroke="#ffffff" strokeWidth={1.8} />
      <text x={PAD_X + 2} y={14} fill="#fff" fontSize={9} fontWeight="bold">종가</text>
      <line x1={PAD_X + 24} y1={11} x2={PAD_X + 38} y2={11} stroke="#f59e0b" strokeWidth={1.5} />
      <text x={PAD_X + 40} y={14} fill="#f59e0b" fontSize={8}>MA20</text>
      <line x1={PAD_X + 65} y1={11} x2={PAD_X + 79} y2={11} stroke="#22c55e" strokeWidth={1.5} />
      <text x={PAD_X + 81} y={14} fill="#22c55e" fontSize={8}>MA60</text>
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const val = Math.exp(minV + range * (1 - frac));
        const y = PAD_Y + frac * (H - 2 * PAD_Y);
        return (
          <g key={frac}>
            <line x1={PAD_X} y1={y} x2={W - PAD_X} y2={y} stroke="#374151" strokeWidth={0.5} />
            <text x={W - PAD_X + 2} y={y + 3} fill="#9ca3af" fontSize={7}>{val.toFixed(0)}</text>
          </g>
        );
      })}
      {labelIndices.map((li) => (
        <text key={li} x={toX(li)} y={H + 14} fill="#9ca3af" fontSize={7} textAnchor="middle">
          {formatDate(chartData[li].time)}
        </text>
      ))}
    </svg>
  );
}

// ── 패턴 카드 ──

function PatternCard({ pattern }: { pattern: SimilarPattern }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
          {pattern.date} ~ {pattern.dateEnd}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          성과 확인 기간: {pattern.forwardStart} ~ {pattern.forwardEnd}
        </div>
        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-0.5">
          유사도: {pattern.similarity.toFixed(2)}%
        </div>
      </div>

      <div className="px-2 py-1">
        <SvgChart chartData={pattern.chartData} splitIndex={pattern.splitIndex} />
      </div>

      <div className="p-3">
        <PatternIndicatorGrid indicators={pattern.indicators} />
      </div>

      <div className="px-4 pb-4 space-y-1.5">
        {pattern.backtestResults.map((r) => (
          <div key={r.strategyId} className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">{r.strategyName}</span>
            <br />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              수익률{' '}
              <span className={r.totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                {r.totalReturn >= 0 ? '+' : ''}{r.totalReturn}%
              </span>
              , MDD <span className="text-red-600 dark:text-red-400">{r.mdd}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 종합 점수 ──

function ScoreTable({ scores }: { scores: StrategyScore[] }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
        전략별 종합 점수
      </h3>
      <div className="space-y-2.5">
        {scores.map((s) => (
          <div
            key={s.strategyId}
            className={`flex items-center justify-between px-4 py-3 rounded-lg ${
              s.excluded ? 'bg-gray-50 dark:bg-gray-700/30 opacity-50' : 'bg-gray-50 dark:bg-gray-700/50'
            }`}
          >
            <div>
              <span className={`font-medium ${s.excluded ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                {s.strategyName}
              </span>
              {s.excluded && (
                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">({s.excludeReason})</span>
              )}
            </div>
            <span
              className={`font-bold tabular-nums ${
                s.excluded ? 'text-gray-400 line-through' : s.compositeScore >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {s.compositeScore.toFixed(3)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 추천 배너 ──

function RecommendBanner({ data }: { data: RecommendResponse }) {
  const colors: Record<string, string> = {
    ddeolsapro1: 'from-emerald-500 to-emerald-700',
    ddeolsapro2: 'from-blue-500 to-blue-700',
    ddeolsapro3: 'from-indigo-500 to-indigo-700',
  };
  const bg = colors[data.recommendation] || 'from-gray-500 to-gray-700';

  return (
    <div className={`rounded-lg bg-gradient-to-r ${bg} p-6 text-white shadow-md flex flex-col items-center justify-center`}>
      <div className="text-xs opacity-80">{data.currentDate}</div>
      <div className="text-2xl font-bold mt-1">추천 전략: {data.recommendationName}</div>
      <div className="text-sm opacity-80 mt-2">
        유사 패턴 {data.similarPatterns.length}개 분석 기반
      </div>
    </div>
  );
}

// ── 메인 페이지 ──

export default function StrategyRecommendPage() {
  const [tab, setTab] = useState<'recommend' | 'backtest'>('recommend');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendResponse | null>(null);

  const [dateMode, setDateMode] = useState<'today' | 'custom'>('today');
  const [customDate, setCustomDate] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [forwardDays, setForwardDays] = useState(30);
  const [alpha, setAlpha] = useState(-0.05);

  const PRESETS = {
    standard: {
      ddeolsapro1: { dropPercent: 0.01, targetProfit: 0.01, stopLossDays: 10, stopLossDayBuy: 'allow' },
      ddeolsapro2: { dropPercent: 0.01, targetProfit: 1.5, stopLossDays: 10, stopLossDayBuy: 'allow' },
      ddeolsapro3: { dropPercent: 0.1, targetProfit: 2.0, stopLossDays: 12, stopLossDayBuy: 'allow' },
    },
    optimized: {
      ddeolsapro1: { dropPercent: 0.01, targetProfit: 0.01, stopLossDays: 10, stopLossDayBuy: 'allow' },
      ddeolsapro2: { dropPercent: 0.33, targetProfit: 1.43, stopLossDays: 9, stopLossDayBuy: 'allow' },
      ddeolsapro3: { dropPercent: 0.01, targetProfit: 0.01, stopLossDays: 10, stopLossDayBuy: 'allow' },
    },
  } as Record<string, Record<string, { dropPercent: number; targetProfit: number; stopLossDays: number; stopLossDayBuy: string }>>;

  const [paramPreset, setParamPreset] = useState<'standard' | 'optimized'>('standard');
  const [pro1Params, setPro1Params] = useState({ ...PRESETS.standard.ddeolsapro1 });
  const [pro2Params, setPro2Params] = useState({ ...PRESETS.standard.ddeolsapro2 });
  const [pro3Params, setPro3Params] = useState({ ...PRESETS.standard.ddeolsapro3 });

  const applyPreset = (preset: 'standard' | 'optimized') => {
    setParamPreset(preset);
    setPro1Params({ ...PRESETS[preset].ddeolsapro1 });
    setPro2Params({ ...PRESETS[preset].ddeolsapro2 });
    setPro3Params({ ...PRESETS[preset].ddeolsapro3 });
  };

  const handleAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const targetDate = dateMode === 'custom' && customDate ? customDate : undefined;
      const strategyParams: Record<string, StrategyParamsOverride> = {
        ddeolsapro1: pro1Params,
        ddeolsapro2: pro2Params,
        ddeolsapro3: pro3Params,
      };
      const data = await fetchStrategyRecommendation(targetDate, forwardDays, 3, alpha, 10000, strategyParams);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '분석에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }, [dateMode, customDate, forwardDays, alpha, pro1Params, pro2Params, pro3Params]);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">떨사 Pro 전략 추천</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          과거 유사 구간의 성과를 추적하여 최적의 전략을 추천합니다.
        </p>
        <p className="text-xs text-red-500 mt-1">
          [주의] 추천전략이 과거와 유사한 수익을 보장하지는 않습니다.
        </p>
      </div>

      {/* 탭 선택 */}
      <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700 p-1 w-fit">
        <button onClick={() => setTab('recommend')} className={`px-4 py-1.5 text-sm rounded-md transition ${tab === 'recommend' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
          추천
        </button>
        <button onClick={() => setTab('backtest')} className={`px-4 py-1.5 text-sm rounded-md transition ${tab === 'backtest' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
          백테스트
        </button>
      </div>

      {tab === 'backtest' && <RadarBacktestTab />}

      {tab === 'recommend' && (<>
      {/* 설정 바 */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">기준 선택</label>
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-gray-300">
                <input type="radio" name="dateMode" checked={dateMode === 'today'} onChange={() => setDateMode('today')} className="accent-blue-600" />
                오늘 기준
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-gray-300">
                <input type="radio" name="dateMode" checked={dateMode === 'custom'} onChange={() => setDateMode('custom')} className="accent-blue-600" />
                특정일 기준
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">기준 날짜</label>
            <input type="date" disabled={dateMode === 'today'} value={customDate} onChange={(e) => setCustomDate(e.target.value)}
              className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 disabled:opacity-50" />
          </div>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">종목 선택</label>
            <div className="flex items-center gap-2">
              <select className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100">
                <option value="SOXL">SOXL</option>
              </select>
              <span className="text-[10px] text-red-500">[주의] SOXL, TQQQ 외에는 신뢰도가 낮을 수 있습니다.</span>
            </div>
          </div>

          <button onClick={handleAnalyze} disabled={loading}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed px-8 py-2 text-sm font-medium text-white transition-colors ml-auto">
            {loading ? '분석 중...' : '전략 추천 실행'}
          </button>
        </div>

        {/* Advanced 토글 */}
        <button onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition">
          <svg className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          고급 설정
        </button>

        {showAdvanced && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-3">
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">시뮬레이션 기간 (일)</label>
                <input type="number" min={10} max={120} value={forwardDays} onChange={(e) => setForwardDays(Number(e.target.value))}
                  className="w-20 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">MDD 가중치 (alpha)</label>
                <input type="number" step={0.01} min={-1} max={0} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))}
                  className="w-20 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">전략별 백테스트 파라미터</span>
                <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5">
                  <button onClick={() => applyPreset('standard')}
                    className={`px-3 py-1 text-xs rounded-md transition ${paramPreset === 'standard' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                    표준
                  </button>
                  <button onClick={() => applyPreset('optimized')}
                    className={`px-3 py-1 text-xs rounded-md transition ${paramPreset === 'optimized' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                    최적값
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {([
                  { label: 'Pro1', ratio: '5/10/15/20/25/25%', params: pro1Params, setParams: setPro1Params },
                  { label: 'Pro2', ratio: '10/15/20/25/20/10%', params: pro2Params, setParams: setPro2Params },
                  { label: 'Pro3', ratio: '균등 (1/6씩)', params: pro3Params, setParams: setPro3Params },
                ] as const).map(({ label, ratio, params, setParams }) => (
                  <div key={label} className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3">
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-200">떨사 {label}</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">{ratio}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-400 dark:text-gray-500">하락률 (%)</label>
                        <input type="number" step={0.01} min={0.01} max={20} value={params.dropPercent}
                          onChange={(e) => setParams({ ...params, dropPercent: Number(e.target.value) })}
                          className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 dark:text-gray-500">목표수익률 (%)</label>
                        <input type="number" step={0.01} min={0.01} max={50} value={params.targetProfit}
                          onChange={(e) => setParams({ ...params, targetProfit: Number(e.target.value) })}
                          className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 dark:text-gray-500">손절일</label>
                        <input type="number" min={1} max={100} value={params.stopLossDays}
                          onChange={(e) => setParams({ ...params, stopLossDays: Number(e.target.value) })}
                          className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 dark:text-gray-500">손절일 매수</label>
                        <select value={params.stopLossDayBuy}
                          onChange={(e) => setParams({ ...params, stopLossDayBuy: e.target.value })}
                          className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100">
                          <option value="allow">허용</option>
                          <option value="block">금지</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 에러 */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="ml-3 text-gray-500 dark:text-gray-400">유사 패턴 검색 및 백테스트 실행 중...</span>
        </div>
      )}

      {/* 결과 */}
      {result && !loading && (
        <>
          {/* 현재 장세 차트 + 지표 */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              추천 기준일: {result.currentDate}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              분석 구간: {result.analysisStart} ~ {result.analysisEnd}
            </p>
            <SvgChart
              chartData={result.currentChart}
              splitIndex={result.currentChart.length - 1}
              width={720}
              height={200}
            />
            <div className="mt-4">
              <IndicatorGrid indicators={result.currentIndicators} />
            </div>
          </div>

          {/* 유사 패턴 Top N */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                유사했던 과거 구간 (Top {result.similarPatterns.length})
              </h3>
              <div className="relative group/tip">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-600 text-[10px] font-bold text-gray-500 dark:text-gray-400 cursor-help">?</span>
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 rounded-lg bg-gray-900 dark:bg-gray-700 text-xs text-gray-100 shadow-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-20">
                  <p className="font-medium mb-1">각 카드의 두 기간:</p>
                  <p><span className="text-amber-400">상단 날짜</span> — 빨간 점선 왼쪽. 오늘과 지표가 유사했던 과거 구간 (매칭 구간)</p>
                  <p className="mt-1"><span className="text-blue-400">성과 확인 기간</span> — 빨간 점선 오른쪽. 그 이후 떨사 Pro를 돌렸을 때의 시뮬레이션 구간</p>
                  <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-gray-900 dark:bg-gray-700 rotate-45" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {result.similarPatterns.map((p) => (
                <PatternCard key={p.index} pattern={p} />
              ))}
            </div>
          </div>

          {/* 종합 점수 + 추천 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ScoreTable scores={result.strategyScores} />
            <RecommendBanner data={result} />
          </div>
        </>
      )}
      </>)}
    </div>
  );
}
