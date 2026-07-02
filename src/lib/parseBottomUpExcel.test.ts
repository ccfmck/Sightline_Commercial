import { describe, expect, it } from 'vitest';
import { parseBottomUpGrid } from './parseBottomUpExcel';

/**
 * Two-row header layout: row 0 carries the period section (Beginning / Anchor),
 * row 1 carries the field labels. Column 0 is metadata (Product Group).
 */
function makeGrid(
  begFields: string[],
  anchorFields: string[],
  begValues: (string | number)[],
  anchorValues: (string | number)[],
  productGroup = 'Group A',
): string[][] {
  const sectionRow = ['', 'Beginning 2020', ...begFields.slice(1).map(() => ''), 'Anchor 2025', ...anchorFields.slice(1).map(() => '')];
  const fieldRow = ['Product Group', ...begFields, ...anchorFields];
  const dataRow: (string | number)[] = [productGroup, ...begValues, ...anchorValues];
  return [sectionRow, fieldRow, dataRow.map((v) => String(v))];
}

const TOTAL_FIELDS = ['Total sales', 'Total material cost', 'Total labor', 'Total burden', 'Volume'];
const PER_UNIT_FIELDS = ['Price/unit', 'Material/unit', 'Labor/unit', 'Burden/unit', 'Volume'];

describe('parseBottomUpGrid — totals with volume', () => {
  it('derives per-unit values by dividing totals by the matching year volume', () => {
    const grid = makeGrid(
      TOTAL_FIELDS,
      TOTAL_FIELDS,
      [100000, 50000, 20000, 10000, 1000],
      [204000, 110000, 44000, 22000, 2000],
    );

    const result = parseBottomUpGrid(grid, 'Sheet1');
    expect(result.records).toHaveLength(1);
    const { beginning, anchor } = result.records[0];

    // Beginning: totals / 1000
    expect(beginning.price).toBeCloseTo(100, 6);
    expect(beginning.materialCost).toBeCloseTo(50, 6);
    expect(beginning.laborCost).toBeCloseTo(20, 6);
    expect(beginning.burdenCost).toBeCloseTo(10, 6);
    expect(beginning.volume).toBe(1000);
    // CM/unit derived = price - (material + labor + burden)
    expect(beginning.cmPerUnit).toBeCloseTo(20, 6);

    // Anchor: totals / 2000 (aligned to the anchor-year volume)
    expect(anchor.price).toBeCloseTo(102, 6);
    expect(anchor.materialCost).toBeCloseTo(55, 6);
    expect(anchor.laborCost).toBeCloseTo(22, 6);
    expect(anchor.burdenCost).toBeCloseTo(11, 6);
    expect(anchor.volume).toBe(2000);
    expect(anchor.cmPerUnit).toBeCloseTo(14, 6);

    expect(result.warnings.some((w) => w.toLowerCase().includes('derived per-unit'))).toBe(true);
  });

  it('aligns the right year: different beginning/anchor volumes', () => {
    const grid = makeGrid(
      TOTAL_FIELDS,
      TOTAL_FIELDS,
      [50000, 25000, 10000, 5000, 500],
      [120000, 60000, 24000, 12000, 1000],
    );
    const result = parseBottomUpGrid(grid, 'Sheet1');
    const { beginning, anchor } = result.records[0];
    expect(beginning.price).toBeCloseTo(100, 6); // 50000 / 500
    expect(anchor.price).toBeCloseTo(120, 6); // 120000 / 1000
  });
});

describe('parseBottomUpGrid — per-unit input', () => {
  it('uses per-unit values directly and leaves them unchanged', () => {
    const grid = makeGrid(
      PER_UNIT_FIELDS,
      PER_UNIT_FIELDS,
      [100, 50, 20, 10, 1000],
      [102, 55, 22, 11, 1000],
    );
    const result = parseBottomUpGrid(grid, 'Sheet1');
    const { beginning, anchor } = result.records[0];

    expect(beginning.price).toBe(100);
    expect(beginning.materialCost).toBe(50);
    expect(beginning.laborCost).toBe(20);
    expect(beginning.burdenCost).toBe(10);
    expect(beginning.cmPerUnit).toBeCloseTo(20, 6);
    expect(anchor.price).toBe(102);
    expect(anchor.cmPerUnit).toBeCloseTo(14, 6);

    // No total derivation warning for a pure per-unit sheet.
    expect(result.warnings.some((w) => w.toLowerCase().includes('derived per-unit'))).toBe(false);
  });

  it('uses an explicit CM/unit column when provided', () => {
    const grid = makeGrid(
      ['Price/unit', 'Material/unit', 'Labor/unit', 'Burden/unit', 'CM/unit', 'Volume'],
      ['Price/unit', 'Material/unit', 'Labor/unit', 'Burden/unit', 'CM/unit', 'Volume'],
      [100, 50, 20, 10, 25, 1000],
      [102, 55, 22, 11, 14, 1000],
    );
    const result = parseBottomUpGrid(grid, 'Sheet1');
    // Explicit CM (25) preferred over derived (20).
    expect(result.records[0].beginning.cmPerUnit).toBe(25);
  });
});

