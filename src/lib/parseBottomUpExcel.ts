import * as XLSX from 'xlsx';
import type { BottomUpParseResult, BottomUpRecord, BottomUpYearMetrics } from '../types';
import { normalizeCurrencyCode } from './currency';
import { excelCellToGridValue } from './parseExcel';
import { PART_NUMBER_METADATA_KEY, resolvePartNumberIdentity } from './partNumber';
import { normalizeCellText, parseNumericValue } from './utils';

const PREFERRED_SHEET_NAMES = ['bottom-up', 'bottom up', 'data', 'input', 'sheet1'];

const METADATA_SKIP = new Set([
  'currency',
  'beginning year',
  'anchor year',
  'beg year',
]);

/**
 * Last-resort year labels, used ONLY when no calendar year can be detected in the
 * headers. Whenever these are used a loud warning is surfaced so a wrong year is
 * never applied silently.
 */
const FALLBACK_BEGINNING_YEAR = 2020;
const FALLBACK_ANCHOR_YEAR = 2025;

type MetricKey = 'price' | 'materialCost' | 'laborCost' | 'burdenCost' | 'volume' | 'cmPerUnit';

/** Whether a metric column carries a per-unit value or a total (to be divided by volume). */
type ValueType = 'perUnit' | 'total';

interface ColumnSpec {
  index: number;
  period: 'beginning' | 'anchor' | 'metadata' | 'skip';
  metric: MetricKey | null;
  /** null for volume/metadata columns; per-unit vs total for the priced metrics. */
  valueType: ValueType | null;
  fieldName: string;
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

/**
 * Extract 4-digit calendar years (19xx / 20xx) from a header label.
 * Uses digit-boundary lookarounds so a year embedded in a longer number
 * (e.g. a part number like "2000855") is NOT mistaken for a year, while
 * letter-adjacent forms like "FY2025" or "2022 Actual" still match.
 */
function extractYears(text: string): number[] {
  const years: number[] = [];
  const re = /(?<!\d)(?:19|20)\d{2}(?!\d)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    years.push(Number(match[0]));
  }
  return years;
}

/**
 * Resolve a bare 2-digit year token (e.g. "22" in "Sum of 22 Total cost") against
 * the set of already-detected 4-digit years. Only returns a value when exactly one
 * known year shares those last two digits, so it can never fabricate a year.
 */
function resolveTwoDigitYear(text: string, knownYears: number[]): number | null {
  const re = /(?<!\d)(\d{2})(?!\d)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const twoDigit = Number(match[1]);
    const candidates = knownYears.filter((y) => y % 100 === twoDigit);
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}

function classifyMetric(label: string): MetricKey | null {
  const lower = label.toLowerCase();
  // Volume / quantity first so "unit price" is not mistaken for a unit-count column.
  if (
    lower.includes('volume') ||
    lower === 'vol' ||
    lower.includes('quantity') ||
    lower.includes('qty') ||
    /\bunits\b/.test(lower)
  ) {
    return 'volume';
  }
  if (lower.includes('material')) return 'materialCost';
  if (lower.includes('labor') || lower.includes('labour')) return 'laborCost';
  if (lower.includes('burden') || lower.includes('overhead')) return 'burdenCost';
  if (
    lower.includes('cm') ||
    lower.includes('contribution margin') ||
    (lower.includes('margin') && lower.includes('unit'))
  ) {
    return 'cmPerUnit';
  }
  if (lower.includes('price') || lower.includes('sales') || lower.includes('revenue')) {
    return 'price';
  }
  return null;
}

/**
 * Detect whether a priced column holds a per-unit value or a total dollar amount.
 * Defaults to per-unit so existing per-unit templates are unaffected.
 */
function classifyValueType(label: string): ValueType {
  const lower = label.toLowerCase();
  if (
    lower.includes('/unit') ||
    lower.includes('/ unit') ||
    lower.includes('per unit') ||
    /\bunit\b/.test(lower)
  ) {
    return 'perUnit';
  }
  if (
    lower.includes('total') ||
    lower.includes('$') ||
    lower.includes('sales') ||
    lower.includes('revenue') ||
    // Pivot-style aggregations ("Sum of 2022 Labour") are totals across parts,
    // not per-unit figures, so divide them by that year's volume.
    lower.includes('sum of') ||
    lower.includes('contribution margin') ||
    lower.includes('gross margin')
  ) {
    return 'total';
  }
  return 'perUnit';
}

