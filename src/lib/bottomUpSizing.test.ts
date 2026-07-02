import { describe, expect, it } from 'vitest';
import {
  BOTTOM_UP_ALL_GROUP_LABEL,
  BOTTOM_UP_ALL_GROUPING_FIELD,
  DEFAULT_OPPORTUNITY_SETTINGS,
} from '../types';
import {
  assignVolumeQuintiles,
  buildGroupMaterialMarginTable,
  buildLongTailFlags,
  buildVolumeQuintileByRecord,
  computeGroupMaterialMargin,
  computeGroupMaterialMarginBreakdown,
  computeLongTailTargetCm,
  getNextMaterialName,
  rankByVolumeQuintile,
  renameMaterialInLever1Settings,
  sizeLever1Row,
  sizeLever2Row,
  sizeLever3Row,
  sizeLever4Row,
  sizeLever5Row,
  sizePortfolioBottomUpOpportunity,
  sizeRowBottomUpOpportunity,
  buildDefaultLeverSettings,
  bottomUpGroupKey,
  completedThroughAfterLeverSettingsChange,
  getBottomUpGroups,
} from './bottomUpSizing';
import type { BottomUpRecord } from '../types';

function makeRecord(overrides: Partial<BottomUpRecord> = {}): BottomUpRecord {
  return {
    id: 'part-1',
    metadata: { 'Product Group': 'Group A', OEM: 'Ford' },
    currency: 'USD',
    beginningYear: 2020,
    anchorYear: 2025,
    beginning: {
      price: 100,
      materialCost: 50,
      laborCost: 20,
      burdenCost: 10,
      volume: 1000,
      cmPerUnit: 20,
    },
    anchor: {
      price: 102,
      materialCost: 55,
      laborCost: 22,
      burdenCost: 11,
      volume: 1000,
      cmPerUnit: 14,
    },
    ...overrides,
  };
}

describe('sizeLever1Row', () => {
  it('computes inflation pass-through opportunity', () => {
    const result = sizeLever1Row({
      recordId: 'p1',
      groupKey: 'G1',
      begPrice: 100,
      begMaterial: 50,
      begLabor: 20,
      begBurden: 10,
      anchorPrice: 102,
      anchorVolume: 1000,
      anchorCm: 14,
      breakdownPercents: { Steel: 60, Plastic: 40 },
      inflation: {
        materialRates: { Steel: 1.1, Plastic: 1.05 },
        laborRate: 1.12,
        burdenRate: 1.08,
      },
    });

    const inflatedMaterial = 50 * 0.6 * 1.1 + 50 * 0.4 * 1.05;
    const inflatedLabor = 20 * 1.12;
    const inflatedBurden = 10 * 1.08;
    const delta = inflatedMaterial + inflatedLabor + inflatedBurden - 80;
    const shouldPrice = 100 + delta;

    expect(result.price).toBeCloseTo(shouldPrice, 4);
    expect(result.unitOpportunity).toBeCloseTo(shouldPrice - 102, 4);
    expect(result.dollarOpportunity).toBeCloseTo((shouldPrice - 102) * 1000, 0);
    expect(result.cm).toBeCloseTo(14 + (result.price - 102), 4);
  });

  it('exposes should-cost intermediates on the result', () => {
    const result = sizeLever1Row({
      recordId: 'p1',
      groupKey: 'G1',
      begPrice: 100,
      begMaterial: 50,
      begLabor: 20,
      begBurden: 10,
      anchorPrice: 102,
      anchorVolume: 1000,
      anchorCm: 14,
      breakdownPercents: { Steel: 60, Plastic: 40 },
      inflation: {
        materialRates: { Steel: 1.1, Plastic: 1.05 },
        laborRate: 1.12,
        burdenRate: 1.08,
      },
    });

    const expectedShouldMaterial = 50 * 0.6 * 1.1 + 50 * 0.4 * 1.05;
    const expectedShouldLabor = 20 * 1.12;
    const expectedShouldBurden = 10 * 1.08;
    const expectedShouldTotal =
      expectedShouldMaterial + expectedShouldLabor + expectedShouldBurden;

    expect(result.shouldMaterial).toBeCloseTo(expectedShouldMaterial, 6);
    expect(result.shouldLabor).toBeCloseTo(expectedShouldLabor, 6);
    expect(result.shouldBurden).toBeCloseTo(expectedShouldBurden, 6);
    expect(result.shouldTotalCost).toBeCloseTo(expectedShouldTotal, 6);
    // The should-price uplift is driven exactly by these intermediates.
    expect(result.price).toBeCloseTo(100 + (expectedShouldTotal - 80), 6);
  });

  it('returns zero opportunity when should price is at or below anchor', () => {
    const result = sizeLever1Row({
      recordId: 'p1',
      groupKey: 'G1',
      begPrice: 100,
      begMaterial: 50,
      begLabor: 20,
      begBurden: 10,
      anchorPrice: 120,
      anchorVolume: 1000,
      anchorCm: 40,
      breakdownPercents: { Steel: 100 },
      inflation: { materialRates: { Steel: 1 }, laborRate: 1, burdenRate: 1 },
    });

    expect(result.unitOpportunity).toBe(0);
    expect(result.price).toBe(120);
    expect(result.dollarOpportunity).toBe(0);
  });
});

