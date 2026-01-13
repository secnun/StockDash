import { OHLCV } from '@/types/backtest';

/**
 * CSV 파일을 파싱하여 OHLCV 데이터로 변환
 * @param csvText CSV 파일 텍스트
 * @returns OHLCV 배열
 */
export function parseCSV(csvText: string): OHLCV[] {
  const lines = csvText.trim().split('\n');
  const data: OHLCV[] = [];

  // 첫 번째 줄이 헤더인지 확인
  const hasHeader = lines[0].toLowerCase().includes('time') ||
                    lines[0].toLowerCase().includes('open');

  const startIndex = hasHeader ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map(v => v.trim());

    if (values.length < 6) continue;

    const ohlcv: OHLCV = {
      time: parseFloat(values[0]),
      open: parseFloat(values[1]),
      high: parseFloat(values[2]),
      low: parseFloat(values[3]),
      close: parseFloat(values[4]),
      volume: parseFloat(values[5]),
    };

    // 유효한 데이터만 추가
    if (!isNaN(ohlcv.time) && !isNaN(ohlcv.close)) {
      data.push(ohlcv);
    }
  }

  return data;
}

/**
 * 파일 경로에서 CSV 데이터 로드
 * @param filePath 파일 경로 (public 폴더 기준)
 * @returns OHLCV 배열
 */
export async function loadCSVFromFile(filePath: string): Promise<OHLCV[]> {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to load file: ${response.statusText}`);
    }
    const csvText = await response.text();
    return parseCSV(csvText);
  } catch (error) {
    console.error('Error loading CSV file:', error);
    throw error;
  }
}

/**
 * 날짜 범위로 데이터 필터링
 * @param data OHLCV 배열
 * @param startTime 시작 타임스탬프 (선택)
 * @param endTime 종료 타임스탬프 (선택)
 * @returns 필터링된 OHLCV 배열
 */
export function filterByDateRange(
  data: OHLCV[],
  startTime?: number,
  endTime?: number
): OHLCV[] {
  return data.filter(candle => {
    if (startTime && candle.time < startTime) return false;
    if (endTime && candle.time > endTime) return false;
    return true;
  });
}

/**
 * 타임스탬프를 날짜 문자열로 변환
 * @param timestamp Unix 타임스탬프
 * @returns YYYY-MM-DD 형식 날짜 문자열
 */
export function timestampToDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString().split('T')[0];
}

/**
 * 날짜 문자열을 타임스탬프로 변환
 * @param dateString YYYY-MM-DD 형식 날짜 문자열
 * @returns Unix 타임스탬프
 */
export function dateToTimestamp(dateString: string): number {
  return Math.floor(new Date(dateString).getTime() / 1000);
}
