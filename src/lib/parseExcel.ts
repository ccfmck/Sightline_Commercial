import * as XLSX from 'xlsx';
import type { ParseResult } from '../types';
import {
  buildHeaders,
  deriveCostComponents,
  deriveMetadataFields,
  hasAtQuoteSection,
} from './detectMetrics';
import { normalizeRecords } from './normalize';
import { isMeaningfulPartRow } from './rowFilter';
import {
  buildPeriods,
  deriveHistoricalYears,
  deriveQuoteYears,
  getDefaultAnchorYear,
} from './periods';
import { normalizeCellText } from './utils';
import { normalizeCurrencyCode } from './currency';

const PREFERRED_SHEET_NAMES = ['data', 'input', 'sheet1'];

/**
 * Prefer the raw numeric cell value (cell.v) over formatted display text (cell.w).
 * Excel often stores full precision in v while w shows rounded values (e.g. v=192.031, w="192").
 */
export function excelCellToGridValue(cell: XLSX.CellObject): string {
  if (cell.t === 'n' && typeof cell.v === 'number' && Number.isFinite(cell.v)) {
    return String(cell.v);
  }

  if (cell.t === 'd') {
    if (cell.w !== undefined) return normalizeCellText(cell.w);
    if (cell.v !== undefined) return normalizeCellText(cell.v);
  }

  if (cell.w !== undefined) return normalizeCellText(cell.w);
  if (cell.v !== undefined) return normalizeCellText(cell.v);
  return '';
}

function sheetToGrid(sheet: XLSX.WorkSheet): string[][] {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  const grid: string[][] = [];

  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      row.push(cell ? excelCellToGridValue(cell) : '');
    }
    grid.push(row);
  }

  return grid;
}

function hasFourRowHeaderPattern(grid: string[][]): boolean {
  if (grid.length < 5) return false;
  const row1 = grid[0].join(' ').toLowerCase();
  const row4NonEmpty = grid[3].filter((cell) => normalizeCellText(cell)).length;
  return (
    (row1.includes('program') || row1.includes('part') || row1.includes('quote'))
    && row4NonEmpty >= 3
  );
}

function selectSheet(
  workbook: XLSX.WorkBook,
): { sheetName: string; warnings: string[] } {
  const warnings: string[] = [];

  for (const preferred of PREFERRED_SHEET_NAMES) {
    const match = workbook.SheetNames.find(
      (name) => name.toLowerCase() === preferred,
    );
    if (match) {
      warnings.push(`Selected sheet "${match}" (matched preferred name).`);
      return { sheetName: match, warnings };
    }
  }

  for (const name of workbook.SheetNames) {
    const grid = sheetToGrid(workbook.Sheets[name]);
    if (hasFourRowHeaderPattern(grid)) {
      warnings.push(`Selected sheet "${name}" (matched 4-row header pattern).`);
      return { sheetName: name, warnings };
    }
  }

  const fallback = workbook.SheetNames.find((name) => {
    const grid = sheetToGrid(workbook.Sheets[name]);
    return grid.some((row) => row.some((cell) => normalizeCellText(cell)));
  });

  if (fallback) {
    warnings.push(
      `Selected sheet "${fallback}" (first non-empty sheet; header pattern not confirmed).`,
    );
    return { sheetName: fallback, warnings };
  }

  throw new Error('Workbook contains no usable sheets.');
}

export function parseWorkbookGrid(grid: string[][], sheetName: string): ParseResult {
  const warnings: string[] = [];

  if (!hasFourRowHeaderPattern(grid)) {
    warnings.push(
      'Sheet may not follow the expected 4-row header layout; parsing will attempt best effort.',
    );
  }

  const headers = buildHeaders(grid.slice(0, 4));
  const metadataFields = deriveMetadataFields(headers);
  const availableQuoteYears = deriveQuoteYears(headers);
  const availableHistoricalYears = deriveHistoricalYears(headers);
  const hasAtQuote = hasAtQuoteSection(headers);
  const defaultAnchorYear = getDefaultAnchorYear(availableQuoteYears, availableHistoricalYears);
  const costComponents = deriveCostComponents(headers);
  const dataRows = grid.slice(4).filter((row) => isMeaningfulPartRow(row, headers));
  const skippedBlankRows = grid.length - 4 - dataRows.length;
  if (skippedBlankRows > 0) {
    warnings.push(`Omitted ${skippedBlankRows} blank spacer row(s) without program/part identity.`);
  }

  if (!hasAtQuote && !availableHistoricalYears.length) {
    warnings.push('No time periods detected from headers.');
  }

  if (!costComponents.length) {
    warnings.push('No cost components detected from headers.');
  }

  const activeMetrics = headers.filter(
    (h) => h.metricType === 'price' || h.metricType === 'volume' || h.metricType === 'cost',
  );
  if (!activeMetrics.length) {
    warnings.push('No price, volume, or cost columns classified.');
  }

  const records = normalizeRecords(dataRows, headers, costComponents);
  const availableCurrencies = [
    ...new Set(records.map((r) => normalizeCurrencyCode(r.metadata.Currency))),
  ].sort();

  return {
    sheetName,
    warnings,
    headers,
    metadataFields,
    availableQuoteYears,
    availableHistoricalYears,
    hasAtQuote,
    defaultAnchorYear,
    costComponents,
    records,
    rowCount: records.length,
    availableCurrencies,
  };
}

export async function parseExcelFile(file: ArrayBuffer): Promise<ParseResult> {
  const workbook = XLSX.read(file, { type: 'array', cellText: true, raw: false });
  const { sheetName, warnings: sheetWarnings } = selectSheet(workbook);
  const grid = sheetToGrid(workbook.Sheets[sheetName]);
  const result = parseWorkbookGrid(grid, sheetName);
  return {
    ...result,
    warnings: [...sheetWarnings, ...result.warnings],
  };
}

export function getColumnClassificationReport(result: ParseResult): string {
  const lines: string[] = [
    `Sheet: ${result.sheetName}`,
    `Rows parsed: ${result.rowCount}`,
    '',
    'Metadata fields:',
    ...result.metadataFields.map((f) => `  - ${f}`),
    '',
    `Default anchor year: ${result.defaultAnchorYear}`,
    '',
    'Quote years (At Time of Quote):',
    ...result.availableQuoteYears.map((y) => `  - ${y}`),
    '',
    'Historical / estimate years:',
    ...result.availableHistoricalYears.map((y) => `  - ${y}`),
    '',
    `Periods (default anchor ${result.defaultAnchorYear}):`,
    ...buildPeriods(result.defaultAnchorYear, result.hasAtQuote, result.availableHistoricalYears).map(
      (p) => `  - ${p.label} (id: ${p.id}${p.isAnchorYear ? ', anchor year' : ''})`,
    ),
    '',
    'Cost components (header order):',
    ...result.costComponents.map((c) => `  - ${c}`),
    '',
    'Classified metric columns:',
  ];

  const metrics = result.headers.filter(
    (h) => h.metricType === 'price' || h.metricType === 'volume' || h.metricType === 'cost',
  );

  for (const h of metrics) {
    lines.push(
      `  [${h.columnIndex}] ${h.fieldName} → ${h.metricType}`
      + `${h.costComponentKey ? ` (${h.costComponentKey})` : ''}`
      + ` | section: ${h.sectionLabel}`
      + `${h.year ? ` | year: ${h.year}` : ''}`,
    );
  }

  if (result.warnings.length) {
    lines.push('', 'Warnings:');
    result.warnings.forEach((w) => lines.push(`  - ${w}`));
  }

  return lines.join('\n');
}
