import { describe, expect, it } from 'vitest';
import {
  inflationValueToMultiplier,
  matchGroupingField,
  matchMaterialName,
  mergeInflationIntoLever1,
  mergeInputsIntoLever1,
  parseBottomUpInputsGrid,
  parseInflationAssumptionsGrid,
} from './parseBottomUpInputsExcel';
import type { Lever1Settings } from '../types';

/**
 * Mirrors the real "Gold - materail composition.xlsx" layout: a leading blank row,
 * a grouping column ("Product Tagging") followed by one column per material, and
 * a percentage per group in each cell. Excel stores percent cells as 0–1 fractions
 * (0.9 for "90%"), which is what `excelCellToGridValue` yields for the parser.
 */
function makeCompositionGrid(values: (string | number)[][]): string[][] {
  return [
    ['', '', '', '', ''],
    ['Product Tagging', 'Steel', 'Resin', 'Rubber', 'Plastic'],
    ...values.map((row) => row.map((v) => String(v))),
  ];
}

const REAL_FILE_GROUPS = ['Interior', 'Exterior', 'HVAC', 'AIS', 'Fluids'];

describe('parseBottomUpInputsGrid — material composition matrix', () => {
  it('detects materials and per-group breakdown from a 0–1 fraction file', () => {
    const grid = makeCompositionGrid(
      REAL_FILE_GROUPS.map((group) => [group, 0, 0.9, 0.1, 0]),
    );

    const result = parseBottomUpInputsGrid(grid, {
      groupingFields: ['Program Name', 'LPP Product Tagging', 'OEM'],
    });

    expect(result.materials).toEqual(['Steel', 'Resin', 'Rubber', 'Plastic']);
    expect(Object.keys(result.breakdownByGroup)).toEqual(REAL_FILE_GROUPS);
    // Fractions normalized to whole-number percents summing to 100.
    expect(result.breakdownByGroup.Interior).toEqual({
      Steel: 0,
      Resin: 90,
      Rubber: 10,
      Plastic: 0,
    });
    for (const group of REAL_FILE_GROUPS) {
      const sum = Object.values(result.breakdownByGroup[group]).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(100, 6);
    }
    expect(result.warnings.some((w) => /sums to/i.test(w))).toBe(false);
  });

  it('handles values already stored on a 0–100 scale', () => {
    const grid = makeCompositionGrid([
      ['Interior', 0, 90, 10, 0],
      ['Exterior', 25, 25, 25, 25],
    ]);

    const result = parseBottomUpInputsGrid(grid, { groupingFields: ['Product Tagging'] });

    expect(result.breakdownByGroup.Interior).toEqual({
      Steel: 0,
      Resin: 90,
      Rubber: 10,
      Plastic: 0,
    });
    expect(result.breakdownByGroup.Exterior).toEqual({
      Steel: 25,
      Resin: 25,
      Rubber: 25,
      Plastic: 25,
    });
  });

  it('parses percentages typed with a trailing % sign', () => {
    const grid = makeCompositionGrid([['Interior', '0%', '90%', '10%', '0%']]);

    const result = parseBottomUpInputsGrid(grid, { groupingFields: ['Product Tagging'] });

    expect(result.breakdownByGroup.Interior).toEqual({
      Steel: 0,
      Resin: 90,
      Rubber: 10,
      Plastic: 0,
    });
  });

  it('does not carry inflation data for a composition-only file', () => {
    const grid = makeCompositionGrid([['Interior', 0, 0.9, 0.1, 0]]);
    const result = parseBottomUpInputsGrid(grid, { groupingFields: ['Product Tagging'] });
    expect(result.hasInflationData).toBe(false);
    expect(result.inflation.materialRates).toEqual({
      Steel: 1,
      Resin: 1,
      Rubber: 1,
      Plastic: 1,
    });
  });
});

