import { describe, expect, it } from 'vitest';

import type { PartProgramRecord } from '../types';
import { DEFAULT_OPPORTUNITY_SETTINGS } from '../types';
import { sumCostsForMarginLevel } from './metrics';
import { buildDefaultMarginPercentSettings } from './marginComponentDefaults';
import {
  sizeMarginPercentGap,
  sizePortfolioMarginPercentOpportunity,
  sizeRowMarginPercentOpportunity,
} from './marginPercentSizing';

const opportunitySettings = DEFAULT_OPPORTUNITY_SETTINGS;

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

const defaultMapping = buildDefaultMarginPercentSettings([
  'Direct material',
  'Direct labor',
  'Fixed Overhead',
]);

describe('sumCostsForMarginLevel', () => {
  const costs = {
    'Direct material': 40,
    'Direct labor': 20,
    'Fixed Overhead': 10,
  };

  it('sums only material-level components for material margin', () => {
    expect(sumCostsForMarginLevel(costs, defaultMapping.componentLevels, 'material')).toBe(40);
  });

  it('sums material and contribution components for contribution margin', () => {
    expect(sumCostsForMarginLevel(costs, defaultMapping.componentLevels, 'contribution')).toBe(60);
  });

  it('sums all mapped components for ebit margin', () => {
    expect(sumCostsForMarginLevel(costs, defaultMapping.componentLevels, 'ebit')).toBe(70);
  });
});

describe('sizeMarginPercentGap', () => {
  it('sizes price uplift to reach best reference margin', () => {
    const settings = {
      optimizeFor: 'ebit' as const,
      componentLevels: {
        'Direct material': 'material' as const,
        'Direct labor': 'contribution' as const,
        'Fixed Overhead': 'ebit' as const,
      },
    };

    const result = sizeMarginPercentGap(
      100,
      1000,
      { 'Direct material': 40, 'Direct labor': 20, 'Fixed Overhead': 10 },
      [
        {
          frameId: '2023',
          price: 100,
          costs: { 'Direct material': 35, 'Direct labor': 18, 'Fixed Overhead': 8 },
        },
        {
          frameId: '2024',
          price: 110,
          costs: { 'Direct material': 36, 'Direct labor': 19, 'Fixed Overhead': 9 },
        },
      ],
      settings,
    );

    expect(result.bestReferenceFrameId).toBe('2024');
    expect(result.bestReferenceMarginPercent).toBeCloseTo(41.82, 1);
    expect(result.anchorMarginPercent).toBeCloseTo(30, 1);
    expect(result.targetPrice).toBeCloseTo(120.31, 1);
    expect(result.unitOpportunity).toBeCloseTo(20.31, 1);
    expect(result.dollarOpportunity).toBeCloseTo(20312.5, 0);
  });

  it('computes uplift when anchor margin is below best reference', () => {
    const settings = {
      optimizeFor: 'ebit' as const,
      componentLevels: { Material: 'ebit' as const },
    };

    const result = sizeMarginPercentGap(
      100,
      1000,
      { Material: 80 },
      [
        {
          frameId: '2023',
          price: 100,
          costs: { Material: 70 },
        },
      ],
      settings,
    );

    expect(result.anchorMarginPercent).toBeCloseTo(20, 2);
    expect(result.bestReferenceMarginPercent).toBeCloseTo(30, 2);
    expect(result.targetPrice).toBeCloseTo(114.2857, 2);
    expect(result.unitOpportunity).toBeCloseTo(14.2857, 2);
    expect(result.dollarOpportunity).toBeCloseTo(14285.7, 0);
  });

  it('returns zero opportunity when anchor already meets best reference', () => {
    const settings = {
      optimizeFor: 'ebit' as const,
      componentLevels: { Material: 'ebit' as const },
    };

    const result = sizeMarginPercentGap(
      120,
      1000,
      { Material: 80 },
      [{ frameId: '2023', price: 100, costs: { Material: 70 } }],
      settings,
    );

    expect(result.unitOpportunity).toBe(0);
    expect(result.dollarOpportunity).toBe(0);
  });
});

