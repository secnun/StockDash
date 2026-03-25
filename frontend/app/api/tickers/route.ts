import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// market 파라미터 → 실제 디렉토리명 매핑
const MARKET_DIR_MAP: Record<string, string> = {
  kr: 'ko',
};

// 국내 티커 디렉토리명 → 표시명 매핑
const KR_TICKER_NAMES: Record<string, string> = {
  kosdaq150: 'KODEX 코스닥150레버리지',
  kospi200: 'KODEX 레버리지',
};

/**
 * 티커 목록과 각 티커의 CSV 파일 경로를 반환
 * GET /api/tickers?market=us|kr
 */
export async function GET(request: NextRequest) {
  const market = request.nextUrl.searchParams.get('market') || 'us';
  const marketDir = MARKET_DIR_MAP[market] || market;
  const stocksDir = path.join(process.cwd(), '..', 'data', 'stocks', marketDir);

  try {
    // 디렉토리 존재 여부 확인
    if (!fs.existsSync(stocksDir)) {
      return NextResponse.json({ tickers: [] });
    }

    // 티커 폴더 목록 읽기
    const tickerFolders = fs.readdirSync(stocksDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    const tickers = tickerFolders.map(ticker => {
      const tickerDir = path.join(stocksDir, ticker);

      // 티커 폴더 내 일봉(1d) CSV 파일만 찾기 (주봉 등 제외)
      // 새 형식: {ticker}_1d.csv, 구 형식: 1d_*.csv
      const files = fs.readdirSync(tickerDir)
        .filter(file => file.endsWith('.csv') && /(?:_1d\.csv$|(?:^|_)1d_)/.test(file))
        .sort();

      const csvFile = files.length > 0 ? files[files.length - 1] : null;

      const displayName = market === 'kr' ? (KR_TICKER_NAMES[ticker] || ticker.toUpperCase()) : ticker.toUpperCase();

      return {
        id: ticker,
        name: displayName,
        file: csvFile ? `/data/stocks/${marketDir}/${ticker}/${csvFile}` : null,
      };
    }).filter(t => t.file !== null);

    return NextResponse.json({ tickers });
  } catch (error) {
    console.error('Error reading tickers:', error);
    return NextResponse.json({ tickers: [] }, { status: 500 });
  }
}