describe('parseBottomUpGrid — plain per-unit labels (no /unit or total keywords)', () => {
  const PLAIN_FIELDS = ['Price', 'Material cost', 'Labor cost', 'Burden cost', 'Volume'];

  it('treats ambiguous priced columns as per-unit and still returns records', () => {
    const grid = makeGrid(
      PLAIN_FIELDS,
      PLAIN_FIELDS,
      [100, 50, 20, 10, 1000],
      [102, 55, 22, 11, 1000],
    );
    const result = parseBottomUpGrid(grid, 'Sheet1');

    // Regression: the totals-parsing changes must not zero out a normal per-unit file.
    expect(result.records).toHaveLength(1);
    const { beginning } = result.records[0];
    expect(beginning.price).toBe(100);
    expect(beginning.materialCost).toBe(50);
    expect(beginning.laborCost).toBe(20);
    expect(beginning.burdenCost).toBe(10);
    expect(beginning.cmPerUnit).toBeCloseTo(20, 6);
    expect(result.warnings.some((w) => w.toLowerCase().includes('derived per-unit'))).toBe(false);
  });
});

describe('parseBottomUpGrid — no data rows', () => {
  it('returns zero records (so the UI can surface an explicit error)', () => {
    const sectionRow = ['', 'Beginning 2020', '', '', '', 'Anchor 2025', '', '', '', ''];
    const fieldRow = [
      'Product Group',
      'Price/unit',
      'Material/unit',
      'Labor/unit',
      'Burden/unit',
      'Volume',
      'Price/unit',
      'Material/unit',
      'Labor/unit',
      'Burden/unit',
      'Volume',
    ];
    const result = parseBottomUpGrid([sectionRow, fieldRow], 'Sheet1');
    expect(result.records).toHaveLength(0);
    expect(result.rowCount).toBe(0);
  });
});

describe('parseBottomUpGrid — mixed per-unit and totals', () => {
  it('prefers per-unit where present and derives the rest from totals', () => {
    const grid = makeGrid(
      ['Price/unit', 'Total material cost', 'Labor/unit', 'Total burden', 'Volume'],
      ['Price/unit', 'Total material cost', 'Labor/unit', 'Total burden', 'Volume'],
      [100, 50000, 20, 10000, 1000],
      [102, 55000, 22, 11000, 1000],
    );
    const result = parseBottomUpGrid(grid, 'Sheet1');
    const { beginning } = result.records[0];
    expect(beginning.price).toBe(100); // per-unit used directly
    expect(beginning.materialCost).toBeCloseTo(50, 6); // 50000 / 1000
    expect(beginning.laborCost).toBe(20); // per-unit used directly
    expect(beginning.burdenCost).toBeCloseTo(10, 6); // 10000 / 1000
    expect(beginning.cmPerUnit).toBeCloseTo(20, 6);
  });
});

