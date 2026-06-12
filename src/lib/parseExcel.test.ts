import { describe, expect, it } from 'vitest';

import { excelCellToGridValue, parseWorkbookGrid } from './parseExcel';

import { buildPeriods } from './periods';

import { DEFAULT_ANCHOR_YEAR } from '../types';



const fixtureGrid = [

  ['Program Information', '', '', 'At Time of Quote', '', '', '', '', '', '2024 Historical Actual', '', '', '', '2025 Historical Actual', '', '', ''],

  ['', '', '', 'Price', 'Volume', 'Cost', '', '', '', 'Price', 'Volume', 'Cost', '', 'Price', 'Volume', 'Cost', ''],

  ['', '', '', '$/unit', 'units', '$/unit', '', '', '', '$/unit', 'units', '$/unit', '', '$/unit', 'units', '$/unit', ''],

  [

    'OEM', 'Program Name', 'Division',

    '2024 quote price', '2024 quote volume', 'At quote direct material', 'At quote direct labor',

    `${DEFAULT_ANCHOR_YEAR} quote price`, `${DEFAULT_ANCHOR_YEAR} quote volume`,

    '2024 Average price', '2024 Full year volume', '2024 Direct material', '2024 Direct labor',

    '2025 Average price', '2025 Full year volume', '2025 Direct material', '2025 Direct labor',

  ],

  ['Ford', 'Program A', 'Plant 1', '98', '900', '40', '20', '100', '1000', '95', '1100', '42', '21', '90', '1200', '45', '22'],

  ['GM', 'Program B', 'Plant 2', '108', '700', '45', '22', '110', '800', '100', '900', '44', '23', '92', '1000', '46', '24'],

  ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],

];



describe('excelCellToGridValue', () => {
  it('uses raw numeric value instead of rounded display text', () => {
    const cell = { t: 'n', v: 192.03107658157603, w: '192' } as import('xlsx').CellObject;
    expect(excelCellToGridValue(cell)).toBe('192.03107658157603');
  });
});

describe('parseWorkbookGrid', () => {

  it('parses multi-row headers and classifies columns', () => {

    const result = parseWorkbookGrid(fixtureGrid, 'Test');



    expect(result.metadataFields).toContain('OEM');

    expect(result.availableQuoteYears).toContain(2024);

    expect(result.availableQuoteYears).toContain(DEFAULT_ANCHOR_YEAR);

    expect(result.availableHistoricalYears).toContain(2024);



    const periods = buildPeriods(DEFAULT_ANCHOR_YEAR, result.hasAtQuote, result.availableHistoricalYears);

    expect(periods[0]?.id).toBe('at_quote');

    expect(periods.map((p) => p.id)).toContain('2024');

    expect(result.costComponents).toEqual(['Direct material', 'Direct labor']);

    expect(result.rowCount).toBe(2);

  });



  it('places At Quote before annual years', () => {

    const result = parseWorkbookGrid(fixtureGrid, 'Test');

    const periods = buildPeriods(DEFAULT_ANCHOR_YEAR, result.hasAtQuote, result.availableHistoricalYears);

    const labels = periods.map((p) => p.id);

    expect(labels.indexOf('at_quote')).toBeLessThan(labels.indexOf('2024'));

    expect(labels.indexOf('2024' as const)).toBeLessThan(
      labels.indexOf(String(DEFAULT_ANCHOR_YEAR) as `${number}`),
    );

  });



  it('omits blank spacer rows without program/part identity', () => {
    const result = parseWorkbookGrid(fixtureGrid, 'Test');
    expect(result.rowCount).toBe(2);
  });



  it('stores quote years separately for anchor selection', () => {

    const result = parseWorkbookGrid(fixtureGrid, 'Test');

    expect(result.records[0]?.quoteYears[2024]?.avgPrice).toBe(98);

    expect(result.records[0]?.quoteYears[DEFAULT_ANCHOR_YEAR]?.avgPrice).toBe(100);

    expect(result.records[0]?.atQuoteCosts['Direct material']).toBe(40);

  });

});


