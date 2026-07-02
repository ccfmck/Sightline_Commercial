import type { AppTabId } from './AppTabNav';

export const DATA_TAB_SECTIONS = [
  { id: 'data-upload', label: 'Upload' },
  { id: 'data-summary', label: 'Data summary' },
  { id: 'inputs-assumptions', label: 'Inputs & assumptions' },
] as const;

export const COST_LEVEL_TAB_SECTIONS = [
  { id: 'commercial-opportunity-sizing', label: 'Commercial Opportunity Sizing' },
  { id: 'price-cost-evolution', label: 'Price, Cost, and Margin evolution' },
] as const;

export const MARGIN_PERCENT_TAB_SECTIONS = [
  { id: 'margin-configuration', label: 'Margin configuration' },
  { id: 'margin-percent-opportunity-sizing', label: 'Commercial Opportunity Sizing' },
] as const;

export const BOTTOM_UP_TAB_SECTIONS = [
  { id: 'bottom-up-data', label: 'Data' },
  { id: 'bottom-up-lever1', label: 'Lever 1 — Inflation pass-through' },
  { id: 'bottom-up-lever2', label: 'Lever 2 — Linear performance pricing' },
  { id: 'bottom-up-lever3', label: 'Lever 3 — Long tail repricing' },
  { id: 'bottom-up-lever4', label: 'Lever 4 — Handling fee markup' },
  { id: 'bottom-up-lever5', label: 'Lever 5 — Leaker uplift' },
  { id: 'bottom-up-summary', label: 'Summary' },
] as const;

export function getTabSections(activeTab: AppTabId) {
  switch (activeTab) {
    case 'data':
      return DATA_TAB_SECTIONS;
    case 'cost-level':
      return COST_LEVEL_TAB_SECTIONS;
    case 'margin-percent':
      return MARGIN_PERCENT_TAB_SECTIONS;
    case 'bottom-up':
      return BOTTOM_UP_TAB_SECTIONS;
  }
}

/** Total height of fixed banner + section nav (used for content offset and scroll targets). */
export const PAGE_CHROME_OFFSET = 116;
