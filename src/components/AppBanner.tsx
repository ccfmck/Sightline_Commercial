import { getAppTabLabel, type AppTabId } from './AppTabNav';

interface AppBannerProps {
  activeTab?: AppTabId;
  fixed?: boolean;
}

export function AppBanner({ activeTab, fixed = false }: AppBannerProps) {
  const subtitle = activeTab ? getAppTabLabel(activeTab) : undefined;

  return (
    <header
      className={
        fixed
          ? 'fixed inset-x-0 top-0 z-50 border-b border-slate-800 bg-slate-900 text-white'
          : 'border-b border-slate-800 bg-slate-900 text-white'
      }
    >
      <div className="px-4 py-3 sm:px-6 lg:px-8">
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Sightline Commercial</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-300">{subtitle}</p>}
      </div>
    </header>
  );
}