describe('sizeLever2Row', () => {
  it('sizes linear performance pricing uplift', () => {
    const avgMargin = 0.3;
    const materialCost = 55;
    const shouldPrice = materialCost / (1 - avgMargin);

    const result = sizeLever2Row({
      recordId: 'p1',
      groupKey: 'G1',
      p1: 70,
      cm1: 20,
      anchorMaterialCost: materialCost,
      anchorVolume: 1000,
      groupAvgMaterialMargin: avgMargin,
    });

    expect(result.price).toBeCloseTo(shouldPrice, 4);
    expect(result.unitOpportunity).toBeCloseTo(shouldPrice - 70, 4);
    expect(result.cm).toBeCloseTo(20 + (shouldPrice - 70), 4);
  });

  it('returns zero when should price does not exceed P1', () => {
    const result = sizeLever2Row({
      recordId: 'p1',
      groupKey: 'G1',
      p1: 200,
      cm1: 50,
      anchorMaterialCost: 55,
      anchorVolume: 1000,
      groupAvgMaterialMargin: 0.3,
    });

    expect(result.unitOpportunity).toBe(0);
    expect(result.price).toBe(200);
  });

  it('exposes part/group material margin % and should price intermediates', () => {
    const avgMargin = 0.3;
    const materialCost = 55;
    const p1 = 70;
    const result = sizeLever2Row({
      recordId: 'p1',
      groupKey: 'G1',
      p1,
      cm1: 20,
      anchorMaterialCost: materialCost,
      anchorVolume: 1000,
      groupAvgMaterialMargin: avgMargin,
    });

    expect(result.anchorMaterialCost).toBe(materialCost);
    expect(result.partMaterialMarginPercent).toBeCloseTo(((p1 - materialCost) / p1) * 100, 6);
    expect(result.groupAvgMaterialMarginPercent).toBeCloseTo(avgMargin * 100, 6);
    expect(result.shouldPrice).toBeCloseTo(materialCost / (1 - avgMargin), 6);
    expect(result.incomingPrice).toBe(p1);
  });
});

describe('computeGroupMaterialMargin', () => {
  it('computes dollar-weighted material margin', () => {
    const margin = computeGroupMaterialMargin([
      { anchorPrice: 100, anchorMaterialCost: 60, anchorVolume: 1000 },
      { anchorPrice: 200, anchorMaterialCost: 100, anchorVolume: 500 },
    ]);
    const expected = (100 * 1000 + 200 * 500 - 60 * 1000 - 100 * 500) / (100 * 1000 + 200 * 500);
    expect(margin).toBeCloseTo(expected, 6);
  });
});

describe('computeGroupMaterialMarginBreakdown', () => {
  it('returns dollar-weighted sales, margin dollars, and percent', () => {
    const rows = [
      { anchorPrice: 100, anchorMaterialCost: 60, anchorVolume: 1000 },
      { anchorPrice: 200, anchorMaterialCost: 100, anchorVolume: 500 },
    ];
    const breakdown = computeGroupMaterialMarginBreakdown(rows);
    const sales = 100 * 1000 + 200 * 500;
    const marginDollars = sales - (60 * 1000 + 100 * 500);
    expect(breakdown.sales).toBeCloseTo(sales, 6);
    expect(breakdown.materialMarginDollars).toBeCloseTo(marginDollars, 6);
    expect(breakdown.materialMarginPercent).toBeCloseTo((marginDollars / sales) * 100, 6);
  });

  it('stays consistent with computeGroupMaterialMargin', () => {
    const rows = [
      { anchorPrice: 120, anchorMaterialCost: 70, anchorVolume: 800 },
      { anchorPrice: 90, anchorMaterialCost: 55, anchorVolume: 400 },
    ];
    const breakdown = computeGroupMaterialMarginBreakdown(rows);
    const margin = computeGroupMaterialMargin(rows);
    expect(breakdown.materialMarginPercent).not.toBeNull();
    expect((breakdown.materialMarginPercent as number) / 100).toBeCloseTo(margin as number, 10);
  });

  it('returns null percent when there are no valid sales', () => {
    const breakdown = computeGroupMaterialMarginBreakdown([
      { anchorPrice: 0, anchorMaterialCost: 10, anchorVolume: 1000 },
      { anchorPrice: 100, anchorMaterialCost: 40, anchorVolume: 0 },
    ]);
    expect(breakdown.sales).toBe(0);
    expect(breakdown.materialMarginPercent).toBeNull();
  });
});

