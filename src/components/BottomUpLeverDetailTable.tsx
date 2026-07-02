import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { AppDisplaySettings } from '../types';
import { convertToDisplayCurrency, getDisplayCurrencyCode } from '../lib/currency';
import { formatCurrency, formatUnitValueWithCurrency } from '../lib/format';
import { cn } from '../lib/utils';
import { ColumnFilterDropdown } from './ColumnFilterDropdown';

/**
 * Minimal shape every lever's detail row must provide so the shared wrapper can
 * drive the OEM / Part-number filters and the stable React key.
 */
export interface BottomUpDetailRowBase {
  recordId: string;
  oem: string;
  partNumber: string;
}

/**
 * Descriptor for one Excel-style filterable column. Each lever declares the set
 * of columns that participate in the cascade (always OEM + Part number, plus any
 * grouping columns). `columnIndex` is the 0-based position of the column within
 * the table body so the funnel row can align each dropdown under its column.
 */
export interface DetailFilterColumn<T extends BottomUpDetailRowBase> {
  /** Stable key used for the per-column selection state. */
  key: string;
  /** Human label for the column (drives the dropdown's accessible name). */
  label: string;
  /** 0-based body-column position, used to align the funnel row. */
  columnIndex: number;
  /** Reads the column's value from a row (used for options + filtering). */
  accessor: (row: T) => string;
}

/** Shared empty selection so unselected columns keep a stable Set reference. */
const EMPTY_SELECTION: ReadonlySet<string> = new Set<string>();

/**
 * Non-all-caps column header cell for the lever build-up detail tables. Mirrors
 * the shared `TableHeaderCell` styling but intentionally drops the `uppercase`
 * class so headers read in sentence/Title case (e.g. "Actual price").
 */
