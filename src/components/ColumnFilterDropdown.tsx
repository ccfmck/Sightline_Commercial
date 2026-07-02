import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Filter, Search, X } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { cn } from '../lib/utils';

/** Cap on how many option rows we render at once to stay responsive on very
 * large unique-value lists (the dataset can have thousands of part numbers).
 * Type-to-search narrows the list, so any value remains reachable. */
const MAX_RENDERED = 300;
const POPOVER_WIDTH = 264;

interface ColumnFilterDropdownProps {
  /** Human label for the column, used in the accessible button label. */
  label: string;
  /** All unique values present in the column (from the current rows). */
  options: string[];
  /** Currently-checked values. An empty set means "no filter" (show all). */
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Which edge of the trigger the popover aligns to. */
  align?: 'left' | 'right';
}

/**
 * Excel-style column-header filter: a funnel button that opens a popover with a
 * type-to-search box and a multi-select checklist of the column's unique values.
 * Empty selection = "no filter" (all rows shown). The funnel highlights when a
 * filter is active. Closes on outside click / Escape.
 */
export function ColumnFilterDropdown({
  label,
  options,
  selected,
  onChange,
  align = 'left',
}: ColumnFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const active = selected.size > 0;

  // Position with fixed coordinates derived from the trigger so the popover is
  // never clipped by the table's horizontally-scrolling overflow container.
  const reposition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    let left = align === 'right' ? rect.right - POPOVER_WIDTH : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - POPOVER_WIDTH - 8));
    setPos({ top: rect.bottom + 4, left });
  }, [align]);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onScrollOrResize() {
      reposition();
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, reposition]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  const rendered = filteredOptions.slice(0, MAX_RENDERED);
  const hiddenCount = filteredOptions.length - rendered.length;

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  function selectAllVisible() {
    const next = new Set(selected);
    for (const o of filteredOptions) next.add(o);
    onChange(next);
  }

  function clearSelection() {
    onChange(new Set());
  }

  return (
    <span className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Filter ${label}`}
        aria-expanded={open}
        title={active ? `${label} filtered (${selected.size} selected)` : `Filter ${label}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-slate-200',
          active ? 'text-sky-600' : 'text-slate-400 hover:text-slate-600',
        )}
      >
        <Filter className="h-3 w-3" fill={active ? 'currentColor' : 'none'} strokeWidth={2} />
      </button>

      {open && pos && (
        <div
          ref={popoverRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
          className="z-50 flex flex-col rounded-md border border-slate-200 bg-white text-slate-700 shadow-lg"
          role="dialog"
          aria-label={`${label} filter`}
        >
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="h-8 w-full rounded border border-slate-300 pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <div className="flex gap-2">
                <button
                  type="button"
                  className="font-medium text-sky-600 hover:text-sky-800"
                  onClick={selectAllVisible}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="font-medium text-slate-500 hover:text-slate-800 disabled:opacity-40"
                  onClick={clearSelection}
                  disabled={!active}
                >
                  Clear
                </button>
              </div>
              <span className="text-slate-500">{selected.size} selected</span>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {rendered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-slate-400">No matching values.</p>
            ) : (
              rendered.map((value) => {
                const checked = selected.has(value);
                return (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1 text-xs hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(value)}
                    />
                    <span className="truncate" title={value}>
                      {value}
                    </span>
                  </label>
                );
              })
            )}
            {hiddenCount > 0 && (
              <p className="px-3 py-2 text-[11px] text-slate-400">
                Showing first {MAX_RENDERED} of {filteredOptions.length}. Type to narrow.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 p-2">
            <span className="text-[11px] text-slate-400">
              {active ? `Filtering ${selected.size}` : 'No filter (all shown)'}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              onClick={() => setOpen(false)}
            >
              <X className="h-3 w-3" /> Close
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
