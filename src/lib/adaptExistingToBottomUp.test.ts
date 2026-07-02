import { describe, expect, it } from 'vitest';
import { adaptExistingToBottomUp } from './adaptExistingToBottomUp';
import type { CostComponentMapping, ParseResult, PartProgramRecord } from '../types';

const MAPPING: CostComponentMapping = {
  material: ['Material'],
  labor: ['Labor'],
  burden: ['Burden'],
};

function makeParseResult(records: PartProgramRecord[]): ParseResult {
  return {
    sheetName: 'Sheet1',
    warnings: [],
    headers: [],
    metadataFields: ['Part Number', 'OEM'],
    availableQuoteYears: [],
    availableHistoricalYears: [2022, 2025],
    hasAtQuote: false,
    defaultAnchorYear: 2025,
    costComponents: ['Material', 'Labor', 'Burden'],
    records,
    rowCount: records.length,
    availableCurrencies: ['USD'],
  };
}

function makeRecord(id: string, metadata: Record<string, string>): PartProgramRecord {
  return {
    id,
    metadata,
    quoteYears: {},
    atQuoteCosts: {},
    periods: {
      '2022': { avgPrice: 100, volume: 1000, costs: { Material: 50, Labor: 20, Burden: 10 } },
      '2025': { avgPrice: 110, volume: 1200, costs: { Material: 55, Labor: 22, Burden: 11 } },
    },
  };
}

describe('adaptExistingToBottomUp — part number identity', () => {
  it('sets the bottom-up record id to the detected part number', () => {
    const parseResult = makeParseResult([
      makeRecord('row-0', { 'Part Number': '32504', OEM: 'GM' }),
      makeRecord('row-1', { 'Part Number': 'A-778', OEM: 'Ford' }),
    ]);

    const result = adaptExistingToBottomUp(parseResult, 2022, 2025, MAPPING);
    expect(result.records.map((r) => r.id)).toEqual(['32504', 'A-778']);
    expect(result.records[0].metadata['Part number']).toBe('32504');
  });

  it('dedupes duplicate part numbers into distinct suffixed ids', () => {
    const parseResult = makeParseResult([
      makeRecord('row-0', { 'Part Number': '32504', OEM: 'GM' }),
      makeRecord('row-1', { 'Part Number': '32504', OEM: 'Ford' }),
    ]);

    const result = adaptExistingToBottomUp(parseResult, 2022, 2025, MAPPING);
    expect(result.records[0].id).toBe('32504');
    expect(result.records[1].id).toBe('32504 (#2)');
    expect(result.records[1].metadata['Part number']).toBe('32504');
    expect(
      result.warnings.some((w) => w.toLowerCase().includes('duplicate part numbers')),
    ).toBe(true);
  });

  it('falls back to the source row identity when the part number is missing', () => {
    const parseResult = makeParseResult([
      makeRecord('legacy-id-1', { OEM: 'GM' }),
      makeRecord('legacy-id-2', { OEM: 'Ford' }),
    ]);

    const result = adaptExistingToBottomUp(parseResult, 2022, 2025, MAPPING);
    expect(new Set(result.records.map((r) => r.id)).size).toBe(2);
    expect(result.records[0].id).toContain('legacy-id-1');
    expect(
      result.warnings.some((w) => w.toLowerCase().includes('missing a part number')),
    ).toBe(true);
  });

  it('does not mutate the source record metadata', () => {
    const source = makeRecord('row-0', { 'Part Number': '32504' });
    const parseResult = makeParseResult([source]);
    adaptExistingToBottomUp(parseResult, 2022, 2025, MAPPING);
    expect(source.metadata['Part number']).toBeUndefined();
  });
});