describe('buildGroupMaterialMarginTable', () => {
  it('produces one sorted row per group with matching numbers', () => {
    const records = [
      makeRecord({
        id: 'p1',
        metadata: { OEM: 'Ford' },
        anchor: { price: 100, materialCost: 60, laborCost: 10, burdenCost: 5, volume: 1000, cmPerUnit: 25 },
      }),
      makeRecord({
        id: 'p2',
        metadata: { OEM: 'Ford' },
        anchor: { price: 200, materialCost: 100, laborCost: 10, burdenCost: 5, volume: 500, cmPerUnit: 85 },
      }),
      makeRecord({
        id: 'p3',
        metadata: { OEM: 'GM' },
        anchor: { price: 80, materialCost: 40, laborCost: 10, burdenCost: 5, volume: 200, cmPerUnit: 25 },
      }),
    ];

    const table = buildGroupMaterialMarginTable(records, 'OEM');
    expect(table.map((r) => r.groupKey)).toEqual(['Ford', 'GM']);

    const ford = table[0];
    const fordSales = 100 * 1000 + 200 * 500;
    expect(ford.sales).toBeCloseTo(fordSales, 6);
    expect(ford.materialMarginDollars).toBeCloseTo(fordSales - (60 * 1000 + 100 * 500), 6);
    expect(ford.currency).toBe('USD');

    // Table percent must equal the value driving the Lever 2 target.
    const fordMargin = computeGroupMaterialMargin([
      { anchorPrice: 100, anchorMaterialCost: 60, anchorVolume: 1000 },
      { anchorPrice: 200, anchorMaterialCost: 100, anchorVolume: 500 },
    ]);
    expect((ford.materialMarginPercent as number) / 100).toBeCloseTo(fordMargin as number, 10);
  });

  it('returns a single row for the all-grouping field', () => {
    const records = [
      makeRecord({ id: 'p1', metadata: { OEM: 'Ford' } }),
      makeRecord({ id: 'p2', metadata: { OEM: 'GM' } }),
    ];
    const table = buildGroupMaterialMarginTable(records, BOTTOM_UP_ALL_GROUPING_FIELD);
    expect(table).toHaveLength(1);
    expect(table[0].groupKey).toBe(BOTTOM_UP_ALL_GROUP_LABEL);
  });

  it('skips records missing anchor data', () => {
    const records = [
      makeRecord({ id: 'p1', metadata: { OEM: 'Ford' } }),
      makeRecord({
        id: 'p2',
        metadata: { OEM: 'Ford' },
        anchor: { price: null, materialCost: null, laborCost: null, burdenCost: null, volume: null, cmPerUnit: null },
      }),
    ];
    const table = buildGroupMaterialMarginTable(records, 'OEM');
    expect(table).toHaveLength(1);
    expect(table[0].sales).toBeCloseTo(102 * 1000, 6);
  });
});

describe('rankByVolumeQuintile and computeLongTailTargetCm', () => {
  it('excludes bottom 20% by count', () => {
    const parts = Array.from({ length: 10 }, (_, i) => ({
      recordId: `p${i}`,
      volume: (10 - i) * 100,
      p2: 100,
      cm2: 15,
    }));

    const { topFourFifths, bottomOneFifth } = rankByVolumeQuintile(parts);
    expect(topFourFifths).toHaveLength(8);
    expect(bottomOneFifth).toHaveLength(2);
    expect(bottomOneFifth[0].recordId).toBe('p8');
  });

  it('computes dollar-weighted target CM% from top 4/5', () => {
    const parts = [
      { recordId: 'a', volume: 1000, p2: 100, cm2: 20 },
      { recordId: 'b', volume: 500, p2: 200, cm2: 60 },
      { recordId: 'c', volume: 100, p2: 50, cm2: 5 },
      { recordId: 'd', volume: 50, p2: 80, cm2: 8 },
      { recordId: 'e', volume: 10, p2: 90, cm2: 9 },
    ];

    const target = computeLongTailTargetCm(parts);
    const { topFourFifths } = rankByVolumeQuintile(parts);
    let sumCmVol = 0;
    let sumPriceVol = 0;
    for (const p of topFourFifths) {
      sumCmVol += p.cm2 * p.volume;
      sumPriceVol += p.p2 * p.volume;
    }
    expect(target).toBeCloseTo((sumCmVol / sumPriceVol) * 100, 4);
  });
});

