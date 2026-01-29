'use client';

import { useCallback } from 'react';

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

interface PairCardProps {
  selectedPair: SelectedPair;
  coins: Coin[];
  markets: Market[];
  color: string;
  index: number;
  onRemove: () => void;
  onUpdate: (updated: SelectedPair) => void;
}

export default function PairCard({
  selectedPair,
  coins,
  markets,
  color,
  index,
  onRemove,
  onUpdate,
}: PairCardProps) {
  const handleCoinChange = useCallback((coinId: string) => {
    onUpdate({
      ...selectedPair,
      coinId,
    });
  }, [selectedPair, onUpdate]);

  const handleMarketChange = useCallback((marketId: string) => {
    onUpdate({
      ...selectedPair,
      marketId,
    });
  }, [selectedPair, onUpdate]);

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 border-l-4"
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-center gap-3">
        {/* 페어 번호 */}
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {index + 1}
        </div>

        {/* 코인 선택 */}
        <div className="flex-shrink-0 w-40">
          <select
            value={selectedPair.coinId}
            onChange={(e) => handleCoinChange(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">코인 선택</option>
            {coins.map((coin) => (
              <option key={coin.id} value={coin.id}>{coin.name} ({coin.symbol})</option>
            ))}
          </select>
        </div>

        {/* 마켓 선택 */}
        <div className="flex-shrink-0 w-32">
          <select
            value={selectedPair.marketId}
            onChange={(e) => handleMarketChange(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">마켓 선택</option>
            {markets.map((market) => (
              <option key={market.id} value={market.id}>{market.name}</option>
            ))}
          </select>
        </div>

        {/* 페어 정보 */}
        <div className="flex-1 text-xs text-gray-500 dark:text-gray-400">
          {selectedPair.coinId && selectedPair.marketId && (
            <span>
              {coins.find(c => c.id === selectedPair.coinId)?.symbol}/{markets.find(m => m.id === selectedPair.marketId)?.name}
            </span>
          )}
        </div>

        {/* 삭제 버튼 */}
        <button
          onClick={onRemove}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 transition-colors"
          title="페어 제거"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
