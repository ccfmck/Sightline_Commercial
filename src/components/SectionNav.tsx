const SECTIONS = [
  { id: 'data-summary', label: 'Data summary' },
  { id: 'inputs-assumptions', label: 'Additional Input and Assumptions' },
  { id: 'commercial-opportunity-sizing', label: 'Commercial Opportunity Sizing' },
  { id: 'price-cost-evolution', label: 'Price, Cost, and Margin evolution' },
] as const;

export function SectionNav() {
  function scrollTo(id: string) {
    const offset = 88;
    const element = document.getElementById(id);
    if (!element) return;
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  return (
    <nav
      className="fixed left-3 top-24 z-40 hidden w-52 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur lg:block xl:left-6"
      aria-label="Jump to section"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Jump to
      </p>
      <ul className="space-y-1 text-sm">
        {SECTIONS.map((section) => (
          <li key={section.id}>
            <button
              type="button"
              onClick={() => scrollTo(section.id)}
              className="w-full rounded-md px-2 py-1.5 text-left text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {section.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