describe('assignVolumeQuintiles', () => {
  it('assigns quintiles 1-5 by descending volume for a 5-part group', () => {
    const parts = Array.from({ length: 5 }, (_, i) => ({
      recordId: `p${i}`,
      volume: (5 - i) * 100, // p0 highest (500) … p4 lowest (100)
      p2: 100,
      cm2: 15,
    }));

    const quintiles = assignVolumeQuintiles(parts);
    expect(quintiles).toEqual({ p0: 1, p1: 2, p2: 3, p3: 4, p4: 5 });
  });

  it('makes quintile 5 exactly equal the long-tail / bottom-1/5 set', () => {
    const parts = Array.from({ length: 10 }, (_, i) => ({
      recordId: `p${i}`,
      volume: (10 - i) * 100,
      p2: 100,
      cm2: 15,
    }));

    const quintiles = assignVolumeQuintiles(parts);
    const { bottomOneFifth } = rankByVolumeQuintile(parts);
    const q5 = Object.entries(quintiles)
      .filter(([, q]) => q === 5)
      .map(([id]) => id)
      .sort();
    expect(q5).toEqual(bottomOneFifth.map((p) => p.recordId).sort());
    // bottom 2 of 10 are the long tail.
    expect(q5).toEqual(['p8', 'p9']);
  });

  it('breaks volume ties by ascending recordId (same rule as long tail)', () => {
    const parts = [
      { recordId: 'b', volume: 100, p2: 100, cm2: 15 },
      { recordId: 'a', volume: 100, p2: 100, cm2: 15 },
      { recordId: 'c', volume: 100, p2: 100, cm2: 15 },
      { recordId: 'd', volume: 100, p2: 100, cm2: 15 },
      { recordId: 'e', volume: 100, p2: 100, cm2: 15 },
    ];
    // All equal volume → order is a,b,c,d,e → quintiles 1..5.
    expect(assignVolumeQuintiles(parts)).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5 });
  });

  it('assigns quintiles for small groups without a bottom 1/5', () => {
    // n=3 → topCount = ceil(2.4) = 3, so no long tail; quintiles spread by rank.
    const parts = [
      { recordId: 'a', volume: 300, p2: 100, cm2: 15 },
      { recordId: 'b', volume: 200, p2: 100, cm2: 15 },
      { recordId: 'c', volume: 100, p2: 100, cm2: 15 },
    ];
    const quintiles = assignVolumeQuintiles(parts);
    const { bottomOneFifth } = rankByVolumeQuintile(parts);
    expect(bottomOneFifth).toHaveLength(0);
    // No part is quintile 5 when there is no long tail.
    expect(Object.values(quintiles)).not.toContain(5);
    expect(quintiles.a).toBe(1);
  });
});

describe('buildVolumeQuintileByRecord', () => {
  it('computes per-record quintiles whose 5s match buildLongTailFlags', () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({
        id: `p${i}`,
        metadata: { OEM: 'Ford', 'Part number': `p${i}` },
        anchor: {
          price: 100,
          materialCost: 55,
          laborCost: 22,
          burdenCost: 11,
          volume: (5 - i) * 100,
          cmPerUnit: 14,
        },
      }),
    );
    const lever2Results = new Map(records.map((r) => [r.id, { price: 100, cm: 15 }]));

    const quintiles = buildVolumeQuintileByRecord(records, lever2Results, 'OEM');
    const flags = buildLongTailFlags(records, lever2Results, 'OEM');

    expect(quintiles).toEqual({ p0: 1, p1: 2, p2: 3, p3: 4, p4: 5 });
    // Long tail set is exactly the quintile-5 set.
    const q5Ids = Object.entries(quintiles)
      .filter(([, q]) => q === 5)
      .map(([id]) => id);
    expect(q5Ids).toEqual(Object.keys(flags));
    expect(flags.p4).toBe(true);
  });
});

describe('buildLongTailFlags', () => {
  it('flags the bottom 1/5 by volume within each group', () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({
        id: `p${i}`,
        metadata: { OEM: 'Ford', 'Part number': `p${i}` },
        anchor: {
          price: 100,
          materialCost: 55,
          laborCost: 22,
          burdenCost: 11,
          volume: (5 - i) * 100,
          cmPerUnit: 14,
        },
      }),
    );
    const lever2Results = new Map(
      records.map((r) => [r.id, { price: 100, cm: 15 }]),
    );

    const flags = buildLongTailFlags(records, lever2Results, 'OEM');

    // Sorted by descending volume: p0 (500) … p4 (100). Bottom 1/5 of 5 = 1 part.
    expect(flags.p4).toBe(true);
    expect(flags.p0).toBeUndefined();
    expect(flags.p1).toBeUndefined();
  });
});

