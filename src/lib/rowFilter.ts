import type { ColumnHeader } from '../types';
import { normalizeCellText } from './utils';

const PART_IDENTITY_FIELDS = ['OEM', 'Program Name', 'Part number', 'Part description'];

/** Rows must have at least one program/part identity field populated (omits spacer rows). */
export function isMeaningfulPartRow(row: unknown[], headers: ColumnHeader[]): boolean {
  for (const header of headers) {
    if (header.metricType !== 'metadata') continue;
    if (!PART_IDENTITY_FIELDS.includes(header.fieldName)) continue;
    if (normalizeCellText(row[header.columnIndex])) return true;
  }
  return false;
}
