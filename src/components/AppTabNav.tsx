import { cn } from '../lib/utils';

export type AppTabId = 'data' | 'cost-level' | 'margin-percent' | 'bottom-up';

const TABS: { id: AppTabId; label: string }[] = [
  { id: 'data', label: 'Data upload and overall input' },
  { id: 'cost-level', label: 'Margin erosion sizing - cost based' },
  { id: 'margin-percent', label: 'Margin erosion sizing - margin based' },
  { id: 'bottom-up', label: 'Bottom-up erosion sizing' },
];

interface AppTabNavProps {
  activeTab: AppTabId;
  onTabChange: (tab: AppTabId) => void;
}

export function AppTabNav({ activeTab, onTabChange }: AppTabNavProps) {
  return (
    <nav
      className="fixed left-3 top-36 z-40 hidden w-52 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur lg:block xl:left-6"
      aria-label="Application tabs"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Views</p>
      <ul className="space-y-1 text-sm">
        {TABS.map((tab) => (
          <li key={tab.id}>
            <button
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'w-full rounded-md px-2 py-1.5 text-left text-xs leading-snug transition-colors',
                activeTab === tab.id
                  ? 'bg-slate-900 font-medium text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
              title={tab.label}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function getAppTabLabel(tab: AppTabId): string {
  return TABS.find((t) => t.id === tab)?.label ?? tab;
}