describe('parseBottomUpGrid — pivot layout with years in column headers', () => {
  // Mirrors "Gold - ABC data pivot.xlsx": a single header row where each column
  // embeds its calendar year (2022 beginning, 2025 anchor) as a "Sum of <year> ..." label.
  const HEADER = [
    'Part Number',
    'Program',
    'OEM',
    'Sum of 2022 Sales (Actual)',
    'Sum of 2022 Quantity (Actual)',
    'Sum of 2022 Contribution Margin (Actual)',
    'Sum of 2022 Labour (Actual)',
    'Sum of 2022 Fixed Burden',
    'Sum of 2022 Material $ (actual)',
    'Sum of 22 Total cost',
    'Sum of 2025 Sales (Actual)',
    'Sum of 2025 Quantity (Actual)',
    'Sum of 2025 Gross Margin (Actual)',
    'Sum of 2025 Contribution Margin (Actual)',
    'Sum of 2025 Labour (Actual)',
    'Sum of 2025 Fixed Burden',
    'Sum of 2025 Material $ (actual)',
    'Sum of 25 Total cost',
  ];
  const DATA = [
    '32504',
    'GMTS GMT400/600',
    'GENERAL MOTORS',
    '100000', '1000', '20000', '20000', '10000', '50000', '80000',
    '204000', '2000', '30000', '28000', '44000', '22000', '110000', '176000',
  ];

  it('detects 2022 as beginning and 2025 as anchor (not the hardcoded 2020)', () => {
    const result = parseBottomUpGrid([HEADER, DATA], 'Sheet2');
    expect(result.beginningYear).toBe(2022);
    expect(result.anchorYear).toBe(2025);
    expect(result.availableYears).toEqual([2022, 2025]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].beginningYear).toBe(2022);
    expect(result.records[0].anchorYear).toBe(2025);
  });

  it('maps each metric to the correct year and derives per-unit from totals ÷ that year volume', () => {
    const result = parseBottomUpGrid([HEADER, DATA], 'Sheet2');
    const { beginning, anchor } = result.records[0];

    // Beginning (2022): totals / 1000
    expect(beginning.price).toBeCloseTo(100, 6);
    expect(beginning.materialCost).toBeCloseTo(50, 6);
    expect(beginning.laborCost).toBeCloseTo(20, 6);
    expect(beginning.burdenCost).toBeCloseTo(10, 6);
    expect(beginning.volume).toBe(1000);
    // Explicit contribution margin column (20000 / 1000 = 20).
    expect(beginning.cmPerUnit).toBeCloseTo(20, 6);

    // Anchor (2025): totals / 2000 — aligned to the anchor-year volume, not 2022's.
    expect(anchor.price).toBeCloseTo(102, 6);
    expect(anchor.materialCost).toBeCloseTo(55, 6);
    expect(anchor.laborCost).toBeCloseTo(22, 6);
    expect(anchor.burdenCost).toBeCloseTo(11, 6);
    expect(anchor.volume).toBe(2000);
    // Uses Contribution Margin (28000 / 2000 = 14), not Gross Margin.
    expect(anchor.cmPerUnit).toBeCloseTo(14, 6);

    expect(result.warnings.some((w) => w.toLowerCase().includes('derived per-unit'))).toBe(true);
  });

  it('keeps pivot identity columns as metadata', () => {
    const result = parseBottomUpGrid([HEADER, DATA], 'Sheet2');
    expect(result.metadataFields).toEqual(
      expect.arrayContaining(['Part Number', 'Program', 'OEM']),
    );
  });
});

describe('parseBottomUpGrid — flexible year formats', () => {
  it('detects years with prefixes/suffixes (FY2025, "2022 Actual")', () => {
    const header = [
      'Product Group',
      '2022 Actual Price/unit',
      '2022 Actual Volume',
      'FY2025 Price/unit',
      'FY2025 Volume',
    ];
    const data = ['Group A', '100', '1000', '110', '1200'];
    const result = parseBottomUpGrid([header, data], 'Sheet1');
    expect(result.beginningYear).toBe(2022);
    expect(result.anchorYear).toBe(2025);
    expect(result.records[0].beginning.price).toBe(100);
    expect(result.records[0].anchor.price).toBe(110);
  });

  it('ignores year-like digits embedded in longer numbers', () => {
    // "2000855" must NOT be read as the year 2000.
    const header = ['Part Number', 'Sum of 2022 Price/unit', 'Sum of 2025 Price/unit'];
    const data = ['2000855', '100', '110'];
    const result = parseBottomUpGrid([header, data], 'Sheet1');
    expect(result.availableYears).toEqual([2022, 2025]);
  });

  it('warns instead of silently defaulting when no year is present', () => {
    const header = ['Product Group', 'Beginning Price/unit', 'Beginning Volume', 'Anchor Price/unit', 'Anchor Volume'];
    const data = ['Group A', '100', '1000', '110', '1200'];
    const result = parseBottomUpGrid([header, data], 'Sheet1');
    // Falls back to the documented defaults, but loudly.
    expect(result.beginningYear).toBe(2020);
    expect(result.anchorYear).toBe(2025);
    expect(result.warnings.some((w) => w.toLowerCase().includes('could not detect'))).toBe(true);
    // Keyword layout still routes values to the right period.
    expect(result.records[0].beginning.price).toBe(100);
    expect(result.records[0].anchor.price).toBe(110);
  });
});

