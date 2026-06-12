import { describe, expect, it } from 'vitest';

import { isMeaningfulPartRow } from './rowFilter';
import type { ColumnHeader } from '../types';

const headers: ColumnHeader[] = [
  {
    columnIndex: 0,
    section: 'metadata',
    sectionLabel: 'Program Information',
    year: null,
    metricType: 'metadata',
    fieldName: 'OEM',
    unit: null,
    costComponentKey: null,
  },
  {
    columnIndex: 1,
    section: 'metadata',
    sectionLabel: 'Program Information',
    year: null,
    metricType: 'metadata',
    fieldName: 'Program Name',
    unit: null,
    costComponentKey: null,
  },
];

describe('isMeaningfulPartRow', () => {
  it('accepts rows with program identity fields', () => {
    expect(isMeaningfulPartRow(['GM', 'GEM', '', ''], headers)).toBe(true);
  });

  it('rejects spacer rows without identity fields', () => {
    expect(isMeaningfulPartRow(['', '', '', ''], headers)).toBe(false);
    expect(isMeaningfulPartRow([' ', ' ', '', ''], headers)).toBe(false);
  });
});
