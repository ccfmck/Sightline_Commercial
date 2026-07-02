import type {
  BottomUpParseResult,
  BottomUpRecord,
  BottomUpYearMetrics,
  CostComponentMapping,
  ParseResult,
} from '../types';
import { normalizeCurrencyCode } from './currency';
import { PART_NUMBER_METADATA_KEY, resolvePartNumberIdentity } from './partNumber';

function sumMappedCosts(
  costs: Record<string, number | null>,
  keys: string[],
): number | null {
  if (keys.length === 0) return null;
  let sum = 0;
  let found = false;
  for (const key of keys) {
    const value = costs[key];
    if (value !== null && value !== undefined) {
      sum += value;
      found = true;
    }
  }
  return found ? sum : null;
}

function buildYearMetrics(
  price: number | null,
  volume: number | null,
  costs: Record<string, number | null>,
  mapping: CostComponentMapping,
  explicitCm: number | null = null,
): BottomUpYearMetrics {
  const materialCost = sumMappedCosts(costs, mapping.material);
  const laborCost = sumMappedCosts(costs, mapping.labor);
  const burdenCost = sumMappedCosts(costs, mapping.burden);

  let cmPerUnit = explicitCm;
  if (
    cmPerUnit === null &&
    price !== null &&
    materialCost !== null &&
    laborCost !== null &&
    burdenCost !== null
  ) {
    cmPerUnit = price - (materialCost + laborCost + burdenCost);
  }

  return {
    price,
    materialCost,
    laborCost,
    burdenCost,
    volume,
    cmPerUnit,
  };
}

export function adaptExistingToBottomUp(
  parseResult: ParseResult,
  beginningYear: number,
  anchorYear: number,
  mapping: CostComponentMapping,
): BottomUpParseResult {
  const warnings: string[] = [];
  const begKey = String(beginningYear) as `${number}`;
  const anchorKey = String(anchorYear) as `${number}`;

  if (!parseResult.availableHistoricalYears.includes(beginningYear)) {
    warnings.push(`Beginning year ${beginningYear} not found in workbook periods.`);
  }
  if (
    !parseResult.availableHistoricalYears.includes(anchorYear) &&
  !parseResult.availableQuoteYears.includes(anchorYear)
  ) {
    warnings.push(`Anchor year ${anchorYear} not found in workbook periods.`);
  }

  const usedIds = new Set<string>();
  let anyDuplicatePartNumber = false;
  let anyMissingPartNumber = false;

  const records: BottomUpRecord[] = parseResult.records.map((record, rowIndex) => {
    const begPeriod = record.periods[begKey];
    const anchorPeriod = record.periods[anchorKey];

    const beginning = buildYearMetrics(
      begPeriod?.avgPrice ?? null,
      begPeriod?.volume ?? null,
      begPeriod?.costs ?? {},
      mapping,
    );
    const anchor = buildYearMetrics(
      anchorPeriod?.avgPrice ?? null,
      anchorPeriod?.volume ?? null,
      anchorPeriod?.costs ?? {},
      mapping,
    );

    // Copy metadata so adding the canonical part-number key never mutates the
    // shared record consumed by the existing (non-bottom-up) flow.
    const metadata = { ...record.metadata };
    const { id, partNumber } = resolvePartNumberIdentity(metadata, rowIndex, usedIds, [record.id]);
    if (partNumber) {
      metadata[PART_NUMBER_METADATA_KEY] = partNumber;
      if (id !== partNumber) anyDuplicatePartNumber = true;
    } else {
      anyMissingPartNumber = true;
    }

    return {
      id,
      metadata,
      currency: normalizeCurrencyCode(record.metadata.Currency),
      beginningYear,
      anchorYear,
      beginning,
      anchor,
    };
  });

  if (anyMissingPartNumber) {
    warnings.push(
      'Some rows are missing a part number; those rows were given a fallback id from the source row identity.',
    );
  }
  if (anyDuplicatePartNumber) {
    warnings.push(
      'Duplicate part numbers were detected; distinct rows were kept and their ids were suffixed to stay unique.',
    );
  }

  const availableYears = [
    ...new Set([
      ...parseResult.availableQuoteYears,
      ...parseResult.availableHistoricalYears,
    ]),
  ].sort((a, b) => a - b);

  const availableCurrencies = parseResult.availableCurrencies;

  return {
    sheetName: parseResult.sheetName,
    warnings: [...parseResult.warnings, ...warnings],
    metadataFields: parseResult.metadataFields,
    availableYears,
    beginningYear,
    anchorYear,
    records,
    rowCount: records.length,
    availableCurrencies,
  };
}

export function buildDefaultCostComponentMapping(
  costComponents: string[],
): CostComponentMapping {
  const lower = (s: string) => s.toLowerCase();
  const material: string[] = [];
  const labor: string[] = [];
  const burden: string[] = [];

  for (const component of costComponents) {
    const l = lower(component);
    if (l.includes('labor')) {
      labor.push(component);
    } else if (l.includes('overhead') || l.includes('burden') || l.includes('fixed')) {
      burden.push(component);
    } else if (l.includes('material') || l.includes('scrap') || l.includes('freight')) {
      material.push(component);
    } else {
      burden.push(component);
    }
  }

  if (material.length === 0 && costComponents.length > 0) {
    material.push(costComponents[0]);
  }

  return { material, labor, burden };
}

export function buildDefaultCostMapping(parseResult: ParseResult): CostComponentMapping {
  return buildDefaultCostComponentMapping(parseResult.costComponents);
}
