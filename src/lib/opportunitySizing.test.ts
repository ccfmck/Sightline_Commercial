import { describe, expect, it } from 'vitest';

import type { PartProgramRecord } from '../types';
import { DEFAULT_OPPORTUNITY_SETTINGS } from '../types';
import {
  buildOpportunityFrames,
  sizeBleederLeaker,
  sizeMarginErosionFrame,
  sizePortfolioOpportunity,
  sizeRowOpportunity,
} from './opportunitySizing';

const settings = DEFAULT_OPPORTUNITY_SETTINGS;

function makeRecord(overrides: Partial<PartProgramRecord> = {}): PartProgramRecord {
  return {
    id: 'test-row',
    metadata: { OEM: 'Ford', 'Program Name': 'Program A' },
    quoteYears: {},
    atQuoteCosts: {},
    periods: {},
    ...overrides,
  };
}

describe('buildOpportunityFrames', () => {
  it('includes at_quote and years strictly before anchor year', () => {
    expect(buildOpportunityFrames(2025, true, [2019, 2020, 2023, 2025, 2026])).toEqual([
      'at_quote',
      '2019',
      '2020',
      '2023',
    ]);
  });
});

describe('sizeMarginErosionFrame', () => {
  it('computes cost-pass-through pricing gap', () => {
    const result = sizeMarginErosionFrame(
      102,
      1000,
      { Material: 85 },
      100,
      { Material: 80 },
      '2023',
    );

    expect(result.costIncreasePercent).toBeCloseTo(6.25, 2);
    expect(result.expectedPrice).toBeCloseTo(106.25, 2);
    expect(result.priceIncreasePercent).toBeCloseTo(2, 2);
    expect(result.unitOpportunity).toBeCloseTo(4.25, 2);
    expect(result.dollarOpportunity).toBeCloseTo(4250, 0);
  });

  it('returns zero when price pass-through meets or exceeds cost increase', () => {
    const result = sizeMarginErosionFrame(
      107,
      1000,
      { Material: 85 },
      100,
      { Material: 80 },
      '2023',
    );

    expect(result.unitOpportunity).toBe(0);
    expect(result.dollarOpportunity).toBe(0);
  });

  it('skips invalid reference data', () => {
    const result = sizeMarginErosionFrame(
      102,
      1000,
      { Material: 85 },
      null,
      { Material: 80 },
      '2023',
    );

    expect(result.skipped).toBe(true);
    expect(result.dollarOpportunity).toBe(0);
  });
});

describe('sizeBleederLeaker', () => {
  it('sizes bleeder to breakeven price', () => {
    const result = sizeBleederLeaker(95, 1000, 100, 12);
    expect(result.classification).toBe('bleeder');
    expect(result.unitOpportunity).toBe(5);
    expect(result.dollarOpportunity).toBe(5000);
  });

  it('sizes leaker to target margin', () => {
    const price = 100;
    const totalCost = 92;
    const result = sizeBleederLeaker(price, 1000, totalCost, 12);

    expect(result.classification).toBe('leaker');
    const targetPrice = totalCost / (1 - 0.12);
    expect(result.unitOpportunity).toBeCloseTo(targetPrice - price, 4);
    expect(result.dollarOpportunity).toBeCloseTo((targetPrice - price) * 1000, 0);
  });

  it('returns zero for healthy margin at or above target', () => {
    const result = sizeBleederLeaker(100, 1000, 85, 12);
    expect(result.classification).toBe('healthy');
    expect(result.dollarOpportunity).toBe(0);
  });
});

describe('sizeRowOpportunity', () => {
  const frames = ['at_quote', '2023', '2024'] as const;

  it('picks max between erosion and bleeder/leaker', () => {
    const record = makeRecord({
      quoteYears: { 2025: { avgPrice: 100, volume: 1000 } },
      atQuoteCosts: { Material: 80 },
      periods: {
        '2023': {
          avgPrice: 100,
          volume: 900,
          costs: { Material: 80 },
        },
        '2025': {
          avgPrice: 80,
          volume: 1000,
          costs: { Material: 100 },
        },
      },
    });

    const result = sizeRowOpportunity(record, 2025, [...frames], settings);
    expect(result.autoWinningMethod).toBe('margin_erosion');
    expect(result.fullPotential).toBeCloseTo(45000, 0);
    expect(result.bleederLeaker.dollarOpportunity).toBeCloseTo(20000, 0);
  });

  it('applies haircuts to commercial recovery', () => {
    const record = makeRecord({
      periods: {
        '2023': {
          avgPrice: 100,
          volume: 1000,
          costs: { Material: 80 },
        },
        '2025': {
          avgPrice: 102,
          volume: 1000,
          costs: { Material: 85 },
        },
      },
    });

    const result = sizeRowOpportunity(record, 2025, ['2023'], settings);
    expect(result.fullPotential).toBeCloseTo(4250, 0);
    expect(result.commercialRecovery).toBeCloseTo(1062.5, 0);
  });

  it('returns no_data when anchor metrics are missing', () => {
    const record = makeRecord({
      periods: {
        '2023': { avgPrice: 100, volume: 1000, costs: { Material: 80 } },
      },
    });

    const result = sizeRowOpportunity(record, 2025, ['2023'], settings);
    expect(result.status).toBe('no_data');
    expect(result.fullPotential).toBe(0);
    expect(result.commercialRecovery).toBe(0);
  });
});

describe('sizePortfolioOpportunity', () => {
  it('aggregates totals across all rows', () => {
    const records = [
      makeRecord({
        id: 'a',
        periods: {
          '2023': { avgPrice: 100, volume: 1000, costs: { Material: 80 } },
          '2025': { avgPrice: 102, volume: 1000, costs: { Material: 85 } },
        },
      }),
      makeRecord({
        id: 'b',
        periods: {
          '2025': { avgPrice: 95, volume: 500, costs: { Material: 100 } },
        },
      }),
    ];

    const portfolio = sizePortfolioOpportunity(records, 2025, false, [2023], settings);
    expect(portfolio.rows).toHaveLength(2);
    expect(portfolio.totalFullPotential).toBeGreaterThan(0);
    expect(portfolio.totalCommercialRecovery).toBe(
      portfolio.rows.reduce((sum, row) => sum + row.commercialRecovery, 0),
    );
  });
});
