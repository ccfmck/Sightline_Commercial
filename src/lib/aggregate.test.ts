import { describe, expect, it } from 'vitest';

import { aggregateRecords } from './aggregate';

import type { PartProgramRecord, PeriodDefinition } from '../types';



const anchorYear = 2025;



const periods: PeriodDefinition[] = [

  { id: 'at_quote', label: 'At Quote (2025 est.)', year: 2025, sortOrder: 0, isAnchorYear: true },

  { id: '2024', label: '2024', year: 2024, sortOrder: 1, isAnchorYear: false },

  { id: '2025', label: '2025', year: 2025, sortOrder: 2, isAnchorYear: true },

];



const costComponents = ['Direct material', 'Direct labor', 'Overhead'];



const recordA: PartProgramRecord = {

  id: 'a',

  metadata: { OEM: 'Ford' },

  quoteYears: {

    2025: { avgPrice: 100, volume: 1000 },

    2024: { avgPrice: 98, volume: 900 },

  },

  atQuoteCosts: { 'Direct material': 40, 'Direct labor': 20 },

  periods: {

    '2024': { avgPrice: 95, volume: 1100, costs: { 'Direct material': 42, 'Direct labor': 21 } },

    '2025': { avgPrice: 90, volume: 1200, costs: { 'Direct material': 45, 'Direct labor': 22, Overhead: 5 } },

  },

};



const recordB: PartProgramRecord = {

  id: 'b',

  metadata: { OEM: 'GM' },

  quoteYears: {

    2025: { avgPrice: 110, volume: 500 },

    2024: { avgPrice: 108, volume: 700 },

  },

  atQuoteCosts: { 'Direct material': 50 },

  periods: {

    '2024': { avgPrice: 105, volume: 600, costs: { 'Direct material': 48, 'Direct labor': 24 } },

    '2025': { avgPrice: 100, volume: 700, costs: { 'Direct labor': 30 } },

  },

};



describe('aggregateRecords', () => {

  it('computes EBIT margin percent from price and present costs', () => {

    const result = aggregateRecords([recordA], periods, costComponents, anchorYear);

    const atQuote = result?.periods.find((p) => p.periodId === 'at_quote');



    expect(atQuote?.avgPrice).toBe(100);

    expect(atQuote?.totalCost).toBe(60);

    expect(atQuote?.ebitMarginPercent).toBeCloseTo(40, 1);

    expect(atQuote?.costs.Overhead).toBeUndefined();

  });



  it('omits blank cost components instead of zero-filling', () => {

    const result = aggregateRecords([recordB], periods, costComponents, anchorYear);

    const atQuote = result?.periods.find((p) => p.periodId === 'at_quote');



    expect(atQuote?.costs['Direct material']).toBe(50);

    expect(atQuote?.costs['Direct labor']).toBeUndefined();

    expect(atQuote?.totalCost).toBe(50);

    expect(atQuote?.ebitMarginPercent).toBeCloseTo(((110 - 50) / 110) * 100, 1);

  });



  it('volume-weights using each period own volume', () => {

    const result = aggregateRecords([recordA, recordB], periods, costComponents, anchorYear);

    const atQuote = result?.periods.find((p) => p.periodId === 'at_quote');

    const y2024 = result?.periods.find((p) => p.periodId === '2024');



    expect(atQuote?.volume).toBe(1500);

    expect(atQuote?.avgPrice).toBeCloseTo(103.333, 2);

    expect(atQuote?.costs['Direct material']).toBeCloseTo(43.333, 2);



    expect(y2024?.avgPrice).toBeCloseTo(98.529, 2);

    expect(y2024?.volume).toBe(1700);



    expect(result?.selectionLabel).toContain('volume-weighted');

  });



  it('volume-weights using full-precision quote prices', () => {
    const preciseA: PartProgramRecord = {
      ...recordA,
      quoteYears: {
        2025: { avgPrice: 192.03107658157603, volume: 45050 },
      },
    };
    const preciseB: PartProgramRecord = {
      ...recordB,
      quoteYears: {
        2025: { avgPrice: 290.8142757409719, volume: 94538 },
      },
    };

    const result = aggregateRecords([preciseA, preciseB], periods, costComponents, anchorYear);
    const atQuote = result?.periods.find((p) => p.periodId === 'at_quote');

    expect(atQuote?.avgPrice).toBeCloseTo(258.9334, 3);
  });

  it('uses selected anchor year for at-quote price and volume', () => {

    const result = aggregateRecords([recordA], periods, costComponents, 2024);

    const atQuote = result?.periods.find((p) => p.periodId === 'at_quote');



    expect(atQuote?.avgPrice).toBe(98);

    expect(atQuote?.volume).toBe(900);

    expect(atQuote?.costs['Direct material']).toBe(40);

  });

});


