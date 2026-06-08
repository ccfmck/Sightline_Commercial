import type { ColumnHeader, PartProgramRecord } from '../types';
import { normalizeCellText, parseNumericValue } from './utils';

function canonicalCostKey(key: string, costComponents: string[]): string {
  const lower = key.toLowerCase();
  const match = costComponents.find((c) => c.toLowerCase() === lower);
  return match ?? key;
}

export function normalizeRecords(
  dataRows: unknown[][],
  headers: ColumnHeader[],
  costComponents: string[],
): PartProgramRecord[] {
  const metadataHeaders = headers.filter((h) => h.metricType === 'metadata');
  const metricHeaders = headers.filter(
    (h) => h.metricType === 'price' || h.metricType === 'volume' || h.metricType === 'cost',
  );

  return dataRows.map((row, rowIndex) => {
    const metadata: Record<string, string> = {};
    for (const header of metadataHeaders) {
      const value = normalizeCellText(row[header.columnIndex]);
      if (value) metadata[header.fieldName] = value;
    }

    const quoteYears: PartProgramRecord['quoteYears'] = {};
    const atQuoteCosts: PartProgramRecord['atQuoteCosts'] = {};
    const periods: PartProgramRecord['periods'] = {};

    for (const header of metricHeaders) {
      const rawValue = row[header.columnIndex];
      const numericValue = parseNumericValue(rawValue);

      if (header.section === 'at_quote') {
        if (header.metricType === 'price' && header.year) {
          if (!quoteYears[header.year]) quoteYears[header.year] = { avgPrice: null, volume: null };
          quoteYears[header.year]!.avgPrice = numericValue;
        } else if (header.metricType === 'volume' && header.year) {
          if (!quoteYears[header.year]) quoteYears[header.year] = { avgPrice: null, volume: null };
          quoteYears[header.year]!.volume = numericValue;
        } else if (header.metricType === 'cost' && header.costComponentKey && numericValue !== null) {
          const key = canonicalCostKey(header.costComponentKey, costComponents);
          atQuoteCosts[key] = numericValue;
        }
        continue;
      }

      if (header.section === 'year' && header.year) {
        const yearKey = String(header.year) as `${number}`;
        if (!periods[yearKey]) periods[yearKey] = { avgPrice: null, volume: null, costs: {} };
        const period = periods[yearKey]!;

        if (header.metricType === 'price') {
          period.avgPrice = numericValue;
        } else if (header.metricType === 'volume') {
          period.volume = numericValue;
        } else if (header.metricType === 'cost' && header.costComponentKey && numericValue !== null) {
          const key = canonicalCostKey(header.costComponentKey, costComponents);
          period.costs[key] = numericValue;
        }
      }
    }

    const idParts = [
      metadata['Part number'],
      metadata['Program Name'],
      metadata['Division'],
      metadata['OEM'],
      String(rowIndex),
    ].filter(Boolean);

    return {
      id: idParts.join(' | ') || `row-${rowIndex}`,
      metadata,
      quoteYears,
      atQuoteCosts,
      periods,
    };
  });
}