describe('sizeRowMarginPercentOpportunity', () => {
  it('picks bleeder/leaker when larger than margin gap', () => {
    const record = makeRecord({
      periods: {
        '2025': {
          avgPrice: 80,
          volume: 1000,
          costs: { Material: 40, Overhead: 45 },
        },
        '2023': {
          avgPrice: 100,
          volume: 1000,
          costs: { Material: 50, Overhead: 20 },
        },
      },
    });

    const marginSettings = {
      optimizeFor: 'material' as const,
      componentLevels: { Material: 'material' as const, Overhead: 'ebit' as const },
    };

    const result = sizeRowMarginPercentOpportunity(
      record,
      2025,
      ['2023'],
      opportunitySettings,
      marginSettings,
    );

    expect(result.bleederLeaker.classification).toBe('bleeder');
    expect(result.marginPercentGap.unitOpportunity).toBe(0);
    expect(result.autoWinningMethod).toBe('bleeder_leaker');
    expect(result.autoFullPotential).toBe(5000);
  });

  it('sizes to a specific reference frame when basis is overridden', () => {
    const record = makeRecord({
      periods: {
        '2025': {
          avgPrice: 100,
          volume: 1000,
          costs: { Material: 80 },
        },
        '2023': {
          avgPrice: 100,
          volume: 1000,
          costs: { Material: 70 },
        },
        '2024': {
          avgPrice: 110,
          volume: 1000,
          costs: { Material: 72 },
        },
      },
    });

    const marginSettings = {
      optimizeFor: 'ebit' as const,
      componentLevels: { Material: 'ebit' as const },
    };

    const autoResult = sizeRowMarginPercentOpportunity(
      record,
      2025,
      ['2023', '2024'],
      opportunitySettings,
      marginSettings,
    );

    const forced2023 = sizeRowMarginPercentOpportunity(
      record,
      2025,
      ['2023', '2024'],
      opportunitySettings,
      marginSettings,
      { basis: '2023' },
    );

    expect(autoResult.marginPercentGap.bestReferenceFrameId).toBe('2024');
    expect(forced2023.selectedBasis).toBe('2023');
    expect(forced2023.winningFrameLabel).toBe('2023');
    expect(forced2023.fullPotential).toBeCloseTo(
      autoResult.marginPercentGap.marginPercentByFrame.find((f) => f.frameId === '2023')!
        .dollarOpportunity,
      0,
    );
    expect(forced2023.fullPotential).toBeLessThan(autoResult.autoFullPotential);
  });

  it('picks margin gap when larger than bleeder/leaker', () => {
    const record = makeRecord({
      periods: {
        '2025': {
          avgPrice: 100,
          volume: 1000,
          costs: { Material: 80 },
        },
        '2023': {
          avgPrice: 100,
          volume: 1000,
          costs: { Material: 60 },
        },
      },
    });

    const marginSettings = {
      optimizeFor: 'ebit' as const,
      componentLevels: { Material: 'ebit' as const },
    };

    const result = sizeRowMarginPercentOpportunity(
      record,
      2025,
      ['2023'],
      { ...opportunitySettings, targetEbitMarginPercent: 5 },
      marginSettings,
    );

    expect(result.autoWinningMethod).toBe('margin_percent_gap');
    expect(result.autoFullPotential).toBeGreaterThan(0);
  });
});

describe('sizePortfolioMarginPercentOpportunity', () => {
  it('aggregates portfolio totals', () => {
    const records = [
      makeRecord({
        id: 'row-1',
        periods: {
          '2025': { avgPrice: 100, volume: 100, costs: { Material: 80 } },
          '2023': { avgPrice: 100, volume: 100, costs: { Material: 60 } },
        },
      }),
    ];

    const marginSettings = {
      optimizeFor: 'ebit' as const,
      componentLevels: { Material: 'ebit' as const },
    };

    const portfolio = sizePortfolioMarginPercentOpportunity(
      records,
      2025,
      false,
      [2023],
      opportunitySettings,
      marginSettings,
    );

    expect(portfolio.rows).toHaveLength(1);
    expect(portfolio.totalFullPotential).toBeGreaterThan(0);
    expect(portfolio.totalCommercialRecovery).toBeGreaterThan(0);
  });
});
