import { cn } from '../lib/utils';

interface BottomUpLeverIncludeToggleProps {
  included: boolean;
  onChange: (included: boolean) => void;
}

/** Yes/No segmented control deciding whether a lever participates in sizing. */
export function BottomUpLeverIncludeToggle({
  included,
  onChange,
}: BottomUpLeverIncludeToggleProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Include in sizing
      </span>
      <div className="inline-flex overflow-hidden rounded-md border border-slate-200">
        <button
          type="button"
          aria-pressed={included}
          onClick={() => onChange(true)}
          className={cn(
            'px-3 py-1 text-xs font-medium transition-colors',
            included ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          Yes
        </button>
        <button
          type="button"
          aria-pressed={!included}
          onClick={() => onChange(false)}
          className={cn(
            'px-3 py-1 text-xs font-medium transition-colors',
            !included ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          No
        </button>
      </div>
    </div>
  );
}
