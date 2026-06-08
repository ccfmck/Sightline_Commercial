import type { PartProgramRecord, PeriodId, PeriodMetrics } from '../types';

export function getRecordPeriodMetrics(
  record: PartProgramRecord,
  periodId: PeriodId,
  anchorYear: number,
): PeriodMetrics | null {
  if (periodId === 'at_quote') {
    const quote = record.quoteYears[anchorYear];
    const costs = Object.fromEntries(
      Object.entries(record.atQuoteCosts).filter(([, v]) => v !== null && v !== undefined),
    );

    if (!quote && !Object.keys(costs).length) return null;

    return {
      avgPrice: quote?.avgPrice ?? null,
      volume: quote?.volume ?? null,
      costs,
    };
  }

  return record.periods[periodId] ?? null;
}
