import * as XLSX from 'xlsx';
import type { InflationRates, Lever1Settings, Lever4Settings, Lever5Settings } from '../types';
import { excelCellToGridValue } from './parseExcel';
import { normalizeCellText, parseNumericValue } from './utils';

export interface BottomUpInputsParseResult {
  warnings: string[];
  materials: string[];
  breakdownByGroup: Record<string, Record<string, number>>;
  inflation: InflationRates;
  /** True only when the file actually carried an inflation section/rates. */
  hasInflationData: boolean;
  /**
   * The grouping field to apply to Lever 1, resolved against the available
   * metadata fields passed in. Null when no confident match was found.
   */
  detectedGroupingField: string | null;
  /** Raw header text of the file's grouping/identity column (before matching). */
  groupColumnHeader: string | null;
  lever4: Pick<Lever4Settings, 'directBuyByGroup' | 'markupIncreaseByGroup'>;
  lever5: Pick<Lever5Settings, 'targetCmPercentByGroup' | 'globalTargetCmPercent'>;
}

export interface BottomUpInputsParseOptions {
  /**
   * Metadata/grouping field names available in the loaded bottom-up data. Used to
   * fuzzily match the file's grouping column header to a field so Lever 1's
   * grouping field can be set automatically on import.
   */
  groupingFields?: string[];
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

function findSectionRow(grid: string[][], title: string): number {
  const lower = title.toLowerCase();
  for (let r = 0; r < grid.length; r++) {
    const rowText = grid[r].map((c) => normalizeCellText(c).toLowerCase()).join(' ');
    if (rowText.includes(lower)) return r;
  }
  return -1;
}

function parseMaterialsList(grid: string[][], startRow: number): string[] {
  const materials: string[] = [];
  for (let r = startRow + 1; r < grid.length; r++) {
    const label = normalizeCellText(grid[r][0]);
    if (!label) break;
    if (label.toLowerCase().includes('breakdown') || label.toLowerCase().includes('inflation')) break;
    materials.push(label);
  }
  return materials;
}

function parseBreakdownMatrix(
  grid: string[][],
  startRow: number,
  materials: string[],
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  const headerRow = grid[startRow + 1];
  if (!headerRow) return result;

  const materialCols: { material: string; col: number }[] = [];
  for (let c = 1; c < headerRow.length; c++) {
    const header = normalizeCellText(headerRow[c]);
    if (!header) continue;
    const material = materials.find((m) => m.toLowerCase() === header.toLowerCase()) ?? header;
    materialCols.push({ material, col: c });
  }

  for (let r = startRow + 2; r < grid.length; r++) {
    const group = normalizeCellText(grid[r][0]);
    if (!group) break;
    if (group.toLowerCase().includes('inflation') || group.toLowerCase().includes('lever')) break;

    const breakdown: Record<string, number> = {};
    for (const { material, col } of materialCols) {
      const value = parseNumericValue(grid[r][col]);
      if (value !== null) breakdown[material] = value;
    }
    if (Object.keys(breakdown).length > 0) {
      result[group] = breakdown;
    }
  }

  return result;
}

function parseInflationRates(
  grid: string[][],
  startRow: number,
  materials: string[],
): InflationRates {
  const materialRates: Record<string, number> = {};
  let laborRate = 1;
  let burdenRate = 1;

  for (let r = startRow + 1; r < grid.length; r++) {
    const label = normalizeCellText(grid[r][0]).toLowerCase();
    const value = parseNumericValue(grid[r][1]);
    if (!label) break;
    if (label.includes('lever') || label.includes('direct buy')) break;

    if (label.includes('labor')) {
      if (value !== null && value > 0) laborRate = value;
    } else if (label.includes('burden') || label.includes('overhead')) {
      if (value !== null && value > 0) burdenRate = value;
    } else {
      const material = materials.find((m) => label.includes(m.toLowerCase())) ?? normalizeCellText(grid[r][0]);
      if (value !== null && value > 0) materialRates[material] = value;
    }
  }

  for (const m of materials) {
    if (materialRates[m] === undefined) materialRates[m] = 1;
  }

  return { materialRates, laborRate, burdenRate };
}

function parseLever4Grid(grid: string[][]): Pick<Lever4Settings, 'directBuyByGroup' | 'markupIncreaseByGroup'> {
  const directBuyByGroup: Record<string, number> = {};
  const markupIncreaseByGroup: Record<string, number> = {};
  const start = findSectionRow(grid, 'lever 4');
  if (start < 0) return { directBuyByGroup, markupIncreaseByGroup };

  const header = grid[start + 1];
  const directBuyCol = header?.findIndex((h) => normalizeCellText(h).toLowerCase().includes('direct buy')) ?? 1;
  const markupCol = header?.findIndex((h) => normalizeCellText(h).toLowerCase().includes('markup')) ?? 2;

  for (let r = start + 2; r < grid.length; r++) {
    const group = normalizeCellText(grid[r][0]);
    if (!group) break;
    if (group.toLowerCase().includes('lever 5')) break;
    const directBuy = parseNumericValue(grid[r][directBuyCol]);
    const markup = parseNumericValue(grid[r][markupCol]);
    if (directBuy !== null) directBuyByGroup[group] = directBuy;
    if (markup !== null) markupIncreaseByGroup[group] = markup;
  }

  return { directBuyByGroup, markupIncreaseByGroup };
}

function parseLever5Grid(
  grid: string[][],
): Pick<Lever5Settings, 'targetCmPercentByGroup' | 'globalTargetCmPercent'> {
  const targetCmPercentByGroup: Record<string, number> = {};
  let globalTargetCmPercent = 12;
  const start = findSectionRow(grid, 'lever 5');
  if (start < 0) return { targetCmPercentByGroup, globalTargetCmPercent };

  for (let r = start + 1; r < grid.length; r++) {
    const label = normalizeCellText(grid[r][0]);
    const value = parseNumericValue(grid[r][1]);
    if (!label) break;
    if (label.toLowerCase().includes('global')) {
      if (value !== null) globalTargetCmPercent = value;
    } else if (value !== null) {
      targetCmPercentByGroup[label] = value;
    }
  }

  return { targetCmPercentByGroup, globalTargetCmPercent };
}

/** Parse a cell that may carry a trailing percent sign (e.g. "90%") or a bare number. */
function parsePercentCell(raw: string): number | null {
  return parseNumericValue(String(raw).replace(/%/g, ''));
}

/**
 * Normalize a raw group×material matrix to whole-number percents that sum to ~100.
 *
 * Excel stores percent-formatted cells as 0–1 fractions (0.9 for "90%"), while some
 * files type the numbers as 0–100. We inspect the largest magnitude across every
 * value: when nothing exceeds ~1.5 the values are fractions and get scaled ×100;
 * otherwise they are already on a 0–100 scale and pass through unchanged.
 */
function normalizeBreakdownScale(
  rawByGroup: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  let maxAbs = 0;
  for (const breakdown of Object.values(rawByGroup)) {
    for (const value of Object.values(breakdown)) {
      maxAbs = Math.max(maxAbs, Math.abs(value));
    }
  }
  const scale = maxAbs > 0 && maxAbs <= 1.5 ? 100 : 1;
  if (scale === 1) return rawByGroup;

  const scaled: Record<string, Record<string, number>> = {};
  for (const [group, breakdown] of Object.entries(rawByGroup)) {
    const next: Record<string, number> = {};
    for (const [material, value] of Object.entries(breakdown)) {
      next[material] = value * scale;
    }
    scaled[group] = next;
  }
  return scaled;
}

interface MaterialCompositionMatrix {
  groupColumnHeader: string;
  materials: string[];
  breakdownByGroup: Record<string, Record<string, number>>;
}

/**
 * Detect and read a "wide" material-composition matrix: a grouping/identity column
 * followed by one column per material, with a percentage per group in each cell.
 *
 * Tolerant of leading blank rows/columns. Returns null when the grid does not look
 * like such a matrix (e.g. the multi-section inputs template), so the caller can
 * fall back to the legacy section-based parser.
 */
function detectMaterialCompositionMatrix(grid: string[][]): MaterialCompositionMatrix | null {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    const nonEmpty = row
      .map((cell, index) => ({ index, text: normalizeCellText(cell) }))
      .filter((c) => c.text);
    if (nonEmpty.length < 2) continue;

    const groupCol = nonEmpty[0].index;
    const materialCells = nonEmpty.slice(1);
    // Header cells for the material columns must be text labels, not numbers.
    const allText = materialCells.every((c) => parsePercentCell(c.text) === null);
    if (!allText) continue;

    const materialCols = materialCells.map((c) => c.index);
    // Confirm at least one row below carries numeric values under the material columns.
    let breakdownByGroup: Record<string, Record<string, number>> = {};
    const materials = materialCells.map((c) => c.text);
    for (let dr = r + 1; dr < grid.length; dr++) {
      const group = normalizeCellText(grid[dr][groupCol]);
      if (!group) continue;
      const breakdown: Record<string, number> = {};
      for (let mi = 0; mi < materialCols.length; mi++) {
        const value = parsePercentCell(grid[dr][materialCols[mi]] ?? '');
        if (value !== null) breakdown[materials[mi]] = value;
      }
      if (Object.keys(breakdown).length > 0) {
        breakdownByGroup[group] = breakdown;
      }
    }

    if (Object.keys(breakdownByGroup).length === 0) continue;

    breakdownByGroup = normalizeBreakdownScale(breakdownByGroup);
    return { groupColumnHeader: nonEmpty[0].text, materials, breakdownByGroup };
  }
  return null;
}

