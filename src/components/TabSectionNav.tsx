import { cn } from '../lib/utils';
import { PAGE_CHROME_OFFSET } from './tabSections';

interface TabSection {
  id: string;
  label: string;
}

interface TabSectionNavProps {
  sections: readonly TabSection[];
  /** When true, pins below the fixed app banner (post-upload dashboard). */
  fixed?: boolean;
}

export function TabSectionNav({ sections, fixed = false }: TabSectionNavProps) {
  function scrollTo(id: string) {
    const element = document.getElementById(id);
    if (!element) return;
    const top = element.getBoundingClientRect().top + window.scrollY - PAGE_CHROME_OFFSET - 12;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  return (
    <nav
      className={cn(
        'border-b border-slate-200 bg-slate-100/95 px-3 py-2 backdrop-blur sm:px-4 lg:px-6',
        fixed
          ? 'fixed inset-x-0 top-[4.5rem] z-40 lg:left-56 xl:left-60'
          : 'sticky top-0 z-30',
      )}
      aria-label="Jump to section"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Jump to</span>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollTo(section.id)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
          >
            {section.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
