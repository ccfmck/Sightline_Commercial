import type {
  AggregatedPeriod,
  AggregationResult,
  PartProgramRecord,
  PeriodDefinition,
  PeriodId,
} from '../types';
import { getRecordPeriodMetrics } from './recordMetrics';

function sumPresentCosts(costs: Record<string, number | null>): number | null {
  const values = Object.values(costs).filter((v): v is number => v !== null && v !== undefined);
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0);
}

function computeEbitMarginPercent(avgPrice: number | null, totalCost: number | null): number | null {
  if (avgPrice === null || totalCost === null || avgPrice === 0) return null;
  return ((avgPrice - totalCost) / avgPrice) * 100;
}

function volumeWeightedAverage(
  values: { value: number; weight: number }[],
): number | null {
  if (!values.length) return null;
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return null;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function hasVolume(volume: number | null | undefined): volume is number {
  return volume !== null && volume !== undefined;
}

function aggregateSinglePeriod(
  record: PartProgramRecord,
  period: PeriodDefinition,
  anchorYear: number,
  costComponents: string[],
): AggregatedPeriod {
  const data = getRecordPeriodMetrics(record, period.id, anchorYear);
  const costs: Record<string, number | null> = {};

  for (const component of costComponents) {
    const value = data?.costs[component];
    if (value !== null && value !== undefined) {
      costs[component] = value;
    }
  }

  const totalCost = sumPresentCosts(costs);
  const avgPrice = data?.avgPrice ?? null;
  const volume = data?.volume ?? null;

  return {
    periodId: period.id,
    label: period.label,
    year: period.year,
    isAnchorYear: period.isAnchorYear,
    volume,
    avgPrice,
    costs,
    totalCost,
    ebitMarginPercent: computeEbitMarginPercent(avgPrice, totalCost),
  };
}

function aggregateMultiPeriod(
  records: PartProgramRecord[],
  period: PeriodDefinition,
  anchorYear: number,
  costComponents: string[],
): AggregatedPeriod {
  const volumes = records
    .map((r) => getRecordPeriodMetrics(r, period.id, anchorYear)?.volume)
    .filter(hasVolume);

  const totalVolume = volumes.length ? volumes.reduce((s, v) => s + v, 0) : null;

  const priceWeighted = records
    .map((r) => {
      const metrics = getRecordPeriodMetrics(r, period.id, anchorYear);
      const price = metrics?.avgPrice;
      const volume = metrics?.volume;
      if (price === null || price === undefined || !hasVolume(volume)) return null;
      return { value: price, weight: volume };
    })
    .filter((v): v is { value: number; weight: number } => v !== null);

  const avgPrice = volumeWeightedAverage(priceWeighted);

  const costs: Record<string, number | null> = {};
  for (const component of costComponents) {
    const weighted = records
      .map((r) => {
        const metrics = getRecordPeriodMetrics(r, period.id, anchorYear);
        const cost = metrics?.costs[component];
        const volume = metrics?.volume;
        if (cost === null || cost === undefined || !hasVolume(volume)) return null;
        return { value: cost, weight: volume };
      })
      .filter((v): v is { value: number; weight: number } => v !== null);

    const averaged = volumeWeightedAverage(weighted);
    if (averaged !== null) {
      costs[component] = averaged;
    }
  }

  const totalCost = sumPresentCosts(costs);

  return {
    periodId: period.id,
    label: period.label,
    year: period.year,
    isAnchorYear: period.isAnchorYear,
    volume: totalVolume,
    avgPrice,
    costs,
    totalCost,
    ebitMarginPercent: computeEbitMarginPercent(avgPrice, totalCost),
  };
}

export function aggregateRecords(
  records: PartProgramRecord[],
  periods: PeriodDefinition[],
  costComponents: string[],
  anchorYear: number,
): AggregationResult | null {
  if (!records.length) return null;

  const aggregatedPeriods =
    records.length === 1
      ? periods.map((p) => aggregateSinglePeriod(records[0], p, anchorYear, costComponents))
      : periods.map((p) => aggregateMultiPeriod(records, p, anchorYear, costComponents));

  const selectionLabel =
    records.length === 1
      ? '1 program/part selected'
      : `${records.length} programs/parts selected — volume-weighted`;

  return {
    periods: aggregatedPeriods,
    selectionLabel,
    costComponents,
    anchorYear,
  };
}

export function formatPeriodAxisLabel(periodId: PeriodId, label: string): string {
  if (periodId === 'at_quote') return 'At Quote';
  return label;
}