describe('parseBottomUpGrid — part number as unique row identity', () => {
  const HEADER = [
    'Part Number',
    'Program',
    'Sum of 2022 Sales (Actual)',
    'Sum of 2022 Quantity (Actual)',
    'Sum of 2025 Sales (Actual)',
    'Sum of 2025 Quantity (Actual)',
  ];

  it('uses the detected "Part Number" column as the record id and canonical metadata', () => {
    const result = parseBottomUpGrid(
      [
        HEADER,
        ['32504', 'GMT400', '100000', '1000', '204000', '2000'],
        ['A-778', 'GMT600', '50000', '500', '90000', '900'],
      ],
      'Sheet1',
    );

    expect(result.records.map((r) => r.id)).toEqual(['32504', 'A-778']);
    // Raw part number is available under the canonical metadata key for display.
    expect(result.records[0].metadata['Part number']).toBe('32504');
    expect(result.records[1].metadata['Part number']).toBe('A-778');
  });

  it('keeps duplicate part numbers as distinct rows with suffixed ids', () => {
    const result = parseBottomUpGrid(
      [
        HEADER,
        ['32504', 'GMT400', '100000', '1000', '204000', '2000'],
        ['32504', 'GMT600', '50000', '500', '90000', '900'],
      ],
      'Sheet1',
    );

    expect(result.records).toHaveLength(2);
    expect(result.records[0].id).toBe('32504');
    expect(result.records[1].id).toBe('32504 (#2)');
    // Both keep the raw part number as the visible label.
    expect(result.records[0].metadata['Part number']).toBe('32504');
    expect(result.records[1].metadata['Part number']).toBe('32504');
    expect(result.warnings.some((w) => w.toLowerCase().includes('duplicate part numbers'))).toBe(
      true,
    );
  });

  it('falls back gracefully when the part number is missing', () => {
    const result = parseBottomUpGrid(
      [
        HEADER,
        ['', 'GMT400', '100000', '1000', '204000', '2000'],
        ['', 'GMT600', '50000', '500', '90000', '900'],
      ],
      'Sheet1',
    );

    expect(result.records).toHaveLength(2);
    // Distinct rows even without a part number (fallback uses program + row index).
    expect(new Set(result.records.map((r) => r.id)).size).toBe(2);
    expect(result.records[0].id).toContain('GMT400');
    expect(result.warnings.some((w) => w.toLowerCase().includes('missing a part number'))).toBe(
      true,
    );
  });

  it('detects alternate part-number header spellings (Part No)', () => {
    const result = parseBottomUpGrid(
      [
        ['Part No', 'Program', 'Sum of 2022 Sales', 'Sum of 2022 Quantity', 'Sum of 2025 Sales', 'Sum of 2025 Quantity'],
        ['P-1', 'GMT400', '100000', '1000', '204000', '2000'],
      ],
      'Sheet1',
    );
    expect(result.records[0].id).toBe('P-1');
    expect(result.records[0].metadata['Part number']).toBe('P-1');
  });
});

describe('parseBottomUpGrid — divide-by-zero volume', () => {
  it('returns null per-unit values when volume is zero for totals', () => {
    const grid = makeGrid(
      TOTAL_FIELDS,
      TOTAL_FIELDS,
      [100000, 50000, 20000, 10000, 0],
      [102000, 55000, 22000, 11000, 1000],
    );
    const result = parseBottomUpGrid(grid, 'Sheet1');
    const { beginning, anchor } = result.records[0];

    expect(beginning.price).toBeNull();
    expect(beginning.materialCost).toBeNull();
    expect(beginning.laborCost).toBeNull();
    expect(beginning.burdenCost).toBeNull();
    expect(beginning.cmPerUnit).toBeNull();
    expect(beginning.volume).toBe(0);

    // Anchor year still resolves normally.
    expect(anchor.price).toBeCloseTo(102, 6);
  });
});