describe('sizeLever3Row', () => {
  it('returns zero when CM% already at target', () => {
    const result = sizeLever3Row({
      recordId: 'p1',
      groupKey: 'G1',
      p2: 100,
      cm2: 25,
      anchorVolume: 1000,
      targetCmPercent: 25,
    });

    expect(result.unitOpportunity).toBe(0);
    expect(result.price).toBe(100);
  });

  it('returns zero when CM% above target', () => {
    const result = sizeLever3Row({
      recordId: 'p1',
      groupKey: 'G1',
      p2: 100,
      cm2: 30,
      anchorVolume: 1000,
      targetCmPercent: 25,
    });

    expect(result.unitOpportunity).toBe(0);
  });

  it('derives price when CM% below target', () => {
    const p2 = 100;
    const cm2 = 15;
    const target = 25;
    const c = p2 - cm2;
    const p3 = c / (1 - target / 100);

    const result = sizeLever3Row({
      recordId: 'p1',
      groupKey: 'G1',
      p2,
      cm2,
      anchorVolume: 1000,
      targetCmPercent: target,
    });

    expect(result.price).toBeCloseTo(p3, 4);
    expect(result.unitOpportunity).toBeCloseTo(p3 - p2, 4);
    expect(result.cm).toBeCloseTo(cm2 + (p3 - p2), 4);
    expect(result.cmPercent).toBeCloseTo(target, 2);
  });

  it('exposes contribution cost, should price, and long-tail flag intermediates', () => {
    const p2 = 100;
    const cm2 = 15;
    const target = 25;
    const c = p2 - cm2;
    const p3 = c / (1 - target / 100);

    const result = sizeLever3Row({
      recordId: 'p1',
      groupKey: 'G1',
      p2,
      cm2,
      anchorVolume: 1000,
      targetCmPercent: target,
      isLongTail: true,
    });

    expect(result.incomingPrice).toBe(p2);
    expect(result.contributionCost).toBeCloseTo(c, 6);
    expect(result.shouldPrice).toBeCloseTo(p3, 6);
    expect(result.isLongTail).toBe(true);
  });

  it('defaults long-tail flag to false and still exposes should price above target', () => {
    const result = sizeLever3Row({
      recordId: 'p1',
      groupKey: 'G1',
      p2: 100,
      cm2: 30,
      anchorVolume: 1000,
      targetCmPercent: 25,
    });

    expect(result.isLongTail).toBe(false);
    expect(result.contributionCost).toBeCloseTo(70, 6);
    // Should price is still computed even when no repricing is applied.
    expect(result.shouldPrice).toBeCloseTo(70 / (1 - 0.25), 6);
  });

  it('handles zero volume', () => {
    const result = sizeLever3Row({
      recordId: 'p1',
      groupKey: 'G1',
      p2: 100,
      cm2: 10,
      anchorVolume: 0,
      targetCmPercent: 25,
    });

    expect(result.dollarOpportunity).toBe(0);
  });
});

describe('sizeLever4Row', () => {
  it('computes handling fee markup uplift from percent-point inputs', () => {
    // Enter 3 percentage points of markup and 40% direct buy on a $55 material cost.
    const result = sizeLever4Row({
      recordId: 'p1',
      directBuyGroupKey: 'G1',
      markupGroupKey: 'G1',
      p3: 110,
      cm3: 25,
      anchorMaterialCost: 55,
      anchorVolume: 1000,
      directBuyPercent: 40,
      markupIncrease: 3,
    });

    // Both inputs are divided by 100: uplift = 0.03 × 55 × 0.40.
    const uplift = 0.03 * 55 * 0.4;
    expect(uplift).toBeCloseTo(0.66, 6);
    expect(result.unitOpportunity).toBeCloseTo(uplift, 6);
    expect(result.price).toBeCloseTo(110 + uplift, 6);
    expect(result.cm).toBeCloseTo(25 + uplift, 6);
    expect(result.dollarOpportunity).toBeCloseTo(uplift * 1000, 2);
  });

  it('exposes per-unit uplift, direct buy %, markup, and material intermediates', () => {
    const result = sizeLever4Row({
      recordId: 'p1',
      directBuyGroupKey: 'G1',
      markupGroupKey: 'G1',
      p3: 110,
      cm3: 25,
      anchorMaterialCost: 55,
      anchorVolume: 1000,
      directBuyPercent: 40,
      markupIncrease: 3,
    });

    expect(result.incomingPrice).toBe(110);
    expect(result.anchorMaterialCost).toBe(55);
    expect(result.directBuyPercent).toBe(40);
    expect(result.markupIncrease).toBe(3);
    expect(result.perUnitUplift).toBeCloseTo(0.03 * 55 * 0.4, 6);
  });
});

describe('sizeLever5Row', () => {
  it('applies leaker uplift when CM% below target', () => {
    const p4 = 115;
    const cm4 = 15;
    const target = 20;
    const c = p4 - cm4;
    const p5 = c / (1 - target / 100);

    const result = sizeLever5Row({
      recordId: 'p1',
      groupKey: 'G1',
      p4,
      cm4,
      anchorVolume: 1000,
      targetCmPercent: target,
    });

    expect(result.price).toBeCloseTo(p5, 4);
    expect(result.unitOpportunity).toBeCloseTo(p5 - p4, 4);
  });

  it('exposes contribution cost and should price intermediates', () => {
    const p4 = 115;
    const cm4 = 15;
    const target = 20;
    const c = p4 - cm4;
    const p5 = c / (1 - target / 100);

    const result = sizeLever5Row({
      recordId: 'p1',
      groupKey: 'G1',
      p4,
      cm4,
      anchorVolume: 1000,
      targetCmPercent: target,
    });

    expect(result.incomingPrice).toBe(p4);
    expect(result.contributionCost).toBeCloseTo(c, 6);
    expect(result.shouldPrice).toBeCloseTo(p5, 6);
  });

  it('returns zero when CM% at or above target', () => {
    const result = sizeLever5Row({
      recordId: 'p1',
      groupKey: 'G1',
      p4: 100,
      cm4: 25,
      anchorVolume: 1000,
      targetCmPercent: 20,
    });

    expect(result.unitOpportunity).toBe(0);
    expect(result.price).toBe(100);
  });
});

