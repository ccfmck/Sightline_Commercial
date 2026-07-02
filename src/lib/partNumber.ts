/**
 * Part number is the unique row identity and calculation granularity for the
 * bottom-up flow. This module centralizes robust detection of the part-number
 * column (across header spellings), extraction of a part number from a record's
 * metadata, and generation of stable unique record ids that never silently
 * merge distinct rows.
 */

/** Canonical metadata key under which the detected part number is stored for display. */
export const PART_NUMBER_METADATA_KEY = 'Part number';

/**
 * Normalized header forms that identify a part-number column, in priority order
 * (most specific first). Detection is case- and punctuation-insensitive, so
 * "Part Number", "Part No", "Part #", "PartNumber", "Part No." all match.
 */
const PART_NUMBER_HEADER_PRIORITY = [
  'partnumber',
  'partno',
  'partnum',
  'partnbr',
  'partid',
  'part',
] as const;

function normalizeHeaderKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** True when a column header names a part-number column (case/punctuation-insensitive). */
export function isPartNumberHeader(header: string): boolean {
  return PART_NUMBER_HEADER_PRIORITY.includes(
    normalizeHeaderKey(header) as (typeof PART_NUMBER_HEADER_PRIORITY)[number],
  );
}

/**
 * Find the best-matching part-number key among the provided metadata keys.
 * Prefers more specific spellings (e.g. "Part Number") over the bare "Part".
 */
export function findPartNumberKey(keys: string[]): string | null {
  let best: { key: string; rank: number } | null = null;
  for (const key of keys) {
    const rank = PART_NUMBER_HEADER_PRIORITY.indexOf(
      normalizeHeaderKey(key) as (typeof PART_NUMBER_HEADER_PRIORITY)[number],
    );
    if (rank === -1) continue;
    if (best === null || rank < best.rank) best = { key, rank };
  }
  return best?.key ?? null;
}

/** Extract the raw part number from a record's metadata, or null when absent/blank. */
export function getRecordPartNumber(metadata: Record<string, string>): string | null {
  const key = findPartNumberKey(Object.keys(metadata));
  if (!key) return null;
  const value = metadata[key]?.trim();
  return value ? value : null;
}

/**
 * Return a unique id derived from `base`, appending a " (#n)" suffix when the
 * base collides with an already-used id. This keeps duplicate part numbers as
 * distinct rows while preserving the raw part number as the visible label.
 */
export function makeUniquePartNumberId(base: string, usedIds: Set<string>): string {
  const trimmed = base.trim() || 'row';
  if (!usedIds.has(trimmed)) {
    usedIds.add(trimmed);
    return trimmed;
  }
  let suffix = 2;
  let candidate = `${trimmed} (#${suffix})`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${trimmed} (#${suffix})`;
  }
  usedIds.add(candidate);
  return candidate;
}

/**
 * Resolve a record's unique id and raw part number.
 *
 * The unique id prefers the raw part number; when it is missing it falls back to
 * a combination of the provided identity parts and the row index; when the part
 * number is duplicated a numeric suffix is appended so ids stay unique. The raw
 * part number (when present) is returned separately so callers can keep it as the
 * visible label.
 */
export function resolvePartNumberIdentity(
  metadata: Record<string, string>,
  rowIndex: number,
  usedIds: Set<string>,
  fallbackParts: (string | undefined | null)[] = [],
): { id: string; partNumber: string | null } {
  const partNumber = getRecordPartNumber(metadata);
  const fallbackBase = fallbackParts
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p))
    .join(' | ');
  const base =
    partNumber ?? (fallbackBase ? `${fallbackBase} | row ${rowIndex}` : `row-${rowIndex}`);
  return { id: makeUniquePartNumberId(base, usedIds), partNumber };
}
