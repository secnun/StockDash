import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * 티커 목록과 각 티커의 CSV 파일 경로를 반환
 * GET /api/tickers
 */
export async function GET() {
  const stocksDir = path.join(process.cwd(), '..', 'data', 'stocks', 'us');

  try {
    // 티커 폴더 목록 읽기
    const tickerFolders = fs.readdirSync(stocksDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    const tickers = tickerFolders.map(ticker => {
      const tickerDir = path.join(stocksDir, ticker);

      // 티커 폴더 내 CSV 파일 찾기
      const files = fs.readdirSync(tickerDir)
        .filter(file => file.endsWith('.csv'));

      const csvFile = files.length > 0 ? files[0] : null;

      return {
        id: ticker,
        name: ticker.toUpperCase(),
        file: csvFile ? `/data/stocks/us/${ticker}/${csvFile}` : null,
      };
    }).filter(t => t.file !== null);

    return NextResponse.json({ tickers });
  } catch (error) {
    console.error('Error reading tickers:', error);
    return NextResponse.json({ tickers: [] }, { status: 500 });
  }
}
