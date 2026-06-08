import type { ColumnHeader, SectionType } from '../types';
import { normalizeCellText } from './utils';

const METADATA_KEYWORDS = [
  'oem',
  'platform',
  'program',
  'part',
  'division',
  'plant',
  'commodity',
  'sop',
  'eop',
  'currency',
  'helper',
  'subgroup',
  'intercompany',
  'production',
  'service',
  'quote date',
  'description',
  'segment',
  'type',
];

const SKIP_FIELD_PATTERNS = [
  /base price/i,
  /revenue/i,
  /ebit/i,
  /margin/i,
  /delta/i,
  /^total /i,
];

export function parseSectionLabel(label: string): {
  section: SectionType;
  year: number | null;
  periodKind: 'at_quote' | 'historical' | 'estimate' | 'other';
} {
  const normalized = normalizeCellText(label).replace(/^<<\s*/, '');

  if (/program|part information/i.test(normalized)) {
    return { section: 'metadata', year: null, periodKind: 'other' };
  }

  if (/at time of quote|at quote/i.test(normalized)) {
    return { section: 'at_quote', year: null, periodKind: 'at_quote' };
  }

  const yearMatch = normalized.match(/(20\d{2})/);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  if (year && /historical actual/i.test(normalized)) {
    return { section: 'year', year, periodKind: 'historical' };
  }

  if (year && /latest estimate|estimate|bp for/i.test(normalized)) {
    return { section: 'year', year, periodKind: 'estimate' };
  }

  if (/other info|margin erosion/i.test(normalized)) {
    return { section: 'other', year: null, periodKind: 'other' };
  }

  if (year) {
    return { section: 'year', year, periodKind: 'historical' };
  }

  return { section: 'other', year: null, periodKind: 'other' };
}

export function normalizeCostComponentKey(fieldName: string): string {
  return normalizeCellText(fieldName)
    .replace(/^at[\s-]?quote\s+/i, '')
    .replace(/^20\d{2}\s+/i, '')
    .trim();
}

function extractYearFromField(fieldName: string): number | null {
  const match = fieldName.match(/^(?:at[\s-]?quote\s+)?(20\d{2})\b/i)
    ?? fieldName.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function isMetadataField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return METADATA_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function shouldSkipField(fieldName: string): boolean {
  return SKIP_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName));
}

export function classifyColumn(
  sectionLabel: string,
  row2: string,
  row3: string,
  row4: string,
  columnIndex: number,
): ColumnHeader {
  const sectionInfo = parseSectionLabel(sectionLabel);
  const fieldName = normalizeCellText(row4) || normalizeCellText(row2) || normalizeCellText(row3);
  const unit = normalizeCellText(row3) || null;
  const combined = [row2, row3, row4].map(normalizeCellText).filter(Boolean).join(' ');

  const base: ColumnHeader = {
    columnIndex,
    section: sectionInfo.section,
    sectionLabel: normalizeCellText(sectionLabel),
    year: sectionInfo.year,
    metricType: 'skip',
    fieldName,
    unit,
    costComponentKey: null,
  };

  if (!fieldName) {
    return base;
  }

  if (sectionInfo.section === 'metadata' || sectionInfo.section === 'other') {
    if (sectionInfo.section === 'metadata' || isMetadataField(fieldName)) {
      return { ...base, metricType: 'metadata' };
    }
    return base;
  }

  if (shouldSkipField(fieldName)) {
    return base;
  }

  if (sectionInfo.section === 'at_quote') {
    const fieldYear = extractYearFromField(fieldName);

    if (/quote price/i.test(fieldName)) {
      if (fieldYear) {
        return { ...base, metricType: 'price', year: fieldYear };
      }
      return base;
    }

    if (/quote volume/i.test(fieldName)) {
      if (fieldYear) {
        return { ...base, metricType: 'volume', year: fieldYear };
      }
      return base;
    }

    if (/at[\s-]?quote/i.test(fieldName) || /variable cost|fixed cost/i.test(combined)) {
      const key = canonicalizeCostKey(normalizeCostComponentKey(fieldName));
      if (key && !shouldSkipField(key)) {
        return {
          ...base,
          metricType: 'cost',
          year: null,
          costComponentKey: key,
        };
      }
    }

    return base;
  }

  if (sectionInfo.section === 'year' && sectionInfo.year) {
    const year = sectionInfo.year;

    if (/average price/i.test(fieldName) || /unit price/i.test(fieldName)) {
      return { ...base, metricType: 'price', year };
    }

    if (/full year volume|volume/i.test(fieldName) && !/quote/i.test(fieldName)) {
      return { ...base, metricType: 'volume', year };
    }

    if (
      /material|labor|overhead|depreciation|tooling|allocation|sg&a/i.test(fieldName)
      && !shouldSkipField(fieldName)
    ) {
      const key = canonicalizeCostKey(normalizeCostComponentKey(fieldName));
      return {
        ...base,
        metricType: 'cost',
        year,
        costComponentKey: key,
      };
    }
  }

  if (isMetadataField(fieldName)) {
    return { ...base, metricType: 'metadata' };
  }

  return base;
}

export function buildHeaders(grid: string[][]): ColumnHeader[] {
  if (grid.length < 4) return [];

  const row1 = grid[0].map(normalizeCellText);
  const row2 = grid[1].map(normalizeCellText);
  const row3 = grid[2].map(normalizeCellText);
  const row4 = grid[3].map(normalizeCellText);

  const filledSections = forwardFillSections(row1);
  const maxCols = Math.max(row1.length, row2.length, row3.length, row4.length);

  const headers: ColumnHeader[] = [];
  for (let i = 0; i < maxCols; i++) {
    headers.push(
      classifyColumn(
        filledSections[i] ?? '',
        row2[i] ?? '',
        row3[i] ?? '',
        row4[i] ?? '',
        i,
      ),
    );
  }

  return headers;
}

function forwardFillSections(row: string[]): string[] {
  const filled = [...row];
  let last = '';
  for (let i = 0; i < filled.length; i++) {
    if (filled[i]) last = filled[i];
    else if (last) filled[i] = last;
  }
  return filled;
}

export function hasAtQuoteSection(headers: ColumnHeader[]): boolean {
  return headers.some(
    (h) => h.section === 'at_quote' && h.metricType !== 'skip' && h.metricType !== 'metadata',
  );
}

export function deriveCostComponents(headers: ColumnHeader[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  const sorted = [...headers]
    .filter((h) => h.metricType === 'cost' && h.costComponentKey)
    .sort((a, b) => a.columnIndex - b.columnIndex);

  for (const header of sorted) {
    const key = header.costComponentKey!;
    const canonical = canonicalizeCostKey(key);
    if (!seen.has(canonical)) {
      seen.add(canonical);
      ordered.push(canonical);
    }
  }

  return ordered;
}

function canonicalizeCostKey(key: string): string {
  const aliases: Record<string, string> = {
    'indirect labor': 'Indirect labor',
    'direct material': 'Direct material',
    'direct labor': 'Direct labor',
    'variable overhead': 'Variable Overhead',
    'fixed overhead': 'Fixed Overhead',
    depreciation: 'Depreciation',
    'amortized tooling': 'Amortized tooling',
    'corporate allocation': 'Corporate allocation',
    'other sg&a': 'Other SG&A',
  };
  const lower = key.toLowerCase();
  return aliases[lower] ?? key;
}

export function deriveMetadataFields(headers: ColumnHeader[]): string[] {
  return headers
    .filter((h) => h.metricType === 'metadata' && h.fieldName)
    .map((h) => h.fieldName)
    .filter((name, index, arr) => arr.indexOf(name) === index);
}
