import { describe, expect, it } from 'vitest';
import { formatMarginPercent, formatUnitValue, formatVolume } from './format';

describe('format helpers', () => {
  it('formats volume without decimals', () => {
    expect(formatVolume(111916)).toBe('111,916');
  });

  it('formats unit values with two decimals', () => {
    expect(formatUnitValue(249.5)).toBe('249.50');
  });

  it('formats margin percent', () => {
    expect(formatMarginPercent(12.345)).toBe('12.3%');
  });
});