describe('sizeRowBottomUpOpportunity and portfolio', () => {
  it('chains all five levers and sums opportunity', () => {
    const record = makeRecord();
    const settings = buildDefaultLeverSettings(['Product Group'], ['Steel']);
    settings.lever1.breakdownByGroup[BOTTOM_UP_ALL_GROUP_LABEL] = { Steel: 100 };
    settings.lever1.inflation = {
      materialRates: { Steel: 1.15 },
      laborRate: 1.1,
      burdenRate: 1.05,
    };
    settings.lever4.directBuyByGroup[BOTTOM_UP_ALL_GROUP_LABEL] = 40;
    settings.lever4.markupIncreaseByGroup[BOTTOM_UP_ALL_GROUP_LABEL] = 2;

    const portfolio = sizePortfolioBottomUpOpportunity(
      [record],
      2020,
      2025,
      settings,
      DEFAULT_OPPORTUNITY_SETTINGS,
    );

    expect(portfolio.rows).toHaveLength(1);
    const row = portfolio.rows[0];
    expect(row.fullPotential).toBeGreaterThan(0);
    expect(row.commercialRecovery).toBeCloseTo(
      row.fullPotential * 0.5 * 0.5,
      2,
    );
    expect(row.levers.lever1.dollarOpportunity).toBeGreaterThanOrEqual(0);
  });

  it('sums lever opportunities additively', () => {
    const record = makeRecord();
    const settings = buildDefaultLeverSettings(['Product Group']);
    settings.lever1.groupingField = 'Product Group';
    settings.lever2.groupingField = 'Product Group';
    settings.lever3.groupingField = 'Product Group';
    settings.lever4.directBuyGroupingField = 'Product Group';
    settings.lever4.markupGroupingField = 'Product Group';
    settings.lever5.groupingField = 'Product Group';
    settings.lever1.breakdownByGroup['Group A'] = { 'Material A': 50, 'Material B': 50 };
    settings.lever1.inflation = {
      materialRates: { 'Material A': 1, 'Material B': 1 },
      laborRate: 1,
      burdenRate: 1,
    };

    const groupMargins = { 'Group A': 0.25 };
    const targetL3 = { 'Group A': 30 };
    const row = sizeRowBottomUpOpportunity(record, settings, groupMargins, targetL3);

    const sum =
      row.levers.lever1.dollarOpportunity +
      row.levers.lever2.dollarOpportunity +
      row.levers.lever3.dollarOpportunity +
      row.levers.lever4.dollarOpportunity +
      row.levers.lever5.dollarOpportunity;
    expect(row.fullPotential).toBeCloseTo(sum, 4);
  });

  it('treats all grouping as a single group across records', () => {
    const records = [
      makeRecord({ id: 'p1', metadata: { 'Product Group': 'Group A' } }),
      makeRecord({ id: 'p2', metadata: { 'Product Group': 'Group B' }, anchor: {
        price: 80,
        materialCost: 40,
        laborCost: 18,
        burdenCost: 9,
        volume: 500,
        cmPerUnit: 13,
      } }),
    ];
    const settings = buildDefaultLeverSettings(['Product Group'], ['Steel']);
    settings.lever1.breakdownByGroup[BOTTOM_UP_ALL_GROUP_LABEL] = { Steel: 100 };
    settings.lever1.inflation = {
      materialRates: { Steel: 1.2 },
      laborRate: 1,
      burdenRate: 1,
    };

    expect(getBottomUpGroups(records, BOTTOM_UP_ALL_GROUPING_FIELD)).toEqual([
      BOTTOM_UP_ALL_GROUP_LABEL,
    ]);
    expect(bottomUpGroupKey(records[0].metadata, BOTTOM_UP_ALL_GROUPING_FIELD)).toBe(
      BOTTOM_UP_ALL_GROUP_LABEL,
    );
    expect(bottomUpGroupKey(records[1].metadata, BOTTOM_UP_ALL_GROUPING_FIELD)).toBe(
      BOTTOM_UP_ALL_GROUP_LABEL,
    );

    const portfolio = sizePortfolioBottomUpOpportunity(
      records,
      2020,
      2025,
      settings,
      DEFAULT_OPPORTUNITY_SETTINGS,
    );

    expect(portfolio.rows).toHaveLength(2);
    expect(portfolio.rows[0].levers.lever1.dollarOpportunity).toBeGreaterThan(0);
    expect(portfolio.rows[1].levers.lever1.dollarOpportunity).toBeGreaterThan(0);
    expect(Object.keys(portfolio.targetCmByGroupL3 ?? {})).toEqual([BOTTOM_UP_ALL_GROUP_LABEL]);
  });

  it('emits one result row per part-number record, not per group', () => {
    // Three parts sharing a single group must still produce three result rows.
    const records = [
      makeRecord({ id: '32504', metadata: { OEM: 'GM', 'Part number': '32504' } }),
      makeRecord({ id: 'A-778', metadata: { OEM: 'GM', 'Part number': 'A-778' } }),
      makeRecord({ id: 'B-991', metadata: { OEM: 'GM', 'Part number': 'B-991' } }),
    ];
    const settings = buildDefaultLeverSettings(['OEM'], ['Steel']);
    settings.lever1.breakdownByGroup[BOTTOM_UP_ALL_GROUP_LABEL] = { Steel: 100 };
    settings.lever1.inflation = { materialRates: { Steel: 1.2 }, laborRate: 1, burdenRate: 1 };

    const portfolio = sizePortfolioBottomUpOpportunity(
      records,
      2020,
      2025,
      settings,
      DEFAULT_OPPORTUNITY_SETTINGS,
    );

    expect(portfolio.rows).toHaveLength(3);
    expect(portfolio.rows.map((r) => r.recordId)).toEqual(['32504', 'A-778', 'B-991']);
    // Each result row is uniquely keyed by its part number.
    expect(new Set(portfolio.rows.map((r) => r.recordId)).size).toBe(3);
  });

  it('defaults to all grouping field', () => {
    const settings = buildDefaultLeverSettings(['Product Group', 'OEM']);
    expect(settings.lever1.groupingField).toBe(BOTTOM_UP_ALL_GROUPING_FIELD);
    expect(settings.lever2.groupingField).toBe(BOTTOM_UP_ALL_GROUPING_FIELD);
    expect(settings.lever3.groupingField).toBe(BOTTOM_UP_ALL_GROUPING_FIELD);
    expect(settings.lever4.directBuyGroupingField).toBe(BOTTOM_UP_ALL_GROUPING_FIELD);
    expect(settings.lever4.markupGroupingField).toBe(BOTTOM_UP_ALL_GROUPING_FIELD);
    expect(settings.lever5.groupingField).toBe(BOTTOM_UP_ALL_GROUPING_FIELD);
    expect(settings.lever1.breakdownByGroup).toHaveProperty(BOTTOM_UP_ALL_GROUP_LABEL);
  });
});

