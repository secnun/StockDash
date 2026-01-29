import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface DateRangeResponse {
  min: string;
  max: string;
}

/**
 * 암호화폐 CSV 데이터의 날짜 범위 반환
 * GET /api/crypto/date-range?coin=btc&market=usdt
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const coin = searchParams.get('coin');
  const market = searchParams.get('market');

  if (!coin || !market) {
    return NextResponse.json(
      { error: 'coin and market parameters are required' },
      { status: 400 }
    );
  }

  // CSV 파일 경로: data/crypto/{coin}/day/{market}/*.csv
  const cryptoDir = path.join(process.cwd(), '..', 'data', 'crypto', coin.toLowerCase(), 'day', market.toLowerCase());

  try {
    // 디렉토리 존재 확인
    if (!fs.existsSync(cryptoDir)) {
      return NextResponse.json(
        { error: `No data found for ${coin}/${market}` },
        { status: 404 }
      );
    }

    // CSV 파일 찾기
    const files = fs.readdirSync(cryptoDir).filter(file => file.endsWith('.csv'));
    if (files.length === 0) {
      return NextResponse.json(
        { error: `No CSV files found for ${coin}/${market}` },
        { status: 404 }
      );
    }

    const csvPath = path.join(cryptoDir, files[0]);
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.trim().split('\n');

    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSV file has insufficient data' },
        { status: 400 }
      );
    }

    // 첫 번째 데이터 행 (헤더 제외)
    const firstDataLine = lines[1];
    const firstTimestamp = parseInt(firstDataLine.split(',')[0], 10);

    // 마지막 데이터 행
    const lastDataLine = lines[lines.length - 1];
    const lastTimestamp = parseInt(lastDataLine.split(',')[0], 10);

    // Unix timestamp → YYYY-MM-DD 변환
    const formatDate = (timestamp: number): string => {
      const date = new Date(timestamp * 1000);
      return date.toISOString().split('T')[0];
    };

    const response: DateRangeResponse = {
      min: formatDate(firstTimestamp),
      max: formatDate(lastTimestamp),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error reading crypto date range:', error);
    return NextResponse.json(
      { error: 'Failed to read date range' },
      { status: 500 }
    );
  }
}