describe('grouping-field detection', () => {
  it('matches the file column to a fuzzily-equal available field', () => {
    const grid = makeCompositionGrid([['Interior', 0, 0.9, 0.1, 0]]);
    const result = parseBottomUpInputsGrid(grid, {
      groupingFields: ['Program Name', 'LPP Product Tagging', 'OEM'],
    });
    expect(result.detectedGroupingField).toBe('LPP Product Tagging');
    expect(result.groupColumnHeader).toBe('Product Tagging');
  });

  it('prefers an exact match over a partial one', () => {
    const grid = makeCompositionGrid([['Interior', 0, 0.9, 0.1, 0]]);
    const result = parseBottomUpInputsGrid(grid, {
      groupingFields: ['Product Group', 'Product Tagging'],
    });
    expect(result.detectedGroupingField).toBe('Product Tagging');
  });

  it('returns null (and warns) when no field is a confident match', () => {
    const grid = makeCompositionGrid([['Interior', 0, 0.9, 0.1, 0]]);
    const result = parseBottomUpInputsGrid(grid, {
      groupingFields: ['OEM', 'Program Name'],
    });
    expect(result.detectedGroupingField).toBeNull();
    expect(result.warnings.some((w) => /could not confidently match/i.test(w))).toBe(true);
  });

  it('matchGroupingField is case-insensitive and ignores punctuation', () => {
    expect(matchGroupingField('product group', ['Product Group'])?.field).toBe('Product Group');
    expect(matchGroupingField('OEM', ['oem'])?.field).toBe('oem');
    expect(matchGroupingField('Sub-Business Unit', ['Sub Business Unit'])?.field).toBe(
      'Sub Business Unit',
    );
    expect(matchGroupingField('Product Tagging', ['OEM', 'Region'])).toBeNull();
  });
});

describe('mergeInputsIntoLever1', () => {
  const baseLever1: Lever1Settings = {
    included: true,
    groupingField: '__all__',
    materials: ['Material A', 'Material B'],
    breakdownByGroup: { 'All (single group)': { 'Material A': 50, 'Material B': 50 } },
    inflation: { materialRates: { 'Material A': 1.1, 'Material B': 1.2 }, laborRate: 1.3, burdenRate: 1.4 },
  };

  it('sets grouping field, materials, and breakdown while preserving labor/burden inflation', () => {
    const grid = makeCompositionGrid(
      REAL_FILE_GROUPS.map((group) => [group, 0, 0.9, 0.1, 0]),
    );
    const inputs = parseBottomUpInputsGrid(grid, {
      groupingFields: ['LPP Product Tagging'],
    });

    const merged = mergeInputsIntoLever1(baseLever1, inputs);

    expect(merged.groupingField).toBe('LPP Product Tagging');
    expect(merged.materials).toEqual(['Steel', 'Resin', 'Rubber', 'Plastic']);
    expect(merged.breakdownByGroup.Interior).toEqual({
      Steel: 0,
      Resin: 90,
      Rubber: 10,
      Plastic: 0,
    });
    // No inflation section in the file: labor/burden preserved, new materials default to 1.
    expect(merged.inflation.laborRate).toBe(1.3);
    expect(merged.inflation.burdenRate).toBe(1.4);
    expect(merged.inflation.materialRates).toEqual({
      Steel: 1,
      Resin: 1,
      Rubber: 1,
      Plastic: 1,
    });
  });

  it('keeps the current grouping field when detection fails', () => {
    const grid = makeCompositionGrid([['Interior', 0, 0.9, 0.1, 0]]);
    const inputs = parseBottomUpInputsGrid(grid, { groupingFields: ['OEM'] });
    const merged = mergeInputsIntoLever1(baseLever1, inputs);
    expect(merged.groupingField).toBe('__all__');
  });
});

