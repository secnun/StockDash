'use client';

import { useState, useCallback, useMemo } from 'react';
import { getStrategyColor } from '@/lib/theme/chartTheme';
import { fetchPairPriceData, PairPriceResponse } from '@/lib/api/client';
import PairCard from './PairCard';
import PairPriceChart from './PairPriceChart';
import PremiumChart from './PremiumChart';
import MomentumChart from './MomentumChart';
import SpreadChart from './SpreadChart';
import { PairData, PremiumData, RocData, SpreadData } from './mockPairData';

interface Coin {
  id: string;
  name: string;
  symbol: string;
}

interface Market {
  id: string;
  name: string;
  symbol: string;
}

interface SelectedPair {
  id: string;
  coinId: string;
  marketId: string;
}

interface CryptoPairsBacktestProps {
  coins: Coin[];
  markets: Market[];
  dateRange: { min: string; max: string };
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

const MAX_PAIRS = 4;

function generateUniqueId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// Convert API response to PairData format for charts
function convertToPairData(
  pairId: string,
  response: PairPriceResponse,
  coinSymbol: string,
  marketName: string,
  color: string
): PairData {
  return {
    pairId,
    coinSymbol,
    marketName,
    color,
    data: response.data.map(d => ({
      time: d.time,
      price: d.price,
      changePercent: d.changePercent,
    })),
    startPrice: response.startPrice,
    endPrice: response.endPrice,
    totalChange: response.totalChange,
  };
}

// Calculate premium data (base pair vs target pairs)
function calculatePremiumData(
  basePair: PairData,
  targetPairs: PairData[]
): PremiumData[] {
  return targetPairs.map((target) => {
    const premiumPoints: { time: number; premium: number }[] = [];
    let sumPremium = 0;

    target.data.forEach((point, index) => {
      const basePoint = basePair.data[index];
      if (!basePoint) return;

      const premium = point.changePercent - basePoint.changePercent;
      premiumPoints.push({
        time: point.time,
        premium,
      });
      sumPremium += premium;
    });

    const avgPremium = premiumPoints.length > 0 ? sumPremium / premiumPoints.length : 0;
    const currentPremium = premiumPoints[premiumPoints.length - 1]?.premium || 0;

    return {
      pairId: target.pairId,
      label: `${target.coinSymbol}/${target.marketName}`,
      color: target.color,
      data: premiumPoints,
      avgPremium,
      currentPremium,
    };
  });
}

// Calculate ROC (Rate of Change) for a pair
// ROC[i] = (price[i] - price[i - period]) / price[i - period] * 100
function calculateRocData(pair: PairData, period: number): RocData {
  const rocPoints: { time: number; roc: number }[] = [];

  for (let i = period; i < pair.data.length; i++) {
    const currentPrice = pair.data[i].price;
    const pastPrice = pair.data[i - period].price;
    const roc = ((currentPrice - pastPrice) / pastPrice) * 100;

    rocPoints.push({
      time: pair.data[i].time,
      roc,
    });
  }

  return {
    pairId: pair.pairId,
    label: `${pair.coinSymbol}/${pair.marketName}`,
    color: pair.color,
    data: rocPoints,
  };
}

// Calculate spread between base and compare ROC
// spread = ROC_base - ROC_compare
// spread > 0: 기준 시장이 더 빠르게 상승 (기준 선행)
// spread < 0: 비교 시장이 더 빠르게 상승 (비교 선행)
function calculateSpreadData(
  baseRoc: RocData,
  compareRoc: RocData
): SpreadData {
  const spreadPoints: { time: number; spread: number }[] = [];
  let sumSpread = 0;

  // 두 데이터의 시간을 매칭
  const compareMap = new Map(compareRoc.data.map(d => [d.time, d.roc]));

  baseRoc.data.forEach((point) => {
    const compareValue = compareMap.get(point.time);
    if (compareValue !== undefined) {
      const spread = point.roc - compareValue;
      spreadPoints.push({
        time: point.time,
        spread,
      });
      sumSpread += spread;
    }
  });

  const avgSpread = spreadPoints.length > 0 ? sumSpread / spreadPoints.length : 0;
  const currentSpread = spreadPoints[spreadPoints.length - 1]?.spread || 0;

  return {
    basePairLabel: baseRoc.label,
    comparePairLabel: compareRoc.label,
    color: compareRoc.color,
    data: spreadPoints,
    avgSpread,
    currentSpread,
  };
}

export default function CryptoPairsBacktest({
  coins,
  markets,
  dateRange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: CryptoPairsBacktestProps) {
  const [selectedPairs, setSelectedPairs] = useState<SelectedPair[]>([
    { id: generateUniqueId(), coinId: '', marketId: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChart, setShowChart] = useState(false);
  const [pairDataList, setPairDataList] = useState<PairData[]>([]);
  const [crosshairValues, setCrosshairValues] = useState<Map<string, number>>(new Map());
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [rocPeriod, setRocPeriod] = useState(1); // ROC 기간 (일)
  const [rocPeriodInput, setRocPeriodInput] = useState<number | ''>(1);

  // 페어 추가
  const addPair = useCallback(() => {
    if (selectedPairs.length >= MAX_PAIRS) return;
    setSelectedPairs(prev => [
      ...prev,
      { id: generateUniqueId(), coinId: '', marketId: '' },
    ]);
  }, [selectedPairs.length]);

  // 페어 제거
  const removePair = useCallback((id: string) => {
    setSelectedPairs(prev => prev.filter(p => p.id !== id));
  }, []);

  // 페어 업데이트
  const updatePair = useCallback((updated: SelectedPair) => {
    setSelectedPairs(prev =>
      prev.map(p => p.id === updated.id ? updated : p)
    );
  }, []);

  // 프리미엄 데이터 계산 (첫 번째 페어 기준)
  const premiumData = useMemo<PremiumData[]>(() => {
    if (pairDataList.length < 2) return [];
    const [basePair, ...targetPairs] = pairDataList;
    return calculatePremiumData(basePair, targetPairs);
  }, [pairDataList]);

  // ROC 데이터 계산
  const rocDataList = useMemo<RocData[]>(() => {
    if (pairDataList.length === 0) return [];
    return pairDataList.map((pair) => calculateRocData(pair, rocPeriod));
  }, [pairDataList, rocPeriod]);

  // 스프레드 데이터 계산 (첫 번째 페어 기준 vs 나머지)
  const spreadDataList = useMemo<SpreadData[]>(() => {
    if (rocDataList.length < 2) return [];
    const [baseRoc, ...compareRocs] = rocDataList;
    return compareRocs.map((compareRoc) => calculateSpreadData(baseRoc, compareRoc));
  }, [rocDataList]);

  // 기준 페어 라벨
  const basePairLabel = useMemo(() => {
    if (pairDataList.length === 0) return '';
    return `${pairDataList[0].coinSymbol}/${pairDataList[0].marketName}`;
  }, [pairDataList]);

  // 크로스헤어 이동 핸들러
  const handleCrosshairMove = useCallback((time: number | null, values: Map<string, number>) => {
    if (time === null) {
      setCrosshairValues(new Map());
    } else {
      setCrosshairValues(values);
    }
  }, []);

  // 가격 비교 실행
  const runComparison = useCallback(async () => {
    const validPairs = selectedPairs.filter(p => p.coinId && p.marketId);
    if (validPairs.length === 0) {
      setError('최소 1개의 코인과 마켓을 선택해주세요');
      return;
    }

    if (!startDate || !endDate) {
      setError('날짜를 선택해주세요');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results: PairData[] = [];
      const errors: string[] = [];

      for (let i = 0; i < validPairs.length; i++) {
        const pair = validPairs[i];
        const coin = coins.find(c => c.id === pair.coinId);
        const market = markets.find(m => m.id === pair.marketId);

        try {
          const response = await fetchPairPriceData(
            pair.coinId,
            pair.marketId,
            startDate,
            endDate
          );

          results.push(convertToPairData(
            pair.id,
            response,
            coin?.symbol || pair.coinId.toUpperCase(),
            market?.name || pair.marketId.toUpperCase(),
            getStrategyColor(i)
          ));
          setBackendAvailable(true);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          if (message.includes('Data not found')) {
            errors.push(`${coin?.symbol || pair.coinId}/${market?.name || pair.marketId}: 데이터 없음`);
          } else {
            errors.push(`${coin?.symbol || pair.coinId}/${market?.name || pair.marketId}: ${message}`);
          }
        }
      }

      if (results.length === 0) {
        if (errors.length > 0) {
          setError(errors.join('\n'));
        } else {
          setError('데이터를 불러올 수 없습니다');
        }
        setBackendAvailable(false);
        return;
      }

      if (errors.length > 0) {
        setError(`일부 데이터 로드 실패:\n${errors.join('\n')}`);
      }

      setPairDataList(results);
      setShowChart(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '비교 실행 중 오류 발생');
      setBackendAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [selectedPairs, coins, markets, startDate, endDate]);

  const canAddMore = selectedPairs.length < MAX_PAIRS;
  const validPairCount = selectedPairs.filter(p => p.coinId && p.marketId).length;

  return (
    <div className="space-y-4">
      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-red-800 dark:text-red-200 text-sm whitespace-pre-line">{error}</p>
        </div>
      )}

      {/* 날짜 설정 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">시작일</label>
            <input
              type="date"
              value={startDate}
              min={dateRange.min}
              max={dateRange.max}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">종료일</label>
            <input
              type="date"
              value={endDate}
              min={dateRange.min}
              max={dateRange.max}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              ROC 기간 (일)
            </label>
            <input
              type="number"
              value={rocPeriodInput}
              min={1}
              max={30}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setRocPeriodInput('');
                } else {
                  const num = Number(raw);
                  if (!isNaN(num)) setRocPeriodInput(num);
                }
              }}
              onBlur={() => {
                const val = typeof rocPeriodInput === 'number' ? rocPeriodInput : 1;
                const clamped = Math.max(1, Math.min(30, val));
                setRocPeriodInput(clamped);
                setRocPeriod(clamped);
              }}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* 페어 카드 목록 */}
      <div className="space-y-2">
        {selectedPairs.map((selected, index) => (
          <PairCard
            key={selected.id}
            selectedPair={selected}
            coins={coins}
            markets={markets}
            color={getStrategyColor(index)}
            index={index}
            onRemove={() => removePair(selected.id)}
            onUpdate={updatePair}
          />
        ))}
      </div>

      {/* 페어 추가 및 실행 버튼 */}
      <div className="flex items-center gap-3">
        {canAddMore && (
          <button
            onClick={addPair}
            disabled={loading}
            className="px-4 py-2 text-sm border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            페어 추가 ({selectedPairs.length}/{MAX_PAIRS})
          </button>
        )}

        <button
          onClick={runComparison}
          disabled={loading || validPairCount === 0}
          className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
        >
          {loading ? '로딩중...' : '비교 실행'}
        </button>

        {/* 백엔드 상태 표시 */}
        <span className={`px-2 py-1 text-xs rounded ${backendAvailable ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
          {backendAvailable ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* 결과 표시 */}
      {showChart && pairDataList.length > 0 && (
        <div className="space-y-4">
          {/* 범례 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex flex-wrap gap-4">
              {pairDataList.map((pair) => {
                const currentValue = crosshairValues.get(pair.pairId);
                const displayValue = currentValue !== undefined ? currentValue : pair.totalChange;
                return (
                  <div key={pair.pairId} className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: pair.color }}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {pair.coinSymbol}/{pair.marketName}
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        displayValue >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {displayValue >= 0 ? '+' : ''}{displayValue.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 가격 변화율 차트 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                가격 변화율 (시작일 = 0%)
              </h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                선반영/후반영: 라인 간 시간차 확인
              </span>
            </div>
            <div className="h-[300px]">
              <PairPriceChart
                pairs={pairDataList}
                onCrosshairMove={handleCrosshairMove}
              />
            </div>
          </div>

          {/* 모멘텀 (ROC) 차트 */}
          {rocDataList.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                  모멘텀 (ROC {rocPeriod}일)
                </h2>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  각 시장의 {rocPeriod}일 변화율 비교
                </span>
              </div>
              <div className="h-[200px]">
                <MomentumChart
                  rocDataList={rocDataList}
                  rocPeriod={rocPeriod}
                />
              </div>
            </div>
          )}

          {/* 선행/후행 스프레드 차트 (2개 이상 선택 시) */}
          {spreadDataList.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                  선행/후행 스프레드 (기준: {basePairLabel})
                </h2>
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-gray-500 dark:text-gray-400">기준 선행</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-gray-500 dark:text-gray-400">비교 선행</span>
                  </span>
                </div>
              </div>
              <div className="h-[200px]">
                <SpreadChart spreadDataList={spreadDataList} />
              </div>
              {/* 스프레드 통계 */}
              <div className="mt-3 flex flex-wrap gap-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                {spreadDataList.map((spread, idx) => (
                  <div key={idx} className="text-xs">
                    <span className="text-gray-500 dark:text-gray-400">
                      vs {spread.comparePairLabel}:
                    </span>
                    <span
                      className={`ml-1 font-medium ${
                        spread.currentSpread >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      현재 {spread.currentSpread >= 0 ? '+' : ''}{spread.currentSpread.toFixed(2)}%
                    </span>
                    <span className="ml-2 text-gray-400 dark:text-gray-500">
                      (평균 {spread.avgSpread >= 0 ? '+' : ''}{spread.avgSpread.toFixed(2)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 프리미엄 차트 (2개 이상 선택 시) */}
          {premiumData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                  프리미엄 (기준: {basePairLabel})
                </h2>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  김치 프리미엄 등 마켓 간 괴리
                </span>
              </div>
              <div className="h-[200px]">
                <PremiumChart
                  basePairLabel={basePairLabel}
                  premiumData={premiumData}
                />
              </div>
              {/* 프리미엄 통계 */}
              <div className="mt-3 flex flex-wrap gap-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                {premiumData.map((premium) => (
                  <div key={premium.pairId} className="text-xs">
                    <span className="text-gray-500 dark:text-gray-400">{premium.label}:</span>
                    <span
                      className={`ml-1 font-medium ${
                        premium.currentPremium >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      현재 {premium.currentPremium >= 0 ? '+' : ''}{premium.currentPremium.toFixed(2)}%
                    </span>
                    <span className="ml-2 text-gray-400 dark:text-gray-500">
                      (평균 {premium.avgPremium >= 0 ? '+' : ''}{premium.avgPremium.toFixed(2)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 통계 테이블 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">페어별 통계</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-2">페어</th>
                    <th className="pb-2 text-right">시작가</th>
                    <th className="pb-2 text-right">종료가</th>
                    <th className="pb-2 text-right">변화율</th>
                  </tr>
                </thead>
                <tbody>
                  {pairDataList.map((pair) => (
                    <tr key={pair.pairId} className="border-b border-gray-100 dark:border-gray-700/50">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: pair.color }}
                          />
                          <span className="text-gray-900 dark:text-white">
                            {pair.coinSymbol}/{pair.marketName}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 text-right text-gray-600 dark:text-gray-300">
                        {pair.startPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 text-right text-gray-600 dark:text-gray-300">
                        {pair.endPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className={`py-2 text-right font-medium ${
                        pair.totalChange >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {pair.totalChange >= 0 ? '+' : ''}{pair.totalChange.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 결과 없을 때 */}
      {!showChart && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            코인과 마켓을 선택하고 가격 비교를 클릭해주세요
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">
            현재 BTC/USDT 데이터만 사용 가능합니다
          </p>
        </div>
      )}
    </div>
  );
}