/**
 * Assign a column to the beginning or anchor period.
 *
 * Detection is year-first: when a column carries a calendar year and the file has
 * two distinct years, the earliest year maps to "beginning" and the latest to
 * "anchor" (handles pivot layouts where the year lives in the column label). When
 * years are absent we fall back to the legacy Beginning/Anchor keyword layout.
 */
function classifyPeriod(
  combined: string,
  field: string,
  columnYear: number | null,
  beginningYear: number | null,
  anchorYear: number | null,
): 'beginning' | 'anchor' | 'metadata' | 'skip' {
  if (METADATA_SKIP.has(field.toLowerCase().trim())) return 'skip';
  const lower = combined.toLowerCase();

  if (
    columnYear !== null &&
    beginningYear !== null &&
    anchorYear !== null &&
    beginningYear !== anchorYear
  ) {
    if (columnYear === beginningYear) return 'beginning';
    if (columnYear === anchorYear) return 'anchor';
    // A third/interstitial year is outside the beginning↔anchor comparison.
    return 'metadata';
  }

  if (lower.includes('beginning') || lower.includes('beg ') || lower.startsWith('beg')) {
    return 'beginning';
  }
  if (lower.includes('anchor')) return 'anchor';

  // Single-year files: attribute priced columns to the one detected year.
  if (columnYear !== null && columnYear === beginningYear) return 'beginning';

  return 'metadata';
}

function hasBottomUpHeaderPattern(grid: string[][]): boolean {
  if (grid.length < 2) return false;
  const scanRows = grid.slice(0, 3);
  const text = scanRows.flat().join(' ').toLowerCase();
  return (
    (text.includes('beginning') || text.includes('beg ')) &&
    text.includes('anchor') &&
    (text.includes('material') || text.includes('labor'))
  );
}

interface HeaderModel {
  specs: ColumnSpec[];
  headerRows: number;
  /** Earliest detected calendar year, or null when none was found. */
  beginningYear: number | null;
  /** Latest detected calendar year, or null when none was found. */
  anchorYear: number | null;
  /** All distinct calendar years detected across the header, sorted ascending. */
  detectedYears: number[];
  /** Non-null when year detection was ambiguous or failed. */
  yearDetectionWarning: string | null;
}

function buildColumnSpecs(grid: string[][]): HeaderModel {
  const row0 = grid[0] ?? [];
  const row1 = grid[1] ?? [];
  const row0Filled = row0.filter((c) => normalizeCellText(c)).length;
  const row1Filled = row1.filter((c) => normalizeCellText(c)).length;
  const twoRow = row0Filled >= 2 && row1Filled >= 3 && hasBottomUpHeaderPattern(grid);

  const sections = twoRow ? row0 : row0.map(() => '');
  const fields = twoRow ? row1 : row0;
  const headerRows = twoRow ? 2 : 1;

  // Pass 1: capture the combined header text and any 4-digit year for each column,
  // carrying a section label forward across its (possibly merged) columns.
  interface ColumnDraft {
    index: number;
    field: string;
    combined: string;
    year: number | null;
  }
  const drafts: ColumnDraft[] = [];
  const detectedYearSet = new Set<number>();
  let currentSection = '';

  for (let i = 0; i < fields.length; i++) {
    const sectionCell = normalizeCellText(sections[i]);
    if (sectionCell) currentSection = sectionCell;
    const field = normalizeCellText(fields[i]);
    if (!field) continue;

    const combined = `${currentSection} ${field}`.trim();
    const years = extractYears(combined);
    const year = years.length ? years[0] : null;
    if (year !== null) detectedYearSet.add(year);
    drafts.push({ index: i, field, combined, year });
  }

  const detectedYears = [...detectedYearSet].sort((a, b) => a - b);
  const beginningYear = detectedYears.length ? detectedYears[0] : null;
  const anchorYear = detectedYears.length ? detectedYears[detectedYears.length - 1] : null;

  // Pass 2: assign period/metric/value type now that beginning & anchor years are known.
  const specs: ColumnSpec[] = drafts.map((draft) => {
    let columnYear = draft.year;
    if (columnYear === null && detectedYears.length) {
      columnYear = resolveTwoDigitYear(draft.combined, detectedYears);
    }
    const period = classifyPeriod(draft.combined, draft.field, columnYear, beginningYear, anchorYear);
    const metric = period === 'metadata' || period === 'skip' ? null : classifyMetric(draft.field);
    const valueType = metric && metric !== 'volume' ? classifyValueType(draft.combined) : null;
    return { index: draft.index, period, metric, valueType, fieldName: draft.field };
  });

  let yearDetectionWarning: string | null = null;
  if (detectedYears.length === 0) {
    yearDetectionWarning =
      `Could not detect a calendar year in the header; falling back to ` +
      `${FALLBACK_BEGINNING_YEAR}/${FALLBACK_ANCHOR_YEAR}. Verify the beginning and anchor years.`;
  } else if (detectedYears.length === 1) {
    yearDetectionWarning =
      `Only one calendar year (${detectedYears[0]}) was detected in the header; ` +
      `beginning and anchor years are the same.`;
  }

  return { specs, headerRows, beginningYear, anchorYear, detectedYears, yearDetectionWarning };
}

