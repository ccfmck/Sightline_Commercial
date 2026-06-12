export function sumPresentCosts(costs: Record<string, number | null>): number | null {
  const values = Object.values(costs).filter((v): v is number => v !== null && v !== undefined);
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0);
}

export function computeEbitMarginPercent(avgPrice: number | null, totalCost: number | null): number | null {
  if (avgPrice === null || totalCost === null || avgPrice === 0) return null;
  return ((avgPrice - totalCost) / avgPrice) * 100;
}
