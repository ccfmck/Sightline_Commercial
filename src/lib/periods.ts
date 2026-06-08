import type { ColumnHeader, ParseResult, PeriodDefinition } from '../types';
import { DEFAULT_ANCHOR_YEAR } from '../types';

export function deriveQuoteYears(headers: ColumnHeader[]): number[] {
  const years = new Set<number>();
  for (const header of headers) {
    if (header.section === 'at_quote' && (header.metricType === 'price' || header.metricType === 'volume') && header.year) {
      years.add(header.year);
    }
  }
  return [...years].sort((a, b) => a - b);
}

export function deriveHistoricalYears(headers: ColumnHeader[]): number[] {
  const years = new Set<number>();
  for (const header of headers) {
    if (header.section === 'year' && header.year && header.metricType !== 'skip' && header.metricType !== 'metadata') {
      years.add(header.year);
    }
  }
  return [...years].sort((a, b) => a - b);
}

export function getDefaultAnchorYear(quoteYears: number[], historicalYears: number[]): number {
  const all = [...quoteYears, ...historicalYears];
  if (!all.length) return DEFAULT_ANCHOR_YEAR;
  if (all.includes(DEFAULT_ANCHOR_YEAR)) return DEFAULT_ANCHOR_YEAR;
  return Math.max(...all);
}

export function getAvailableAnchorYears(parseResult: Pick<ParseResult, 'availableQuoteYears' | 'availableHistoricalYears'>): number[] {
  const years = new Set([...parseResult.availableQuoteYears, ...parseResult.availableHistoricalYears]);
  return [...years].sort((a, b) => a - b);
}

export function buildPeriods(
  anchorYear: number,
  hasAtQuote: boolean,
  historicalYears: number[],
): PeriodDefinition[] {
  const periods: PeriodDefinition[] = [];

  if (hasAtQuote) {
    periods.push({
      id: 'at_quote',
      label: `At Quote (${anchorYear} est.)`,
      year: anchorYear,
      sortOrder: 0,
      isAnchorYear: true,
    });
  }

  historicalYears.forEach((year, index) => {
    periods.push({
      id: String(year) as `${number}`,
      label: String(year),
      year,
      sortOrder: index + 1,
      isAnchorYear: year === anchorYear,
    });
  });

  return periods;
}