describe('excluded lever pass-through', () => {
  function fullSettings() {
    const settings = buildDefaultLeverSettings(['Product Group']);
    settings.lever1.groupingField = 'Product Group';
    settings.lever2.groupingField = 'Product Group';
    settings.lever3.groupingField = 'Product Group';
    settings.lever4.directBuyGroupingField = 'Product Group';
    settings.lever4.markupGroupingField = 'Product Group';
    settings.lever5.groupingField = 'Product Group';
    settings.lever1.breakdownByGroup['Group A'] = { 'Material A': 50, 'Material B': 50 };
    settings.lever1.inflation = {
      materialRates: { 'Material A': 1.2, 'Material B': 1.2 },
      laborRate: 1.1,
      burdenRate: 1.05,
    };
    settings.lever4.directBuyByGroup['Group A'] = 40;
    settings.lever4.markupIncreaseByGroup['Group A'] = 5;
    settings.lever5.useGlobalTarget = true;
    settings.lever5.globalTargetCmPercent = 40;
    return settings;
  }

  it('excluded lever contributes $0 and passes price/CM through unchanged', () => {
    const record = makeRecord();
    const groupMargins = { 'Group A': 0.25 };
    const targetL3 = { 'Group A': 40 };

    const included = fullSettings();
    const rowIncluded = sizeRowBottomUpOpportunity(record, included, groupMargins, targetL3);

    const excluded = fullSettings();
    excluded.lever3.included = false;
    const rowExcluded = sizeRowBottomUpOpportunity(record, excluded, groupMargins, targetL3);

    // Lever 3 now passes through lever 2 outputs with zero opportunity.
    expect(rowExcluded.levers.lever3.dollarOpportunity).toBe(0);
    expect(rowExcluded.levers.lever3.unitOpportunity).toBe(0);
    expect(rowExcluded.levers.lever3.excluded).toBe(true);
    expect(rowExcluded.levers.lever3.price).toBeCloseTo(rowExcluded.levers.lever2.price, 6);
    expect(rowExcluded.levers.lever3.cm).toBeCloseTo(rowExcluded.levers.lever2.cm, 6);

    // Excluding a lever cannot increase full potential.
    expect(rowExcluded.fullPotential).toBeLessThanOrEqual(rowIncluded.fullPotential + 1e-6);
  });

  it('excluding lever 1 makes it pass anchor price/CM through with no opportunity', () => {
    const record = makeRecord();
    const settings = fullSettings();
    settings.lever1.included = false;

    const portfolio = sizePortfolioBottomUpOpportunity(
      [record],
      2020,
      2025,
      settings,
      DEFAULT_OPPORTUNITY_SETTINGS,
    );
    const row = portfolio.rows[0];

    expect(row.levers.lever1.dollarOpportunity).toBe(0);
    expect(row.levers.lever1.excluded).toBe(true);
    expect(row.levers.lever1.price).toBeCloseTo(record.anchor.price ?? 0, 6);
  });

  it('excluding every lever yields zero total opportunity', () => {
    const record = makeRecord();
    const settings = fullSettings();
    settings.lever1.included = false;
    settings.lever2.included = false;
    settings.lever3.included = false;
    settings.lever4.included = false;
    settings.lever5.included = false;

    const portfolio = sizePortfolioBottomUpOpportunity(
      [record],
      2020,
      2025,
      settings,
      DEFAULT_OPPORTUNITY_SETTINGS,
    );
    const row = portfolio.rows[0];

    expect(row.fullPotential).toBe(0);
    expect(row.commercialRecovery).toBe(0);
    expect(row.finalPrice).toBeCloseTo(record.anchor.price ?? 0, 6);
    for (const n of [1, 2, 3, 4, 5] as const) {
      expect(row.levers[`lever${n}`].dollarOpportunity).toBe(0);
      expect(row.levers[`lever${n}`].excluded).toBe(true);
    }
  });

  it('buildDefaultLeverSettings includes all levers by default', () => {
    const settings = buildDefaultLeverSettings(['Product Group']);
    expect(settings.lever1.included).toBe(true);
    expect(settings.lever2.included).toBe(true);
    expect(settings.lever3.included).toBe(true);
    expect(settings.lever4.included).toBe(true);
    expect(settings.lever5.included).toBe(true);
  });
});