type PricedMetricKey = Exclude<MetricKey, 'volume'>;

interface RawYearValues {
  perUnit: Partial<Record<PricedMetricKey, number | null>>;
  total: Partial<Record<PricedMetricKey, number | null>>;
  volume: number | null;
}

function emptyRawYearValues(): RawYearValues {
  return { perUnit: {}, total: {}, volume: null };
}

/**
 * Resolve final per-unit metrics for a single year.
 * Prefers explicit per-unit values; otherwise derives per-unit from a total divided
 * by that same year's volume (guarding divide-by-zero -> null). Contribution margin/unit
 * is derived from price minus material/labor/burden when not otherwise provided.
 */
function resolveYearMetrics(raw: RawYearValues): { metrics: BottomUpYearMetrics; derivedFromTotals: boolean } {
  let derivedFromTotals = false;

  const resolve = (metric: PricedMetricKey): number | null => {
    const perUnit = raw.perUnit[metric];
    if (perUnit !== null && perUnit !== undefined) return perUnit;
    const total = raw.total[metric];
    if (total !== null && total !== undefined) {
      if (raw.volume === null || raw.volume === 0) return null;
      derivedFromTotals = true;
      return total / raw.volume;
    }
    return null;
  };

  const price = resolve('price');
  const materialCost = resolve('materialCost');
  const laborCost = resolve('laborCost');
  const burdenCost = resolve('burdenCost');

  let cmPerUnit = resolve('cmPerUnit');
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
    metrics: { price, materialCost, laborCost, burdenCost, volume: raw.volume, cmPerUnit },
    derivedFromTotals,
  };
}