export function DetailHeaderCell({
  children,
  align = 'left',
  className,
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return (
    <th
      className={cn(
        'bg-slate-50 px-2 py-2 align-bottom',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      <span className="block whitespace-normal break-words text-[10px] font-medium leading-snug tracking-wide text-slate-500 sm:text-[11px]">
        {children}
      </span>
    </th>
  );
}

/** Non-all-caps grouped (spanning) header band for the detail tables. */
export function DetailGroupHeaderCell({
  children,
  colSpan,
  className,
}: {
  children?: ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <th
      colSpan={colSpan}
      className={cn(
        'border-l border-slate-200 bg-slate-100 px-2 py-1.5 text-center text-[10px] font-semibold tracking-wide text-slate-500 sm:text-[11px]',
        className,
      )}
    >
      {children}
    </th>
  );
}

/**
 * Currency formatters bound to the current display-currency settings. `unitMoney`
 * uses 2-decimal per-unit formatting; `totalMoney` uses whole-dollar totals. Both
 * render `—` for null/undefined so excluded/skip rows show blanks consistently.
 */
export function makeDetailMoneyFormatters(displaySettings: AppDisplaySettings) {
  return {
    unitMoney(value: number | null | undefined, currency: string): string {
      if (value === null || value === undefined) return '—';
      return formatUnitValueWithCurrency(
        convertToDisplayCurrency(value, currency, displaySettings),
        getDisplayCurrencyCode(currency, displaySettings),
      );
    },
    totalMoney(value: number | null | undefined, currency: string): string {
      if (value === null || value === undefined) return '—';
      return formatCurrency(
        convertToDisplayCurrency(value, currency, displaySettings),
        getDisplayCurrencyCode(currency, displaySettings),
      );
    },
  };
}

interface BottomUpLeverDetailTableProps<T extends BottomUpDetailRowBase> {
  title: string;
  /** Optional trailing note appended to the disclosure description. */
  note?: string;
  rows: T[];
  /** The `<thead>` inner content (rendered inside `<thead>`). */
  head: ReactNode;
  renderRow: (row: T) => ReactNode;
  /** Number of body columns, used to span the empty-state row. */
  columnCount: number;
  minWidthClass?: string;
  /**
   * Columns that expose an Excel-style multi-select filter. They participate in a
   * cascade (each column's options are derived from the rows passing the OTHER
   * columns' filters). Defaults to none if omitted.
   */
  filterColumns?: DetailFilterColumn<T>[];
}

/**
 * Shared wrapper for every lever's per-part cost build-up detail table. Provides:
 *  - a "Show detail" / "Hide detail" button to open/close the table,
 *  - Excel-style multi-select column filters (funnel icons in the OEM and
 *    Part-number headers) with type-to-search over each column's unique values,
 *  - consistent container/table styling.
 * Each lever supplies its own year-aware, non-all-caps `head` and `renderRow`.
 */
export function BottomUpLeverDetailTable<T extends BottomUpDetailRowBase>({
  title,
  note,
  rows,
  head,
  renderRow,
  columnCount,
  minWidthClass = 'min-w-[72rem]',
  filterColumns = [],
}: BottomUpLeverDetailTableProps<T>) {
  const [open, setOpen] = useState(false);
  // Per-column selections keyed by `filterColumns[i].key`. An absent/empty set
  // means "no filter" for that column (all values pass).
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});

  const getSelection = useCallback(
    (key: string): Set<string> | undefined => {
      const set = selections[key];
      return set && set.size > 0 ? set : undefined;
    },
    [selections],
  );

  // A row passes the cascade when it satisfies every active column filter except
  // (optionally) the one being computed. Passing `null` applies every filter and
  // yields the final displayed rows.
  const rowsPassingExcept = useCallback(
    (exceptKey: string | null): T[] =>
      rows.filter((row) =>
        filterColumns.every((col) => {
          if (col.key === exceptKey) return true;
          const sel = selections[col.key];
          if (!sel || sel.size === 0) return true;
          return sel.has(col.accessor(row));
        }),
      ),
    [rows, filterColumns, selections],
  );

  // Cascading options: each column shows the unique values present in the rows
  // that pass the OTHER columns' active filters (Excel-style dependent lists).
  // Currently-selected values are unioned in so an existing selection stays
  // visible/uncheckable even if the cascade would otherwise hide it.
  const optionsByKey = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const col of filterColumns) {
      const available = new Set(rowsPassingExcept(col.key).map(col.accessor));
      const sel = selections[col.key];
      if (sel) for (const v of sel) available.add(v);
      result[col.key] = Array.from(available).sort((a, b) => a.localeCompare(b));
    }
    return result;
  }, [filterColumns, rowsPassingExcept, selections]);

  // Total distinct values per column across ALL rows. Columns with a single
  // distinct value (e.g. the "All (single group)" sentinel) render no funnel —
  // the column still shows, but a one-value filter would be a no-op.
  const distinctCountByKey = useMemo(() => {
    const result: Record<string, number> = {};
    for (const col of filterColumns) {
      result[col.key] = new Set(rows.map(col.accessor)).size;
    }
    return result;
  }, [filterColumns, rows]);

  const filtered = useMemo(() => rowsPassingExcept(null), [rowsPassingExcept]);

  if (rows.length === 0) return null;

  const hasFilter = filterColumns.some((col) => (selections[col.key]?.size ?? 0) > 0);

  function setSelection(key: string, next: Set<string>) {
    setSelections((prev) => ({ ...prev, [key]: next }));
  }

  function clearFilters() {
    setSelections({});
  }

  return (
    <div className="space-y-2 border-t border-slate-200 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-500">
            {open ? (
              <>
                Click <strong>Hide detail</strong> to collapse.
              </>
            ) : (
              <>
                Click <strong>Show detail</strong> to open the per-part build-up ({rows.length}{' '}
                parts).
              </>
            )}
            {note ? ` ${note}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Hide detail −' : 'Show detail +'}
        </button>
      </div>

      {open && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate-500">
              {filtered.length} of {rows.length} parts
            </span>
            <span className="text-xs text-slate-400">
              Use the funnel icons in the column headers to filter.
            </span>
            {hasFilter && (
              <button
                type="button"
                className="text-xs font-medium text-slate-500 underline hover:text-slate-800"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className={cn('w-full text-left text-xs', minWidthClass)}>
              <thead>
                <tr>
                  {Array.from({ length: columnCount }).map((_, idx) => {
                    const col = filterColumns.find((c) => c.columnIndex === idx);
                    const showFunnel = col ? distinctCountByKey[col.key] > 1 : false;
                    return (
                      <th key={idx} className="bg-slate-50 px-2 pt-2">
                        {col && showFunnel && (
                          <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-[11px]">
                            <span>Filter</span>
                            <ColumnFilterDropdown
                              label={col.label}
                              options={optionsByKey[col.key] ?? []}
                              selected={getSelection(col.key) ?? (EMPTY_SELECTION as Set<string>)}
                              onChange={(next) => setSelection(col.key, next)}
                            />
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
                {head}
              </thead>
              <tbody>
                {filtered.map((row) => renderRow(row))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={columnCount}
                      className="px-2 py-4 text-center text-xs text-slate-500"
                    >
                      No parts match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
