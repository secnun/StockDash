'use client';

import { useState } from 'react';

export interface RankingFilters {
  minAvgReturn: number | '';
  maxMaxMdd: number | '';
  minCompositeScore: number | '';
  maxNegativeYears: number | '';
  paramFilters: Record<string, { min: number | ''; max: number | '' }>;
}

export const defaultFilters: RankingFilters = {
  minAvgReturn: '',
  maxMaxMdd: '',
  minCompositeScore: '',
  maxNegativeYears: '',
  paramFilters: {},
};

interface RankingFilterBarProps {
  filters: RankingFilters;
  onFiltersChange: (filters: RankingFilters) => void;
  paramKeys: string[];
  paramLabelMap: Record<string, string>;
  filteredCount: number;
  totalCount: number;
  onReset: () => void;
}

export default function RankingFilterBar({
  filters,
  onFiltersChange,
  paramKeys,
  paramLabelMap,
  filteredCount,
  totalCount,
  onReset,
}: RankingFilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeFilterCount = [
    filters.minAvgReturn !== '',
    filters.maxMaxMdd !== '',
    filters.minCompositeScore !== '',
    filters.maxNegativeYears !== '',
    ...Object.values(filters.paramFilters).map(
      (r) => r.min !== '' || r.max !== ''
    ),
  ].filter(Boolean).length;

  const updateMetric = (
    key: keyof Omit<RankingFilters, 'paramFilters'>,
    value: string
  ) => {
    onFiltersChange({
      ...filters,
      [key]: value === '' ? '' : parseFloat(value),
    });
  };

  const updateParamFilter = (
    paramKey: string,
    field: 'min' | 'max',
    value: string
  ) => {
    const current = filters.paramFilters[paramKey] || { min: '', max: '' };
    onFiltersChange({
      ...filters,
      paramFilters: {
        ...filters.paramFilters,
        [paramKey]: {
          ...current,
          [field]: value === '' ? '' : parseFloat(value),
        },
      },
    });
  };

  return (
    <div className="mb-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
      {/* Header / Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
          <span>필터</span>
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
              {activeFilterCount}개 적용 중
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {filteredCount} / {totalCount}개 표시
          </span>
          {activeFilterCount > 0 && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 cursor-pointer"
            >
              초기화
            </span>
          )}
        </div>
      </button>

      {/* Filter Body */}
      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-200 dark:border-gray-600 space-y-4">
          {/* Metric Filters */}
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              메트릭 필터
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  최소 평균수익률 (%)
                </label>
                <input
                  type="number"
                  value={filters.minAvgReturn}
                  onChange={(e) => updateMetric('minAvgReturn', e.target.value)}
                  placeholder="예: 10"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  최대 MDD (%)
                </label>
                <input
                  type="number"
                  value={filters.maxMaxMdd}
                  onChange={(e) => updateMetric('maxMaxMdd', e.target.value)}
                  placeholder="예: 30"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  최소 복합점수
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={filters.minCompositeScore}
                  onChange={(e) =>
                    updateMetric('minCompositeScore', e.target.value)
                  }
                  placeholder="예: 1.5"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  최대 손실연도 수
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={filters.maxNegativeYears}
                  onChange={(e) =>
                    updateMetric('maxNegativeYears', e.target.value)
                  }
                  placeholder="예: 1"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                />
              </div>
            </div>
          </div>

          {/* Parameter Range Filters */}
          {paramKeys.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                파라미터 범위
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {paramKeys.map((key) => {
                  const range = filters.paramFilters[key] || {
                    min: '',
                    max: '',
                  };
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 dark:text-gray-400 min-w-[100px] truncate">
                        {paramLabelMap[key] || key}
                      </span>
                      <input
                        type="number"
                        value={range.min}
                        onChange={(e) =>
                          updateParamFilter(key, 'min', e.target.value)
                        }
                        placeholder="min"
                        className="w-20 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                      />
                      <span className="text-xs text-gray-400">~</span>
                      <input
                        type="number"
                        value={range.max}
                        onChange={(e) =>
                          updateParamFilter(key, 'max', e.target.value)
                        }
                        placeholder="max"
                        className="w-20 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