describe('completedThroughAfterLeverSettingsChange', () => {
  it('keeps upstream levers calculated when editing lever 4 or 5', () => {
    expect(completedThroughAfterLeverSettingsChange(5, 5)).toBe(4);
    expect(completedThroughAfterLeverSettingsChange(5, 4)).toBe(3);
    expect(completedThroughAfterLeverSettingsChange(4, 4)).toBe(3);
  });

  it('does not drop below what is already incomplete', () => {
    expect(completedThroughAfterLeverSettingsChange(3, 4)).toBe(3);
    expect(completedThroughAfterLeverSettingsChange(2, 5)).toBe(2);
  });

  it('invalidates all levers when lever 1 settings change', () => {
    expect(completedThroughAfterLeverSettingsChange(5, 1)).toBe(0);
    expect(completedThroughAfterLeverSettingsChange(3, 1)).toBe(0);
  });

  it('invalidates downstream only for middle levers', () => {
    expect(completedThroughAfterLeverSettingsChange(5, 2)).toBe(1);
    expect(completedThroughAfterLeverSettingsChange(5, 3)).toBe(2);
  });
});

describe('getNextMaterialName', () => {
  it('continues the letter sequence after Material A and Material B', () => {
    expect(getNextMaterialName(['Material A', 'Material B'])).toBe('Material C');
    expect(getNextMaterialName(['Material A', 'Material B', 'Material C'])).toBe('Material D');
  });

  it('starts at Material A for an empty list', () => {
    expect(getNextMaterialName([])).toBe('Material A');
  });

  it('uses the next letter after custom material names', () => {
    expect(getNextMaterialName(['Steel', 'Resin'])).toBe('Material C');
  });
});

describe('renameMaterialInLever1Settings', () => {
  it('migrates breakdown and inflation keys when a material is renamed', () => {
    const settings = buildDefaultLeverSettings(['Product Group']).lever1;
    settings.breakdownByGroup['Group A'] = { 'Material A': 60, 'Material B': 40 };
    settings.inflation = {
      materialRates: { 'Material A': 1.1, 'Material B': 1.2 },
      laborRate: 1,
      burdenRate: 1,
    };

    const renamed = renameMaterialInLever1Settings(settings, 'Material A', 'Steel');

    expect(renamed.materials).toEqual(['Steel', 'Material B']);
    expect(renamed.breakdownByGroup['Group A']).toEqual({ Steel: 60, 'Material B': 40 });
    expect(renamed.inflation.materialRates).toEqual({ Steel: 1.1, 'Material B': 1.2 });
  });

  it('keeps lever 1 sizing working with renamed materials', () => {
    const settings = buildDefaultLeverSettings(['Product Group']).lever1;
    settings.breakdownByGroup['Group A'] = { Steel: 100 };
    settings.materials = ['Steel'];
    settings.inflation = {
      materialRates: { Steel: 1.1 },
      laborRate: 1,
      burdenRate: 1,
    };

    const result = sizeLever1Row({
      recordId: 'p1',
      groupKey: 'Group A',
      begPrice: 100,
      begMaterial: 50,
      begLabor: 20,
      begBurden: 10,
      anchorPrice: 100,
      anchorVolume: 1000,
      anchorCm: 20,
      breakdownPercents: { Steel: 100 },
      inflation: settings.inflation,
    });

    expect(result.unitOpportunity).toBeGreaterThan(0);
  });
});
