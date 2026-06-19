import type { MarginLevel } from '../types';

const MARGIN_LEVEL_ORDER: MarginLevel[] = ['material', 'contribution', 'ebit'];

export function sumPresentCosts(costs: Record<string, number | null>): number | null {
  const values = Object.values(costs).filter((v): v is number => v !== null && v !== undefined);
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0);
}

export function computeMarginPercent(
  avgPrice: number | null,
  marginCost: number | null,
): number | null {
  if (avgPrice === null || marginCost === null || avgPrice === 0) return null;
  return ((avgPrice - marginCost) / avgPrice) * 100;
}

export function computeEbitMarginPercent(avgPrice: number | null, totalCost: number | null): number | null {
  return computeMarginPercent(avgPrice, totalCost);
}

export function sumCostsForMarginLevel(
  costs: Record<string, number | null>,
  componentLevels: Record<string, MarginLevel>,
  targetLevel: MarginLevel,
): number | null {
  const targetIndex = MARGIN_LEVEL_ORDER.indexOf(targetLevel);
  if (targetIndex < 0) return null;

  const includedLevels = new Set(MARGIN_LEVEL_ORDER.slice(0, targetIndex + 1));
  let sum = 0;
  let hasValue = false;

  for (const [component, value] of Object.entries(costs)) {
    if (value === null || value === undefined) continue;
    const level = componentLevels[component] ?? 'ebit';
    if (includedLevels.has(level)) {
      sum += value;
      hasValue = true;
    }
  }

  return hasValue ? sum : null;
}