/** Collapse a field name to comparable tokens/characters for fuzzy matching. */
function normalizeFieldKey(field: string): string {
  return field.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokenizeField(field: string): string[] {
  return field
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Fuzzily match the file's grouping column header against the available grouping
 * fields. Prefers exact match, then substring containment (e.g. "Product Tagging"
 * inside "LPP Product Tagging"), then token (Jaccard) overlap. Returns null when no
 * candidate clears the confidence threshold.
 */
export function matchGroupingField(
  header: string,
  availableFields: string[],
): { field: string; score: number } | null {
  const headerKey = normalizeFieldKey(header);
  if (!headerKey) return null;
  const headerTokens = new Set(tokenizeField(header));

  let best: { field: string; score: number } | null = null;
  for (const field of availableFields) {
    const fieldKey = normalizeFieldKey(field);
    if (!fieldKey) continue;

    let score: number;
    if (fieldKey === headerKey) {
      score = 1;
    } else if (fieldKey.includes(headerKey) || headerKey.includes(fieldKey)) {
      score = 0.85;
    } else {
      const fieldTokens = new Set(tokenizeField(field));
      const intersection = [...headerTokens].filter((t) => fieldTokens.has(t)).length;
      const union = new Set([...headerTokens, ...fieldTokens]).size;
      score = union === 0 ? 0 : intersection / union;
    }

    if (!best || score > best.score) {
      best = { field, score };
    }
  }

  if (best && best.score >= 0.5) return best;
  return null;
}

export function validateBreakdownPercents(
  breakdownByGroup: Record<string, Record<string, number>>,
): string[] {
  const errors: string[] = [];
  for (const [group, breakdown] of Object.entries(breakdownByGroup)) {
    const sum = Object.values(breakdown).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.5) {
      errors.push(`Material breakdown for "${group}" sums to ${sum.toFixed(1)}% (expected 100%).`);
    }
    for (const [material, pct] of Object.entries(breakdown)) {
      if (pct < 0) errors.push(`Negative breakdown % for ${material} in ${group}.`);
    }
  }
  return errors;
}

export function parseBottomUpInputsGrid(
  grid: string[][],
  options: BottomUpInputsParseOptions = {},
): BottomUpInputsParseResult {
  const warnings: string[] = [];
  const groupingFields = options.groupingFields ?? [];

  const hasSectionLayout =
    findSectionRow(grid, 'materials') >= 0 || findSectionRow(grid, 'breakdown') >= 0;

  // Primary path: a plain material-composition matrix (grouping column + one column
  // per material). Only attempted when the multi-section inputs template markers are
  // absent so the legacy template keeps its dedicated parsing.
  if (!hasSectionLayout) {
    const matrix = detectMaterialCompositionMatrix(grid);
    if (matrix) {
      const breakdownErrors = validateBreakdownPercents(matrix.breakdownByGroup);
      warnings.push(...breakdownErrors);

      const match = matchGroupingField(matrix.groupColumnHeader, groupingFields);
      if (match) {
        warnings.push(
          `Matched file grouping column "${matrix.groupColumnHeader}" to field "${match.field}".`,
        );
      } else if (groupingFields.length > 0) {
        warnings.push(
          `Could not confidently match the file's grouping column ` +
            `"${matrix.groupColumnHeader}" to an available field.`,
        );
      }

      return {
        warnings,
        materials: matrix.materials,
        breakdownByGroup: matrix.breakdownByGroup,
        inflation: {
          materialRates: Object.fromEntries(matrix.materials.map((m) => [m, 1])),
          laborRate: 1,
          burdenRate: 1,
        },
        hasInflationData: false,
        detectedGroupingField: match?.field ?? null,
        groupColumnHeader: matrix.groupColumnHeader,
        lever4: { directBuyByGroup: {}, markupIncreaseByGroup: {} },
        lever5: { targetCmPercentByGroup: {}, globalTargetCmPercent: 12 },
      };
    }
  }

  const materialsStart = findSectionRow(grid, 'materials');
  const materials =
    materialsStart >= 0 ? parseMaterialsList(grid, materialsStart) : ['Material A', 'Material B'];

  const breakdownStart = findSectionRow(grid, 'breakdown');
  const breakdownByGroup =
    breakdownStart >= 0 ? parseBreakdownMatrix(grid, breakdownStart, materials) : {};

  const inflationStart = findSectionRow(grid, 'inflation');
  const hasInflationData = inflationStart >= 0;
  const inflation = hasInflationData
    ? parseInflationRates(grid, inflationStart, materials)
    : {
        materialRates: Object.fromEntries(materials.map((m) => [m, 1])),
        laborRate: 1,
        burdenRate: 1,
      };

  const lever4 = parseLever4Grid(grid);
  const lever5 = parseLever5Grid(grid);

  const breakdownErrors = validateBreakdownPercents(breakdownByGroup);
  warnings.push(...breakdownErrors);

  return {
    warnings,
    materials,
    breakdownByGroup,
    inflation,
    hasInflationData,
    detectedGroupingField: null,
    groupColumnHeader: null,
    lever4,
    lever5,
  };
}

export async function parseBottomUpInputsExcelFile(
  file: ArrayBuffer,
  options: BottomUpInputsParseOptions = {},
): Promise<BottomUpInputsParseResult> {
  const workbook = XLSX.read(file, { type: 'array', cellText: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Workbook contains no sheets.');
  const grid = sheetToGrid(workbook.Sheets[sheetName]);
  return parseBottomUpInputsGrid(grid, options);
}

// ---------------------------------------------------------------------------
// Inflation-assumptions import (separate upload from material composition)
// ---------------------------------------------------------------------------

export interface InflationImportOptions {
  /** Materials currently defined in the Lever 1 allocation step, for fuzzy matching. */
  materials?: string[];
}

export interface InflationImportResult {
  warnings: string[];
  /** File cost-type → inflation MULTIPLIER, keyed by the matched current material name. */
  materialRates: Record<string, number>;
  /** Labor inflation multiplier, or null when the file had no labor row/column. */
  laborRate: number | null;
  /** Burden inflation multiplier, or null when the file had no burden row/column. */
  burdenRate: number | null;
  /** Current materials that received a rate from the file. */
  matchedMaterials: string[];
  /** File cost types that could not be matched to a current material (nor labor/burden). */
  unmatchedColumns: string[];
  /** Current materials left without any rate from the file. */
  materialsWithoutRate: string[];
  /** True when the file carried at least one inflation value. */
  hasData: boolean;
}

/** A parsed inflation cell plus whether the source text carried a literal "%". */
interface ParsedInflationCell {
  value: number;
  hadPercent: boolean;
}

function parseInflationCell(raw: string): ParsedInflationCell | null {
  const text = String(raw);
  const hadPercent = /%/.test(text);
  const value = parseNumericValue(text.replace(/%/g, ''));
  if (value === null) return null;
  return { value, hadPercent };
}

type InflationScaleHint = 'percent' | 'multiplier' | 'auto';

/**
 * Convert a raw inflation figure into a cumulative multiplier (1.0 = no change).
 *
 * Heuristic (documented):
 *  - Explicit hints win: a "multiplier" column is passed through; a "percent"
 *    column (or a cell typed with a literal "%") uses `1 + value/100`.
 *  - Otherwise we auto-detect by magnitude:
 *      • |v| >= 3   → whole-number percentage points (e.g. 12, -13.7, 16) → 1 + v/100
 *      • |v| <= 0.5 → an Excel percent fraction (e.g. 0.12, -0.137, 0.162) → 1 + v
 *      • 0.5 < |v| < 3 → already reads as a multiplier (e.g. 0.9, 1.12, 1.5) → v
 *      • v === 0    → 1 (no change)
 * The user's real file stores percents as fractions (-0.137 = "-13.7%"), which the
 * |v| <= 0.5 branch converts to 0.863; typed values like 12 or "12%" become 1.12.
 */
export function inflationValueToMultiplier(
  value: number,
  hint: InflationScaleHint = 'auto',
): number {
  if (hint === 'multiplier') return value;
  if (hint === 'percent') return 1 + value / 100;
  const abs = Math.abs(value);
  if (abs === 0) return 1;
  if (abs >= 3) return 1 + value / 100;
  if (abs <= 0.5) return 1 + value;
  return value;
}

function isLaborLabel(label: string): boolean {
  return /labou?r/i.test(label);
}

function isBurdenLabel(label: string): boolean {
  return /burden|overhead/i.test(label);
}

/**
 * Fuzzily match a file cost-type label against the current materials. Prefers an
 * exact normalized match, then substring containment either way, then token
 * (Jaccard) overlap ≥ 0.5. Case-insensitive and punctuation-insensitive.
 */
export function matchMaterialName(label: string, materials: string[]): string | null {
  const key = normalizeFieldKey(label);
  if (!key) return null;

  for (const m of materials) {
    if (normalizeFieldKey(m) === key) return m;
  }
  for (const m of materials) {
    const mk = normalizeFieldKey(m);
    if (mk && (mk.includes(key) || key.includes(mk))) return m;
  }

  const labelTokens = new Set(tokenizeField(label));
  let best: { material: string; score: number } | null = null;
  for (const m of materials) {
    const mTokens = new Set(tokenizeField(m));
    const intersection = [...labelTokens].filter((t) => mTokens.has(t)).length;
    const union = new Set([...labelTokens, ...mTokens]).size;
    const score = union === 0 ? 0 : intersection / union;
    if (!best || score > best.score) best = { material: m, score };
  }
  return best && best.score >= 0.5 ? best.material : null;
}

interface InflationEntry {
  label: string;
  value: number;
  hadPercent: boolean;
}

/** Wide layout: a header row of cost types with one (or more) value rows beneath. */
function collectWideInflationEntries(grid: string[][]): InflationEntry[] {
  let headerRow = -1;
  let headerScore = 0;
  for (let r = 0; r < grid.length; r++) {
    const textCells = grid[r].filter(
      (c) => normalizeCellText(c) && parseInflationCell(c) === null,
    ).length;
    if (textCells > headerScore) {
      headerScore = textCells;
      headerRow = r;
    }
  }
  if (headerRow < 0) return [];

  const entries: InflationEntry[] = [];
  for (let c = 0; c < grid[headerRow].length; c++) {
    const label = normalizeCellText(grid[headerRow][c]);
    if (!label) continue;
    for (let r = headerRow + 1; r < grid.length; r++) {
      const parsed = parseInflationCell(grid[r][c] ?? '');
      if (parsed) {
        entries.push({ label, value: parsed.value, hadPercent: parsed.hadPercent });
        break;
      }
    }
  }
  return entries;
}

/** Tall layout: a label column with the value in the first numeric cell of each row. */
function collectTallInflationEntries(grid: string[][]): InflationEntry[] {
  const entries: InflationEntry[] = [];
  for (const row of grid) {
    const label = normalizeCellText(row[0]);
    if (!label) continue;
    for (let c = 1; c < row.length; c++) {
      const parsed = parseInflationCell(row[c] ?? '');
      if (parsed) {
        entries.push({ label, value: parsed.value, hadPercent: parsed.hadPercent });
        break;
      }
    }
  }
  return entries;
}

/**
 * Parse a dedicated inflation-assumptions grid into per-material / labor / burden
 * MULTIPLIERS, matching the file's cost-type labels to the current materials.
 * Handles both wide (cost types across a header row) and tall (cost type per row)
 * layouts and both percent and multiplier magnitudes (see inflationValueToMultiplier).
 */
export function parseInflationAssumptionsGrid(
  grid: string[][],
  options: InflationImportOptions = {},
): InflationImportResult {
  const materials = options.materials ?? [];
  const warnings: string[] = [];

  const labelText = grid
    .flat()
    .map((c) => normalizeCellText(c))
    .filter((t) => t && parseInflationCell(t) === null)
    .join(' ')
    .toLowerCase();
  let sectionHint: InflationScaleHint = 'auto';
  if (/multiplier/.test(labelText)) sectionHint = 'multiplier';
  else if (/%|percent/.test(labelText)) sectionHint = 'percent';

  const anyMultiNumericRow = grid.some(
    (row) => row.filter((c) => parseInflationCell(c) !== null).length >= 2,
  );
  const entries = anyMultiNumericRow
    ? collectWideInflationEntries(grid)
    : collectTallInflationEntries(grid);

  const materialRates: Record<string, number> = {};
  let laborRate: number | null = null;
  let burdenRate: number | null = null;
  const matchedMaterials: string[] = [];
  const unmatchedColumns: string[] = [];

  for (const entry of entries) {
    const hint: InflationScaleHint =
      sectionHint !== 'auto' ? sectionHint : entry.hadPercent ? 'percent' : 'auto';
    const multiplier = inflationValueToMultiplier(entry.value, hint);

    if (isLaborLabel(entry.label)) {
      laborRate = multiplier;
      continue;
    }
    if (isBurdenLabel(entry.label)) {
      burdenRate = multiplier;
      continue;
    }
    const matched = matchMaterialName(entry.label, materials);
    if (matched && materialRates[matched] === undefined) {
      materialRates[matched] = multiplier;
      matchedMaterials.push(matched);
    } else if (!matched) {
      unmatchedColumns.push(entry.label);
    }
  }

  const materialsWithoutRate = materials.filter((m) => materialRates[m] === undefined);

  if (unmatchedColumns.length > 0) {
    warnings.push(
      `${unmatchedColumns.length} cost type(s) from the file could not be matched to a ` +
        `current material: ${unmatchedColumns.join(', ')}.`,
    );
  }
  if (materials.length > 0 && materialsWithoutRate.length > 0) {
    warnings.push(
      `No inflation rate found for ${materialsWithoutRate.length} current material(s): ` +
        `${materialsWithoutRate.join(', ')} (left unchanged).`,
    );
  }

  const hasData =
    Object.keys(materialRates).length > 0 || laborRate !== null || burdenRate !== null;
  if (!hasData) {
    warnings.push('No inflation values were found in the file.');
  }

  return {
    warnings,
    materialRates,
    laborRate,
    burdenRate,
    matchedMaterials,
    unmatchedColumns,
    materialsWithoutRate,
    hasData,
  };
}

export async function parseInflationAssumptionsExcelFile(
  file: ArrayBuffer,
  options: InflationImportOptions = {},
): Promise<InflationImportResult> {
  const workbook = XLSX.read(file, { type: 'array', cellText: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Workbook contains no sheets.');
  const grid = sheetToGrid(workbook.Sheets[sheetName]);
  return parseInflationAssumptionsGrid(grid, options);
}

/**
 * Apply imported inflation multipliers onto Lever 1, overriding matched material
 * rates plus labor/burden while leaving unmatched materials at their prior value.
 */
export function mergeInflationIntoLever1(
  lever1: Lever1Settings,
  result: InflationImportResult,
): Lever1Settings {
  const materialRates = { ...lever1.inflation.materialRates };
  for (const [material, rate] of Object.entries(result.materialRates)) {
    materialRates[material] = rate;
  }
  for (const m of lever1.materials) {
    if (materialRates[m] === undefined) materialRates[m] = 1;
  }

  return {
    ...lever1,
    inflation: {
      materialRates,
      laborRate: result.laborRate ?? lever1.inflation.laborRate,
      burdenRate: result.burdenRate ?? lever1.inflation.burdenRate,
    },
  };
}

export function mergeInputsIntoLever1(
  lever1: Lever1Settings,
  inputs: BottomUpInputsParseResult,
): Lever1Settings {
  const materials = inputs.materials.length > 0 ? inputs.materials : lever1.materials;

  // When the file carried explicit inflation data, adopt it. Otherwise keep the
  // user's existing labor/burden and material rates, just ensuring every detected
  // material has a rate (defaulting to 1.0 = no change).
  const inflation = inputs.hasInflationData
    ? inputs.inflation
    : {
        ...lever1.inflation,
        materialRates: Object.fromEntries(
          materials.map((m) => [m, lever1.inflation.materialRates[m] ?? 1]),
        ),
      };

  return {
    ...lever1,
    groupingField: inputs.detectedGroupingField ?? lever1.groupingField,
    materials,
    breakdownByGroup: {
      ...lever1.breakdownByGroup,
      ...inputs.breakdownByGroup,
    },
    inflation,
  };
}