export function parseBottomUpGrid(grid: string[][], sheetName: string): BottomUpParseResult {
  const warnings: string[] = [];

  const {
    specs,
    headerRows,
    beginningYear: detectedBeginningYear,
    anchorYear: detectedAnchorYear,
    detectedYears,
    yearDetectionWarning,
  } = buildColumnSpecs(grid);

  // The keyword layout ("Beginning"/"Anchor") and a year-labelled layout are both
  // valid; only warn about the shape when neither is present.
  if (!hasBottomUpHeaderPattern(grid) && detectedYears.length === 0) {
    warnings.push('Sheet may not follow the bottom-up template layout; parsing will attempt best effort.');
  }
  if (yearDetectionWarning) warnings.push(yearDetectionWarning);

  const headerBegYear = detectedBeginningYear ?? FALLBACK_BEGINNING_YEAR;
  const headerAnchorYear = detectedAnchorYear ?? FALLBACK_ANCHOR_YEAR;

  const metadataFields = specs.filter((s) => s.period === 'metadata').map((s) => s.fieldName);

  const dataRows = grid.slice(headerRows).filter((row) =>
    row.some((cell) => normalizeCellText(cell)),
  );

  let anyDerivedFromTotals = false;
  let anyDuplicatePartNumber = false;
  let anyMissingPartNumber = false;
  const usedIds = new Set<string>();

  const records: BottomUpRecord[] = dataRows.map((row, rowIndex) => {
    const metadata: Record<string, string> = {};
    const beginningRaw = emptyRawYearValues();
    const anchorRaw = emptyRawYearValues();

    for (const spec of specs) {
      const raw = row[spec.index];
      if (spec.period === 'metadata') {
        const text = normalizeCellText(raw);
        if (text) metadata[spec.fieldName] = text;
        continue;
      }
      if (!spec.metric) continue;
      const value = parseNumericValue(raw);
      const target = spec.period === 'beginning' ? beginningRaw : anchorRaw;
      if (spec.metric === 'volume') {
        // Prefer the first non-null volume if multiple volume columns exist.
        if (value !== null && target.volume === null) target.volume = value;
      } else if (spec.valueType === 'total') {
        target.total[spec.metric] = value;
      } else {
        target.perUnit[spec.metric] = value;
      }
    }

    const { metrics: beginning, derivedFromTotals: begDerived } = resolveYearMetrics(beginningRaw);
    const { metrics: anchor, derivedFromTotals: anchorDerived } = resolveYearMetrics(anchorRaw);
    if (begDerived || anchorDerived) anyDerivedFromTotals = true;

    // Part number is the unique row identity. Detect it robustly from the
    // metadata, fall back to program/group + row index when absent, and append a
    // suffix on collisions so distinct rows are never silently merged.
    const { id, partNumber } = resolvePartNumberIdentity(metadata, rowIndex, usedIds, [
      metadata['Program Name'],
      metadata.Program,
      metadata['Product Group'],
      metadata.OEM,
    ]);
    if (partNumber) {
      metadata[PART_NUMBER_METADATA_KEY] = partNumber;
      if (id !== partNumber) anyDuplicatePartNumber = true;
    } else {
      anyMissingPartNumber = true;
    }

    return {
      id,
      metadata,
      currency: normalizeCurrencyCode(metadata.Currency),
      beginningYear: headerBegYear,
      anchorYear: headerAnchorYear,
      beginning,
      anchor,
    };
  });

  if (anyMissingPartNumber) {
    warnings.push(
      'Some rows are missing a part number; those rows were given a fallback id from program/row index.',
    );
  }
  if (anyDuplicatePartNumber) {
    warnings.push(
      'Duplicate part numbers were detected; distinct rows were kept and their ids were suffixed to stay unique.',
    );
  }

  if (anyDerivedFromTotals) {
    warnings.push('Derived per-unit values by dividing totals by the matching year volume.');
  }

  const availableCurrencies = [
    ...new Set(records.map((r) => r.currency)),
  ].sort();

  const availableYears = (
    detectedYears.length ? detectedYears : [headerBegYear, headerAnchorYear]
  )
    .filter((y, i, arr) => arr.indexOf(y) === i)
    .sort((a, b) => a - b);

  return {
    sheetName,
    warnings,
    metadataFields,
    availableYears,
    beginningYear: headerBegYear,
    anchorYear: headerAnchorYear,
    records,
    rowCount: records.length,
    availableCurrencies,
  };
}

function selectBottomUpSheet(workbook: XLSX.WorkBook): { sheetName: string; warnings: string[] } {
  const warnings: string[] = [];
  for (const preferred of PREFERRED_SHEET_NAMES) {
    const match = workbook.SheetNames.find((name) => name.toLowerCase() === preferred);
    if (match) {
      warnings.push(`Selected sheet "${match}" (matched preferred name).`);
      return { sheetName: match, warnings };
    }
  }

  for (const name of workbook.SheetNames) {
    const grid = sheetToGrid(workbook.Sheets[name]);
    if (hasBottomUpHeaderPattern(grid)) {
      warnings.push(`Selected sheet "${name}" (matched bottom-up header pattern).`);
      return { sheetName: name, warnings };
    }
  }

  const fallback = workbook.SheetNames[0];
  if (!fallback) throw new Error('Workbook contains no usable sheets.');
  warnings.push(`Selected sheet "${fallback}" (first sheet; bottom-up pattern not confirmed).`);
  return { sheetName: fallback, warnings };
}

export async function parseBottomUpExcelFile(file: ArrayBuffer): Promise<BottomUpParseResult> {
  const workbook = XLSX.read(file, { type: 'array', cellText: true, raw: false });
  const { sheetName, warnings: sheetWarnings } = selectBottomUpSheet(workbook);
  const grid = sheetToGrid(workbook.Sheets[sheetName]);
  const result = parseBottomUpGrid(grid, sheetName);
  return { ...result, warnings: [...sheetWarnings, ...result.warnings] };
}

/** Returns true when the workbook looks like the simplified bottom-up template (not the 4-row layout). */
export function isBottomUpTemplateWorkbook(file: ArrayBuffer): Promise<boolean> {
  return (async () => {
    const workbook = XLSX.read(file, { type: 'array', cellText: true, raw: false });
    for (const name of workbook.SheetNames) {
      const grid = sheetToGrid(workbook.Sheets[name]);
      if (hasBottomUpHeaderPattern(grid) && !grid[0]?.join(' ').toLowerCase().includes('at time of quote')) {
        return true;
      }
    }
    return false;
  })();
}
