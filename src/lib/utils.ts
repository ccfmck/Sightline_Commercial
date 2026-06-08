import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const cleaned = String(value)
    .replace(/[$,\s]/g, '')
    .replace(/[()]/g, '')
    .trim();
  if (!cleaned || cleaned === '-' || cleaned === 'N/A') {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r\n/g, ' ').replace(/\s+/g, ' ').trim();
}

export function forwardFill<T>(row: T[], isEmpty: (value: T) => boolean): T[] {
  const filled = [...row];
  let last: T | null = null;
  for (let i = 0; i < filled.length; i++) {
    if (!isEmpty(filled[i])) {
      last = filled[i];
    } else if (last !== null) {
      filled[i] = last;
    }
  }
  return filled;
}
