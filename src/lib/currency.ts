import type { AppDisplaySettings } from '../types';

export function normalizeCurrencyCode(value: string | undefined): string {
  const cleaned = (value ?? '').trim().toUpperCase();
  return cleaned || 'USD';
}

export function convertToDisplayCurrency(
  amount: number,
  sourceCurrency: string,
  settings: AppDisplaySettings,
): number {
  if (settings.displayCurrency === 'source') return amount;
  const source = normalizeCurrencyCode(sourceCurrency);
  if (source === 'USD') return amount;
  const rate = settings.fxRatesToUsd[source];
  if (rate === undefined || rate <= 0) return amount;
  return amount * rate;
}

export function getDisplayCurrencyCode(
  sourceCurrency: string,
  settings: AppDisplaySettings,
): string {
  if (settings.displayCurrency === 'source') {
    return normalizeCurrencyCode(sourceCurrency);
  }
  return 'USD';
}
