import { Strategy } from '@/types/backtest';
import { ddeolsapro1Strategy } from './ddeolsapro1';
import { ddeolsapro1TestStrategy } from './ddeolsapro1Test';

/**
 * 전략 레지스트리
 * 새로운 전략을 추가하려면 여기에 import하고 strategies 객체에 추가
 */
export const strategies: Record<string, Strategy> = {
  [ddeolsapro1Strategy.id]: ddeolsapro1Strategy,
  [ddeolsapro1TestStrategy.id]: ddeolsapro1TestStrategy,
};

/**
 * ID로 전략 가져오기
 */
export function getStrategy(id: string): Strategy | undefined {
  return strategies[id];
}

/**
 * 모든 전략 목록 가져오기
 */
export function getAllStrategies(): Strategy[] {
  return Object.values(strategies);
}

/**
 * 전략 이름으로 검색
 */
export function findStrategyByName(name: string): Strategy | undefined {
  return getAllStrategies().find(
    (s) => s.name.toLowerCase().includes(name.toLowerCase())
  );
}