describe('inflationValueToMultiplier — percent vs multiplier heuristic', () => {
  it('converts whole-number percentage points to a multiplier', () => {
    expect(inflationValueToMultiplier(12)).toBeCloseTo(1.12, 6);
    expect(inflationValueToMultiplier(16.2)).toBeCloseTo(1.162, 6);
    expect(inflationValueToMultiplier(-13.7)).toBeCloseTo(0.863, 6);
  });

  it('converts Excel percent fractions (0–1 scale) to a multiplier', () => {
    // The user's real file stores "-13.7%" as -0.137 and "16.2%" as 0.162.
    expect(inflationValueToMultiplier(0.162)).toBeCloseTo(1.162, 6);
    expect(inflationValueToMultiplier(-0.137)).toBeCloseTo(0.863, 6);
    expect(inflationValueToMultiplier(0.12)).toBeCloseTo(1.12, 6);
  });

  it('passes an already-multiplier value through unchanged', () => {
    expect(inflationValueToMultiplier(1.12)).toBeCloseTo(1.12, 6);
    expect(inflationValueToMultiplier(0.9)).toBeCloseTo(0.9, 6);
    expect(inflationValueToMultiplier(1.5)).toBeCloseTo(1.5, 6);
  });

  it('respects explicit hints', () => {
    expect(inflationValueToMultiplier(1.12, 'multiplier')).toBeCloseTo(1.12, 6);
    expect(inflationValueToMultiplier(12, 'percent')).toBeCloseTo(1.12, 6);
    expect(inflationValueToMultiplier(0, 'auto')).toBe(1);
  });
});

describe('matchMaterialName', () => {
  const materials = ['Steel', 'Resin', 'Rubber', 'Plastic'];
  it('matches case-insensitively and ignores trailing whitespace/punctuation', () => {
    expect(matchMaterialName('steel', materials)).toBe('Steel');
    expect(matchMaterialName('Plastic ', materials)).toBe('Plastic');
    expect(matchMaterialName('RESIN', materials)).toBe('Resin');
  });
  it('returns null when no material is a confident match', () => {
    expect(matchMaterialName('Aluminum', materials)).toBeNull();
  });
});

describe('parseInflationAssumptionsGrid — wide single-row layout (real file)', () => {
  // Mirrors "Gold - inflation.xlsx": a title cell then material/labor/burden columns,
  // with Excel percent cells surfaced as 0–1 fractions and some columns left blank.
  const makeGrid = (): string[][] => [
    ['2022-25 inflation', 'Steel', 'Resin', 'Rubber', 'Plastic', 'Labor', 'Burden'],
    ['', '', '-0.137', '0.162', '', '0.138', '0.137'],
  ];

  it('matches materials, labor and burden and converts fractions to multipliers', () => {
    const result = parseInflationAssumptionsGrid(makeGrid(), {
      materials: ['Steel', 'Resin', 'Rubber', 'Plastic'],
    });

    expect(result.materialRates.Resin).toBeCloseTo(0.863, 3);
    expect(result.materialRates.Rubber).toBeCloseTo(1.162, 3);
    expect(result.laborRate).toBeCloseTo(1.138, 3);
    expect(result.burdenRate).toBeCloseTo(1.137, 3);
    expect(result.hasData).toBe(true);
  });

  it('reports current materials left without a rate', () => {
    const result = parseInflationAssumptionsGrid(makeGrid(), {
      materials: ['Steel', 'Resin', 'Rubber', 'Plastic'],
    });
    // Steel and Plastic columns were blank in the file.
    expect(result.materialsWithoutRate).toEqual(['Steel', 'Plastic']);
    expect(result.warnings.some((w) => /no inflation rate found/i.test(w))).toBe(true);
  });

  it('warns about file cost types that do not match any current material', () => {
    const grid: string[][] = [
      ['inflation', 'Steel', 'Titanium', 'Labor'],
      ['', '12', '8', '5'],
    ];
    const result = parseInflationAssumptionsGrid(grid, { materials: ['Steel', 'Resin'] });
    expect(result.materialRates.Steel).toBeCloseTo(1.12, 6);
    expect(result.laborRate).toBeCloseTo(1.05, 6);
    expect(result.unmatchedColumns).toEqual(['Titanium']);
    expect(result.warnings.some((w) => /could not be matched/i.test(w))).toBe(true);
  });

  it('handles values typed with a literal % sign', () => {
    const grid: string[][] = [
      ['inflation', 'Steel', 'Labor'],
      ['', '12%', '5%'],
    ];
    const result = parseInflationAssumptionsGrid(grid, { materials: ['Steel'] });
    expect(result.materialRates.Steel).toBeCloseTo(1.12, 6);
    expect(result.laborRate).toBeCloseTo(1.05, 6);
  });
});

