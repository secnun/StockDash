import WorldMap from '@/components/dashboard/WorldMap';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 글로벌 M2 자금 흐름 */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            글로벌 M2 자금 흐름
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            주요 금융 중심지 간의 M2 통화량 변화에 따른 글로벌 자금 흐름을 실시간으로 확인하세요
          </p>
          <WorldMap />
        </div>
      </div>
    </div>
  );
}
