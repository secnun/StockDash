'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import {
  fetchStrategies,
  fetchDateRange,
  fetchOptimizers,
  fetchCachedResults,
  runOptimizerAPI,
  cancelOptimizer,
  StrategyInfo,
  OptimizerInfo,
  ParamRange,
  GridSearchProgress,
  GridSearchDone,
  GridSearchCacheInfo,
  YearlyRankings,
  YearlyRankedResultItem,
  OptimizerCancelled,
} from '@/lib/api/client';
import ResultTabs, { ResultTabMode } from '@/components/optimizer/ResultTabs';
import RankingFilterBar, { RankingFilters, defaultFilters } from '@/components/optimizer/RankingFilterBar';

interface Ticker {
  id: string;
  name: string;
  file: string;
}

// Expanded rows state type
type ExpandedRows = Record<number, boolean>;

interface OptimizerPageContentProps {
  market: 'us' | 'kr';
  title: string;
}

export default function OptimizerPageContent({ market, title }: OptimizerPageContentProps) {
  // Data states
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [optimizers, setOptimizers] = useState<OptimizerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form states
  const [selectedTicker, setSelectedTicker] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [selectedOptimizer, setSelectedOptimizer] = useState('grid_search');
  const [initialCapital, setInitialCapital] = useState(market === 'kr' ? '10000000' : '10000');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateRange, setDateRange] = useState<{ min: string; max: string }>({ min: '', max: '' });
  const [applyFee, setApplyFee] = useState(true);
  const [topN] = useState(70);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Parameter ranges
  const [paramRanges, setParamRanges] = useState<Record<string, ParamRange>>({});
  const [selectParamValues, setSelectParamValues] = useState<Record<string, string[]>>({});

  // ddeolsapro_custom 전략 전용: 고정 분할 수 + 분할비율 step
  const [customDivisions, setCustomDivisions] = useState(6);
  const [customDivisionsInput, setCustomDivisionsInput] = useState<number | ''>(6);
  const [splitPctStep, setSplitPctStep] = useState(5);

  // Optimizer config (for Monte Carlo)
  const [optimizerConfig, setOptimizerConfig] = useState<Record<string, number | ''>>({});

  // Execution states
  const [isRunning, setIsRunning] = useState(false);
  const [isActuallyRunning, setIsActuallyRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);
  const [progress, setProgress] = useState<GridSearchProgress | null>(null);
  const [cacheInfo, setCacheInfo] = useState<GridSearchCacheInfo | null>(null);
  const [yearlyRankings, setYearlyRankings] = useState<YearlyRankings | null>(null);
  const [done, setDone] = useState<GridSearchDone | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<ExpandedRows>({});

  // Tab states
  const [resultTabMode, setResultTabMode] = useState<ResultTabMode>('cumulative');
  const [cachedRankings, setCachedRankings] = useState<YearlyRankings | null>(null);
  const [cachedTotalCount, setCachedTotalCount] = useState(0);
  const [cachedLastUpdated, setCachedLastUpdated] = useState<number | null>(null);
  const [isCacheLoading, setIsCacheLoading] = useState(false);

  // Previous rank snapshot for rank change tracking
  const [previousRankMap, setPreviousRankMap] = useState<Map<string, number> | null>(null);

  // Ranking filters
  const [rankingFilters, setRankingFilters] = useState<RankingFilters>(defaultFilters);

  // Warning confirmation for exceeding max combinations
  const [showCombinationWarning, setShowCombinationWarning] = useState(false);
  const [warningConfirmed, setWarningConfirmed] = useState(false);


  // Load initial data
  useEffect(() => {
    async function fetchData() {
      try {
        const [tickersRes, strategiesData, optimizersData] = await Promise.all([
          fetch(`/api/tickers?market=${market}`),
          fetchStrategies(),
          fetchOptimizers(),
        ]);

        const tickersData = await tickersRes.json();

        setTickers(tickersData.tickers || []);
        setStrategies(strategiesData || []);
        setOptimizers(optimizersData || []);

        if (tickersData.tickers?.length > 0) {
          setSelectedTicker(tickersData.tickers[0].id);
        }
        // 전략은 기본값 없음 (선택안함)
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError('데이터를 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [market]);

  // Load date range when ticker changes
  useEffect(() => {
    async function loadDateRange() {
      if (!selectedTicker) return;
      try {
        const range = await fetchDateRange(selectedTicker, market);
        setDateRange({ min: range.min, max: range.max });
        setStartDate(range.min);
        setEndDate(range.max);
      } catch (err) {
        console.error('Failed to load date range:', err);
      }
    }
    if (selectedTicker) {
      loadDateRange();
    }
  }, [selectedTicker, market]);

  // Initialize param ranges when strategy changes
  useEffect(() => {
    if (!selectedStrategy) {
      setParamRanges({});
      setSelectParamValues({});
      return;
    }
    const strategy = strategies.find((s) => s.id === selectedStrategy);
    if (strategy) {
      const ranges: Record<string, ParamRange> = {};
      strategy.parameters.forEach((param) => {
        if (param.type === 'number' && param.min !== undefined && param.max !== undefined) {
          // ddeolsapro_custom: divisions는 ranges에서 제외 (고정값이므로)
          if (selectedStrategy === 'ddeolsapro_custom' && param.key === 'divisions') return;
          ranges[param.key] = {
            min: param.min,
            max: param.max,
            step: param.step || 1,
          };
        }
      });
      setParamRanges(ranges);

      // Initialize select param values
      const selectValues: Record<string, string[]> = {};
      strategy.parameters.forEach((param) => {
        if (param.type === 'select' && param.options) {
          selectValues[param.key] = param.options.map(o => String(o.value));
        }
      });
      setSelectParamValues(selectValues);
    }
  }, [selectedStrategy, strategies]);

  // 이항계수 C(n, k)
  const binomial = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let result = 1;
    for (let i = 0; i < k; i++) {
      result = result * (n - i) / (i + 1);
    }
    return Math.round(result);
  };

  // Calculate estimated combinations (based on param ranges)
  const estimatedCombinations = useCallback(() => {
    let total = 1;
    Object.values(paramRanges).forEach((range) => {
      const min = range.min === '' ? 0 : range.min;
      const max = range.max === '' ? 0 : range.max;
      const step = range.step === '' ? 1 : range.step;
      const count = step > 0 ? Math.floor((max - min) / step) + 1 : 1;
      total *= Math.max(1, count);
    });
    // ddeolsapro_custom: splitPct 유효 조합 수 (이항계수)
    if (selectedStrategy === 'ddeolsapro_custom') {
      total *= binomial(100 / splitPctStep, customDivisions);
    }
    // select 파라미터 조합 수 곱하기
    Object.values(selectParamValues).forEach((values) => {
      if (values.length > 0) total *= values.length;
    });
    return total;
  }, [paramRanges, selectedStrategy, splitPctStep, customDivisions, selectParamValues]);

  // Initialize optimizer config when optimizer changes
  useEffect(() => {
    const optimizer = optimizers.find((o) => o.id === selectedOptimizer);
    if (optimizer) {
      const config: Record<string, number> = {};
      const estimated = estimatedCombinations();
      optimizer.configSchema.forEach((schema) => {
        let value = schema.default;
        // 조합 수/샘플링 횟수는 가능 횟수를 초과할 수 없음
        if ((schema.key === 'max_combinations' || schema.key === 'n_samples') && estimated > 0) {
          value = Math.min(value, estimated);
        }
        config[schema.key] = value;
      });
      setOptimizerConfig(config);
    }
  }, [selectedOptimizer, optimizers, estimatedCombinations]);

  // Get Monte Carlo sampling count
  const monteCarloSamples = useCallback(() => {
    const samples = optimizerConfig.n_samples;
    return samples === '' || !samples ? 100 : samples;
  }, [optimizerConfig]);

  // Get max combinations limit (for Grid Search)
  const maxCombinations = useCallback(() => {
    if (selectedOptimizer !== 'grid_search') return -1;
    const val = optimizerConfig.max_combinations;
    return val === '' || val === undefined ? 10000 : val;
  }, [selectedOptimizer, optimizerConfig]);

  // Check if combinations exceed limit
  const exceedsLimit = useCallback(() => {
    const max = maxCombinations();
    if (max === -1) return false; // unlimited
    return estimatedCombinations() > max;
  }, [estimatedCombinations, maxCombinations]);

  // Reset warning when params change
  useEffect(() => {
    setWarningConfirmed(false);
    setShowCombinationWarning(false);
  }, [paramRanges, optimizerConfig, selectParamValues]);

  // Auto-adjust optimizer config based on estimated combinations
  useEffect(() => {
    const estimated = estimatedCombinations();
    if (estimated <= 0) return;

    setOptimizerConfig((prev) => {
      const updated = { ...prev };
      // Grid Search: max_combinations
      if (prev.max_combinations !== undefined && prev.max_combinations !== '') {
        const currentMax = prev.max_combinations as number;
        if (estimated < currentMax) {
          updated.max_combinations = estimated;
        }
      }
      // Monte Carlo: n_samples
      if (prev.n_samples !== undefined && prev.n_samples !== '') {
        const currentSamples = prev.n_samples as number;
        if (estimated < currentSamples) {
          updated.n_samples = estimated;
        }
      }
      return updated;
    });
  }, [paramRanges, estimatedCombinations]);

  // Load cached results when strategy/ticker changes
  const loadCachedResults = useCallback(async () => {
    if (!selectedStrategy || !selectedTicker) {
      setCachedRankings(null);
      setCachedTotalCount(0);
      setCachedLastUpdated(null);
      return;
    }
    setIsCacheLoading(true);
    try {
      const data = await fetchCachedResults(selectedStrategy, selectedTicker, topN);
      if (data.exists && data.results.length > 0) {
        setCachedRankings({ results: data.results });
        setCachedTotalCount(data.totalCount);
        setCachedLastUpdated(data.lastUpdated);
      } else {
        setCachedRankings(null);
        setCachedTotalCount(0);
        setCachedLastUpdated(null);
      }
    } catch (err) {
      console.error('Failed to load cached results:', err);
      setCachedRankings(null);
      setCachedTotalCount(0);
      setCachedLastUpdated(null);
    } finally {
      setIsCacheLoading(false);
    }
  }, [selectedStrategy, selectedTicker, topN]);

  useEffect(() => {
    setPreviousRankMap(null);
    setRankingFilters(defaultFilters);
    loadCachedResults();
  }, [loadCachedResults]);

  // Update param range
  const updateParamRange = (key: string, field: keyof ParamRange, value: string) => {
    setParamRanges((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value === '' ? '' : parseFloat(value) },
    }));
  };

  // ddeolsapro_custom: 분할 수 변경 핸들러
  const applyCustomDivisions = useCallback((newDiv: number) => {
    const clamped = Math.max(2, Math.min(10, newDiv));
    setCustomDivisions(clamped);
    setCustomDivisionsInput(clamped);
    setParamRanges((prev) => {
      const next: Record<string, ParamRange> = {};
      Object.entries(prev).forEach(([k, v]) => {
        if (!k.startsWith('splitPct')) next[k] = v;
      });
      return next;
    });
  }, []);

  // Handle run button click
  const handleRunClick = () => {
    // Check if exceeds limit and not confirmed
    if (exceedsLimit() && !warningConfirmed) {
      setShowCombinationWarning(true);
      return;
    }
    runOptimization();
  };

  // Confirm and run despite warning
  const confirmAndRun = () => {
    setWarningConfirmed(true);
    setShowCombinationWarning(false);
    runOptimization();
  };

  // params → stable string key for Map lookup
  const getParamKey = (params: Record<string, unknown>): string => {
    return Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  };

  // Rank change: previousRank - currentRank (positive = up, negative = down)
  const getRankChange = (result: YearlyRankedResultItem): number | null | 'new' => {
    if (!previousRankMap) return null;
    const key = getParamKey(result.params);
    const prevRank = previousRankMap.get(key);
    if (prevRank === undefined) return 'new';
    return prevRank - result.rank;
  };

  // Run optimization
  const runOptimization = async () => {
    // Snapshot current cached rankings for rank change comparison
    if (cachedRankings?.results) {
      const map = new Map<string, number>();
      cachedRankings.results.forEach(r => map.set(getParamKey(r.params), r.rank));
      setPreviousRankMap(map);
    }

    setIsRunning(true);
    setIsActuallyRunning(false);
    setJobId(null);
    setIsCancelled(false);
    setProgress(null);
    setCacheInfo(null);
    setYearlyRankings(null);
    setDone(null);
    setError(null);
    setExpandedRows({});
    setCurrentPage(1);
    setResultTabMode('current');

    try {
      // Convert empty strings to default values for API
      const sanitizedConfig: Record<string, number> = {};
      Object.entries(optimizerConfig).forEach(([key, val]) => {
        sanitizedConfig[key] = val === '' ? 0 : val;
      });

      const sanitizedParamRanges: Record<string, { min: number; max: number; step: number }> = {};
      Object.entries(paramRanges).forEach(([key, range]) => {
        sanitizedParamRanges[key] = {
          min: range.min === '' ? 0 : range.min,
          max: range.max === '' ? 0 : range.max,
          step: range.step === '' ? 1 : range.step,
        };
      });

      // ddeolsapro_custom: divisions + splitPct 범위 자동 주입
      if (selectedStrategy === 'ddeolsapro_custom') {
        sanitizedParamRanges['divisions'] = {
          min: customDivisions,
          max: customDivisions,
          step: 1,
        };
        const sMin = splitPctStep;
        const sMax = 100 - (customDivisions - 1) * splitPctStep;
        for (let i = 1; i <= customDivisions; i++) {
          sanitizedParamRanges[`splitPct${i}`] = { min: sMin, max: sMax, step: splitPctStep };
        }
      }

      await runOptimizerAPI(
        {
          optimizerId: selectedOptimizer,
          optimizerConfig: sanitizedConfig,
          strategyId: selectedStrategy,
          tickerId: selectedTicker,
          paramRanges: sanitizedParamRanges,
          selectParams: Object.fromEntries(
            Object.entries(selectParamValues).filter(([, values]) => values.length > 0)
          ),
          initialCapital: parseFloat(initialCapital),
          topN,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          applyFee,
          market,
        },
        {
          onStart: (start) => setJobId(start.jobId),
          onProgress: (prog) => {
            setProgress(prog);
            setIsActuallyRunning(true);
          },
          onCacheInfo: setCacheInfo,
          onYearlyRankings: setYearlyRankings,
          onDone: setDone,
          onCancelled: (cancelled: OptimizerCancelled) => {
            setIsCancelled(true);
            setProgress({
              completed: cancelled.completed,
              total: cancelled.total,
              percent: Math.round((cancelled.completed / cancelled.total) * 100 * 10) / 10,
            });
          },
          onError: (err) => setError(err.message),
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '최적화 실행 실패');
    } finally {
      setIsRunning(false);
      setIsActuallyRunning(false);
      setJobId(null);
      // Reload cached results to update cumulative rankings
      loadCachedResults();
    }
  };

  // Handle stop button click
  const handleStop = async () => {
    if (jobId) {
      try {
        await cancelOptimizer(jobId);
      } catch (err) {
        console.error('Failed to cancel optimizer:', err);
      }
    }
  };

  // Get active rankings based on tab mode
  const activeRankings = resultTabMode === 'current' ? yearlyRankings : cachedRankings;

  // Memoize results to avoid recomputation on every render
  const allResults = useMemo((): YearlyRankedResultItem[] => {
    if (!activeRankings) return [];
    return activeRankings.results || [];
  }, [activeRankings]);

  // Extract numeric param keys for dynamic filter
  const numericParamKeys = useMemo(() => {
    if (allResults.length === 0) return [];
    return Object.entries(allResults[0].params)
      .filter(([, v]) => typeof v === 'number')
      .map(([k]) => k);
  }, [allResults]);

  // Apply ranking filters (cumulative mode only)
  const filteredResults = useMemo(() => {
    if (resultTabMode !== 'cumulative') return allResults;
    const f = rankingFilters;
    return allResults.filter((item) => {
      if (f.minAvgReturn !== '' && item.avgReturn < f.minAvgReturn) return false;
      if (f.maxMaxMdd !== '' && item.maxMdd > f.maxMaxMdd) return false;
      if (f.minCompositeScore !== '' && item.compositeScore < f.minCompositeScore) return false;
      if (f.maxNegativeYears !== '') {
        const neg = item.yearlyResults.filter(yr => yr.totalReturn < 0).length;
        if (neg > f.maxNegativeYears) return false;
      }
      for (const [key, range] of Object.entries(f.paramFilters)) {
        const val = item.params[key];
        if (typeof val !== 'number') continue;
        if (range.min !== '' && val < range.min) return false;
        if (range.max !== '' && val > range.max) return false;
      }
      return true;
    });
  }, [allResults, rankingFilters, resultTabMode]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [rankingFilters]);

  const paginatedResults = useMemo((): YearlyRankedResultItem[] => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredResults.slice(startIndex, endIndex);
  }, [filteredResults, currentPage, itemsPerPage]);

  // Get total pages
  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);

  // Toggle row expansion
  const toggleRowExpansion = (rank: number) => {
    setExpandedRows((prev) => ({
      ...prev,
      [rank]: !prev[rank],
    }));
  };

  // Get selected strategy info
  const selectedStrategyInfo = strategies.find((s) => s.id === selectedStrategy);
  const selectedOptimizerInfo = optimizers.find((o) => o.id === selectedOptimizer);

  // Map param key → label for display in results table
  const paramLabelMap = useMemo<Record<string, string>>(() => {
    if (!selectedStrategyInfo) return {};
    return Object.fromEntries(
      selectedStrategyInfo.parameters.map((p) => [p.key, p.label])
    );
  }, [selectedStrategyInfo]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {title}
          </h1>
        </div>

        {/* Description Box */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <p className="text-blue-800 dark:text-blue-200 text-sm leading-relaxed">
            옵티마이저는 전략의 최적 파라미터를 자동으로 탐색하는 도구입니다.
            지정한 범위 내에서 다양한 파라미터 조합을 시뮬레이션하여 최고 성과를 내는 설정을 찾아줍니다.
          </p>
          <ul className="mt-3 text-blue-700 dark:text-blue-300 text-sm space-y-1">
            <li>• <strong>Grid Search:</strong> 모든 조합을 전수 탐색 (정확하지만 시간 소요)</li>
            <li>• <strong>Monte Carlo:</strong> 무작위 샘플링으로 효율적 탐색 (빠르지만 근사치)</li>
          </ul>
        </div>

        {/* 전역설정 + 전략 및 옵티마이저 (좌우 배치) */}
        <div className="flex flex-col lg:flex-row gap-4 mb-4">
          {/* 좌측: 전역설정 (1/4) */}
          <div className="w-full lg:w-1/4 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h3 className="text-base font-medium text-gray-900 dark:text-white mb-3">
              전역설정
            </h3>
            <div className="flex flex-col gap-3 mb-2">
              {/* Ticker */}
              <div className="w-full">
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  티커
                </label>
                <select
                  value={selectedTicker}
                  onChange={(e) => setSelectedTicker(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  disabled={isRunning}
                >
                  {tickers.map((ticker) => (
                    <option key={ticker.id} value={ticker.id}>
                      {ticker.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Initial Capital */}
              <div className="w-full">
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  초기자본 ({market === 'kr' ? '₩' : '$'})
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={initialCapital ? Number(initialCapital).toLocaleString() : ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    setInitialCapital(value);
                  }}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  disabled={isRunning}
                />
              </div>

              {/* Start Date */}
              <div className="w-full">
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  시작일
                </label>
                <input
                  type="date"
                  value={startDate}
                  min={dateRange.min}
                  max={dateRange.max}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  disabled={isRunning}
                />
              </div>

              {/* End Date */}
              <div className="w-full">
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  종료일
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={dateRange.min}
                  max={dateRange.max}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  disabled={isRunning}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              * 수수료({market === 'kr' ? '0.015%' : '0.25%'})가 자동 적용됩니다.
            </p>
          </div>

          {/* 우측: 전략 및 옵티마이저 (3/4) */}
          <div className="w-full lg:w-3/4 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="text-base font-medium text-gray-900 dark:text-white mb-3">
            전략 및 옵티마이저
          </h3>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            {/* Strategy */}
            <div className="w-[200px]">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                전략
              </label>
              <select
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                disabled={isRunning}
              >
                <option value="">선택안함</option>
                {strategies.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Optimizer */}
            <div className="w-[200px]">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                옵티마이저
              </label>
              <select
                value={selectedOptimizer}
                onChange={(e) => setSelectedOptimizer(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                disabled={isRunning}
              >
                {optimizers.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Parameter Range Settings - only show when strategy is selected */}
          {selectedStrategy && selectedStrategyInfo && (Object.keys(paramRanges).length > 0 || Object.keys(selectParamValues).length > 0 || selectedStrategy === 'ddeolsapro_custom') && (
            <>
              <h4 className="text-base font-medium text-gray-900 dark:text-white mb-3">
                파라미터 범위 설정
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-sm font-medium text-gray-900 dark:text-white">
                        파라미터
                      </th>
                      <th className="w-24 text-center py-2 px-3 text-sm font-medium text-gray-900 dark:text-white">
                        Min
                      </th>
                      <th className="w-24 text-center py-2 px-3 text-sm font-medium text-gray-900 dark:text-white">
                        Max
                      </th>
                      <th className="w-24 text-center py-2 px-3 text-sm font-medium text-gray-900 dark:text-white">
                        Step
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* ddeolsapro_custom: 분할 설정 행 */}
                    {selectedStrategy === 'ddeolsapro_custom' && (
                      <>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          <td className="py-2 px-3">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">분할 수 (고정)</span>
                          </td>
                          <td className="w-24 py-2 px-3 text-center">
                            <input
                              type="number"
                              value={customDivisionsInput}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') {
                                  setCustomDivisionsInput('');
                                } else {
                                  const num = Number(raw);
                                  if (!isNaN(num)) setCustomDivisionsInput(num);
                                }
                              }}
                              onBlur={() => {
                                const val = typeof customDivisionsInput === 'number' ? customDivisionsInput : 6;
                                applyCustomDivisions(val);
                              }}
                              min={2}
                              max={10}
                              step={1}
                              className="w-full px-2 py-1 text-center border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                              disabled={isRunning}
                            />
                          </td>
                          <td className="w-24 py-2 px-3 text-center">
                            <input type="text" value="미해당" className="w-full px-2 py-1 text-center border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-600 text-gray-400 dark:text-gray-500 text-sm cursor-not-allowed" disabled />
                          </td>
                          <td className="w-24 py-2 px-3 text-center">
                            <input type="text" value="미해당" className="w-full px-2 py-1 text-center border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-600 text-gray-400 dark:text-gray-500 text-sm cursor-not-allowed" disabled />
                          </td>
                        </tr>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          <td className="py-2 px-3">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">분할비율 (%)</span>
                          </td>
                          <td className="w-24 py-2 px-3 text-center">
                            <select
                              value={splitPctStep}
                              onChange={(e) => setSplitPctStep(Number(e.target.value))}
                              disabled={isRunning}
                              className="w-full px-2 py-1 text-center border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            >
                              <option value={1}>1</option>
                              <option value={5}>5</option>
                            </select>
                          </td>
                          <td className="w-24 py-2 px-3 text-center">
                            <input type="text" value="미해당" className="w-full px-2 py-1 text-center border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-600 text-gray-400 dark:text-gray-500 text-sm cursor-not-allowed" disabled />
                          </td>
                          <td className="w-24 py-2 px-3 text-center">
                            <input type="text" value="미해당" className="w-full px-2 py-1 text-center border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-600 text-gray-400 dark:text-gray-500 text-sm cursor-not-allowed" disabled />
                          </td>
                        </tr>
                      </>
                    )}
                    {selectedStrategyInfo.parameters
                      .filter((p) => p.type === 'number' && paramRanges[p.key])
                      .filter((p) => !(selectedStrategy === 'ddeolsapro_custom' && p.key === 'divisions'))
                      .map((param) => (
                        <tr key={param.key} className="border-b border-gray-100 dark:border-gray-700">
                          <td className="py-2 px-3">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {param.label}
                            </span>
                          </td>
                          <td className="w-24 py-2 px-3 text-center">
                            <input
                              type="number"
                              value={paramRanges[param.key]?.min ?? ''}
                              onChange={(e) =>
                                updateParamRange(param.key, 'min', e.target.value)
                              }
                              className="w-full px-2 py-1 text-center border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                              disabled={isRunning}
                            />
                          </td>
                          <td className="w-24 py-2 px-3 text-center">
                            <input
                              type="number"
                              value={paramRanges[param.key]?.max ?? ''}
                              onChange={(e) =>
                                updateParamRange(param.key, 'max', e.target.value)
                              }
                              className="w-full px-2 py-1 text-center border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                              disabled={isRunning}
                            />
                          </td>
                          <td className="w-24 py-2 px-3 text-center">
                            <input
                              type="number"
                              value={paramRanges[param.key]?.step ?? ''}
                              onChange={(e) =>
                                updateParamRange(param.key, 'step', e.target.value)
                              }
                              className="w-full px-2 py-1 text-center border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                              disabled={isRunning}
                            />
                          </td>
                        </tr>
                      ))}
                    {/* Select 파라미터 (이산값 체크박스) */}
                    {selectedStrategyInfo.parameters
                      .filter((p) => p.type === 'select' && p.options && selectParamValues[p.key])
                      .map((param) => (
                        <tr key={param.key} className="border-b border-gray-100 dark:border-gray-700">
                          <td className="py-2 px-3">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {param.label}
                            </span>
                          </td>
                          <td colSpan={3} className="py-2 px-3">
                            <div className="flex gap-3">
                              {param.options!.map((opt) => (
                                <label key={String(opt.value)} className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectParamValues[param.key]?.includes(String(opt.value)) ?? false}
                                    onChange={(e) => {
                                      const val = String(opt.value);
                                      setSelectParamValues((prev) => {
                                        const current = prev[param.key] || [];
                                        const updated = e.target.checked
                                          ? [...current, val]
                                          : current.filter((v) => v !== val);
                                        if (updated.length === 0) return prev;
                                        return { ...prev, [param.key]: updated };
                                      });
                                    }}
                                    className="rounded border-gray-300 dark:border-gray-600"
                                    disabled={isRunning}
                                  />
                                  <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                                </label>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                {selectedOptimizer === 'monte_carlo' ? (
                  <>
                    가능 샘플링 횟수: <strong className="text-blue-600 dark:text-blue-400">{estimatedCombinations().toLocaleString()}회</strong>
                    {' / '}
                    샘플링 횟수: <strong className="text-blue-600 dark:text-blue-400">{Math.min(estimatedCombinations(), monteCarloSamples()).toLocaleString()}회</strong>
                  </>
                ) : (
                  <>
                    가능 조합 수: <strong className="text-blue-600 dark:text-blue-400">{estimatedCombinations().toLocaleString()}개</strong>
                    {' / '}
                    조합 수: <strong className="text-blue-600 dark:text-blue-400">{Math.min(estimatedCombinations(), optimizerConfig.max_combinations || 10000).toLocaleString()}개</strong>
                  </>
                )}
              </div>
            </>
          )}
          {selectedStrategy && selectedStrategyInfo && Object.keys(paramRanges).length === 0 && Object.keys(selectParamValues).length === 0 && selectedStrategy !== 'ddeolsapro_custom' && (
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              선택한 전략에 조정 가능한 숫자형 파라미터가 없습니다.
            </p>
          )}
          </div>
        </div>

        {/* 3. Optimizer Config */}
        {selectedOptimizerInfo && selectedOptimizerInfo.configSchema.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
            <h3 className="text-base font-medium text-gray-900 dark:text-white mb-3">
              옵티마이저 설정 ({selectedOptimizerInfo.name})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {selectedOptimizerInfo.configSchema.map((schema) => (
                <div key={schema.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {schema.label}
                  </label>
                  {schema.type === 'select' && schema.options ? (
                    <select
                      value={optimizerConfig[schema.key] ?? schema.default}
                      onChange={(e) =>
                        setOptimizerConfig((prev) => ({
                          ...prev,
                          [schema.key]: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={isRunning}
                    >
                      {schema.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={
                        optimizerConfig[schema.key] === ''
                          ? ''
                          : (optimizerConfig[schema.key] ?? schema.default).toLocaleString()
                      }
                      onChange={(e) => {
                        const rawValue = e.target.value.replace(/,/g, '');
                        if (rawValue === '') {
                          setOptimizerConfig((prev) => ({ ...prev, [schema.key]: '' }));
                        } else {
                          let parsed = parseFloat(rawValue);
                          if (!isNaN(parsed)) {
                            // 조합 수/샘플링 횟수는 가능 횟수를 초과할 수 없음
                            if (schema.key === 'max_combinations' || schema.key === 'n_samples') {
                              const maxAllowed = estimatedCombinations();
                              if (parsed > maxAllowed) {
                                parsed = maxAllowed;
                              }
                            }
                            setOptimizerConfig((prev) => ({ ...prev, [schema.key]: parsed }));
                          }
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={isRunning}
                    />
                  )}
                </div>
              ))}
            </div>
            {selectedOptimizer === 'grid_search' && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                * 10,000개 조합 기준 6코어에서 약 2~3분 소요됩니다.
              </p>
            )}
            {selectedOptimizer === 'monte_carlo' && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                * 10,000회 기준 6코어에서 약 2~3분 소요됩니다.
              </p>
            )}
          </div>
        )}

        {/* Combination Warning */}
        {showCombinationWarning && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <svg
                className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="flex-1">
                <h4 className="text-yellow-800 dark:text-yellow-200 font-semibold mb-2">
                  조합 수 초과
                </h4>
                <p className="text-yellow-700 dark:text-yellow-300 text-sm mb-3">
                  최대 조합 수: <strong>{estimatedCombinations().toLocaleString()}개</strong>
                  <br />
                  조합 수: <strong>{maxCombinations().toLocaleString()}개</strong>
                </p>
                <p className="text-yellow-600 dark:text-yellow-400 text-xs mb-4">
                  조합 수가 많으면 실행 시간이 오래 걸릴 수 있습니다.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCombinationWarning(false)}
                    className="px-4 py-2 bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded-lg text-sm font-medium hover:bg-yellow-200 dark:hover:bg-yellow-700 transition-colors"
                  >
                    범위 조정
                  </button>
                  <button
                    onClick={confirmAndRun}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 transition-colors"
                  >
                    계속 실행
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Run/Stop Button */}
        <div className="flex justify-center gap-3 mb-6">
          {isRunning ? (
            isActuallyRunning ? (
              <button
                onClick={handleStop}
                className="px-8 py-3 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                  중지
                </span>
              </button>
            ) : (
              <button
                disabled
                className="px-8 py-3 rounded-lg font-semibold text-white bg-yellow-500 cursor-wait transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  진행중...
                </span>
              </button>
            )
          ) : (
            <button
              onClick={handleRunClick}
              disabled={!selectedStrategy || (Object.keys(paramRanges).length === 0 && Object.keys(selectParamValues).length === 0)}
              className={`px-8 py-3 rounded-lg font-semibold text-white transition-colors ${
                !selectedStrategy || (Object.keys(paramRanges).length === 0 && Object.keys(selectParamValues).length === 0)
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              최적화 실행
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
            <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
          </div>
        )}

        {/* 4. Progress */}
        {(progress || cacheInfo) && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-medium text-gray-900 dark:text-white">
                진행 상태
              </h3>
              {isCancelled && (
                <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-sm rounded-full">
                  취소됨
                </span>
              )}
            </div>
            {progress && (
              <div className="mb-3">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                  <span>{progress.percent}%{isCancelled ? ' (취소됨)' : ''}</span>
                  <span>
                    {progress.completed.toLocaleString()} / {progress.total.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all duration-300 ${
                      isCancelled ? 'bg-yellow-500' : 'bg-blue-600'
                    }`}
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}
            {cacheInfo && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                캐시 히트: <span className="text-green-600 dark:text-green-400 font-medium">{cacheInfo.cachedCount.toLocaleString()}개</span>
                {' | '}
                신규 실행: <span className="text-blue-600 dark:text-blue-400 font-medium">{cacheInfo.newCount.toLocaleString()}개</span>
              </div>
            )}
          </div>
        )}

        {/* 5. Results */}
        {(yearlyRankings || cachedRankings) && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <h3 className="text-base font-medium text-gray-900 dark:text-white">
                  결과
                </h3>
                <ResultTabs
                  mode={resultTabMode}
                  onModeChange={(mode) => {
                    setResultTabMode(mode);
                    setCurrentPage(1);
                    setExpandedRows({});
                    setRankingFilters(defaultFilters);
                  }}
                  currentCount={yearlyRankings?.results.length ?? 0}
                  cumulativeCount={cachedRankings?.results.length ?? 0}
                />
              </div>
              <div className="flex items-center gap-3">
                {resultTabMode === 'cumulative' && cachedTotalCount > 0 && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    총 {cachedTotalCount.toLocaleString()}개 캐시
                    {cachedLastUpdated && (
                      <> | {new Date(cachedLastUpdated * 1000).toLocaleDateString()}</>
                    )}
                  </span>
                )}
                {resultTabMode === 'current' && done && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    실행 시간: {(done.totalTime / 1000).toFixed(2)}초
                  </span>
                )}
              </div>
            </div>

            {isCacheLoading && resultTabMode === 'cumulative' && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            )}

            {!isCacheLoading && allResults.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  {resultTabMode === 'current'
                    ? '최적화를 실행하면 결과가 여기에 표시됩니다.'
                    : '캐시된 결과가 없습니다.'}
                </p>
              </div>
            )}

            {/* Ranking Filter Bar */}
            {resultTabMode === 'cumulative' && allResults.length > 0 && (
              <RankingFilterBar
                filters={rankingFilters}
                onFiltersChange={setRankingFilters}
                paramKeys={numericParamKeys}
                paramLabelMap={paramLabelMap}
                filteredCount={filteredResults.length}
                totalCount={allResults.length}
                onReset={() => setRankingFilters(defaultFilters)}
              />
            )}

            {/* Filtered empty state */}
            {filteredResults.length === 0 && allResults.length > 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  필터 조건에 맞는 결과가 없습니다.
                </p>
                <button
                  onClick={() => setRankingFilters(defaultFilters)}
                  className="px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                >
                  필터 초기화
                </button>
              </div>
            )}

            {/* Results Table */}
            {filteredResults.length > 0 && (<>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="w-8 py-2 px-2"></th>
                    <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                      순위
                    </th>
                    <th className="text-center py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                      변동
                    </th>
                    <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                      파라미터
                    </th>
                    <th className="text-right py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                      평균수익률
                    </th>
                    <th className="text-right py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                      최대MDD
                    </th>
                    <th className="text-right py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                      복합점수
                    </th>
                    <th className="text-right py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                      거래횟수
                    </th>
                    <th className="text-center py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                      전연도+
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedResults.map((result) => (
                    <Fragment key={result.rank}>
                      <tr
                        className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                        onClick={() => toggleRowExpansion(result.rank)}
                      >
                        <td className="py-2 px-2 text-center">
                          <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            {expandedRows[result.rank] ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </button>
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                              result.rank === 1
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                                : result.rank === 2
                                ? 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                                : result.rank === 3
                                ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                            }`}
                          >
                            {result.rank}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center text-xs font-medium whitespace-nowrap">
                          {(() => {
                            const change = getRankChange(result);
                            if (change === null) return <span className="text-gray-400">-</span>;
                            if (change === 'new') return <span className="text-blue-500">NEW</span>;
                            if (change > 0) return <span className="text-green-600 dark:text-green-400">▲{change}</span>;
                            if (change < 0) return <span className="text-red-600 dark:text-red-400">▼{Math.abs(change)}</span>;
                            return <span className="text-gray-400">-</span>;
                          })()}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(result.params).map(([key, value]) => (
                              <span
                                key={key}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                              >
                                {paramLabelMap[key] || key}: {typeof value === 'number' ? value.toFixed(value % 1 === 0 ? 0 : 2) : value}
                              </span>
                            ))}
                          </div>
                        </td>
                        {(() => {
                          const negativeYears = result.yearlyResults.filter(yr => yr.totalReturn < 0).length;
                          return (<>
                            <td
                              className={`py-2 px-3 text-right text-sm font-medium ${
                                result.avgReturn >= 0
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {result.avgReturn >= 0 ? '+' : ''}
                              {result.avgReturn.toFixed(1)}%
                            </td>
                            <td className="py-2 px-3 text-right text-sm text-red-600 dark:text-red-400">
                              {result.maxMdd.toFixed(1)}%
                            </td>
                            <td className="py-2 px-3 text-right text-sm text-gray-900 dark:text-white font-medium">
                              {result.compositeScore.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right text-sm text-gray-600 dark:text-gray-400">
                              {result.totalTrades}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {negativeYears === 0 ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-xs font-bold">
                                  {negativeYears}
                                </span>
                              )}
                            </td>
                          </>);
                        })()}
                      </tr>
                      {/* Expanded Row: Parameters + Yearly Details */}
                      {expandedRows[result.rank] && (
                        <tr key={`${result.rank}-expanded`} className="bg-gray-50 dark:bg-gray-700/30">
                          <td colSpan={9} className="py-3 px-4">
                            <div className="text-sm space-y-3">
                              {/* Parameters */}
                              <div>
                                <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">파라미터</div>
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(result.params).map(([key, value]) => (
                                    <span
                                      key={key}
                                      className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
                                    >
                                      {paramLabelMap[key] || key}: {typeof value === 'number' ? value.toFixed(value % 1 === 0 ? 0 : 2) : value}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              {/* Yearly Results */}
                              <div>
                                <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">연도별 성과</div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                                  {result.yearlyResults.map((yr) => (
                                    <div
                                      key={yr.year}
                                      className="bg-white dark:bg-gray-800 rounded px-3 py-2 border border-gray-200 dark:border-gray-600"
                                    >
                                      <div className="font-medium text-gray-900 dark:text-white">{yr.year}</div>
                                      <div className={`text-sm ${yr.totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {yr.totalReturn >= 0 ? '+' : ''}{yr.totalReturn.toFixed(1)}%
                                      </div>
                                      <div className="text-xs text-gray-500 dark:text-gray-400">
                                        MDD: {yr.mdd.toFixed(1)}%
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  &laquo;
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  &lsaquo;
                </button>
                <span className="px-4 py-1 text-sm text-gray-700 dark:text-gray-300">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  &rsaquo;
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  &raquo;
                </button>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  const topResult = filteredResults[0];
                  if (topResult) {
                    const backtestPath = market === 'kr' ? '/backtest/domestic' : '/backtest/overseas';
                    const params = new URLSearchParams({
                      strategy: selectedStrategy,
                      ticker: selectedTicker,
                      ...Object.fromEntries(
                        Object.entries(topResult.params).map(([k, v]) => [k, String(v)])
                      ),
                    });
                    window.open(`${backtestPath}?${params.toString()}`, '_blank');
                  }
                }}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                백테스트에서 확인
              </button>
              <button
                onClick={() => {
                  const results = filteredResults;
                  // CSV with yearly details
                  const years = results[0]?.yearlyResults.map(y => y.year) || [];
                  const yearHeaders = years.flatMap(y => [`${y}_return`, `${y}_mdd`]);
                  const csv = [
                    ['rank', ...Object.keys(results[0]?.params || {}), 'avgReturn', 'stdReturn', 'maxMdd', 'compositeScore', 'totalTrades', ...yearHeaders].join(','),
                    ...results.map((r) => {
                      const yearlyData = years.flatMap(y => {
                        const yr = r.yearlyResults.find(yr => yr.year === y);
                        return [yr?.totalReturn.toFixed(2) || '', yr?.mdd.toFixed(2) || ''];
                      });
                      return [
                        r.rank,
                        ...Object.values(r.params),
                        r.avgReturn.toFixed(2),
                        r.stdReturn.toFixed(2),
                        r.maxMdd.toFixed(2),
                        r.compositeScore.toFixed(4),
                        r.totalTrades,
                        ...yearlyData,
                      ].join(',');
                    }),
                  ].join('\n');

                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `optimizer_${selectedStrategy}_${selectedTicker}_yearly.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                CSV 내보내기
              </button>
            </div>
            </>)}
          </div>
        )}
      </div>
    </div>
  );
}