describe('parseInflationAssumptionsGrid — tall layout', () => {
  it('reads a cost-type-per-row layout', () => {
    const grid: string[][] = [
      ['Steel', '1.1'],
      ['Resin', '1.2'],
      ['Labor', '1.05'],
      ['Burden', '1.03'],
    ];
    const result = parseInflationAssumptionsGrid(grid, { materials: ['Steel', 'Resin'] });
    expect(result.materialRates.Steel).toBeCloseTo(1.1, 6);
    expect(result.materialRates.Resin).toBeCloseTo(1.2, 6);
    expect(result.laborRate).toBeCloseTo(1.05, 6);
    expect(result.burdenRate).toBeCloseTo(1.03, 6);
  });
});

describe('mergeInflationIntoLever1', () => {
  const baseLever1: Lever1Settings = {
    included: true,
    groupingField: '__all__',
    materials: ['Steel', 'Resin', 'Rubber', 'Plastic'],
    breakdownByGroup: {},
    inflation: {
      materialRates: { Steel: 1, Resin: 1, Rubber: 1, Plastic: 1 },
      laborRate: 1,
      burdenRate: 1,
    },
  };

  it('overrides matched rates and labor/burden while leaving unmatched materials unchanged', () => {
    const grid: string[][] = [
      ['2022-25 inflation', 'Steel', 'Resin', 'Rubber', 'Plastic', 'Labor', 'Burden'],
      ['', '', '-0.137', '0.162', '', '0.138', '0.137'],
    ];
    const result = parseInflationAssumptionsGrid(grid, { materials: baseLever1.materials });
    const merged = mergeInflationIntoLever1(baseLever1, result);

    expect(merged.inflation.materialRates.Resin).toBeCloseTo(0.863, 3);
    expect(merged.inflation.materialRates.Rubber).toBeCloseTo(1.162, 3);
    // Unmatched (blank) materials keep their prior value.
    expect(merged.inflation.materialRates.Steel).toBe(1);
    expect(merged.inflation.materialRates.Plastic).toBe(1);
    expect(merged.inflation.laborRate).toBeCloseTo(1.138, 3);
    expect(merged.inflation.burdenRate).toBeCloseTo(1.137, 3);
    // Other Lever 1 fields are untouched.
    expect(merged.groupingField).toBe('__all__');
    expect(merged.materials).toEqual(baseLever1.materials);
  });
});

describe('parseBottomUpInputsGrid — legacy multi-section template', () => {
  it('still parses the section-based inputs template', () => {
    const grid: string[][] = [
      ['Materials'],
      ['Steel'],
      ['Aluminum'],
      ['Breakdown'],
      ['', 'Steel', 'Aluminum'],
      ['Group A', '60', '40'],
      ['Inflation'],
      ['Steel', '1.1'],
      ['Aluminum', '1.2'],
      ['Labor', '1.05'],
      ['Burden', '1.03'],
    ];

    const result = parseBottomUpInputsGrid(grid);

    expect(result.materials).toEqual(['Steel', 'Aluminum']);
    expect(result.breakdownByGroup['Group A']).toEqual({ Steel: 60, Aluminum: 40 });
    expect(result.hasInflationData).toBe(true);
    expect(result.inflation.laborRate).toBeCloseTo(1.05, 6);
    expect(result.detectedGroupingField).toBeNull();
  });
});
