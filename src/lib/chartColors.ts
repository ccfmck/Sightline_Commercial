const PALETTE = [
  '#1f77b4', // blue
  '#ff7f0e', // orange
  '#009e88', // teal
  '#9467bd', // purple
  '#d62728', // red
  '#2ca02c', // green
  '#e6b800', // gold
  '#e377c2', // magenta
  '#7f7f7f', // slate
  '#17becf', // cyan
  '#8c564b', // brown
  '#a2c523', // lime
];

export function getCostComponentColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

export const PRICE_LINE_COLOR = '#dc2626';

export const ANCHOR_BAR_COLOR = '#d97706';
export const BEST_MARGIN_BAR_COLOR = '#059669';
export const REFERENCE_MARGIN_BAR_COLOR = '#457b9d';
export const LEVER_COLORS: Record<string, string> = {
  'Lever 1': '#1f77b4',
  'Lever 2': '#ff7f0e',
  'Lever 3': '#009e88',
  'Lever 4': '#9467bd',
  'Lever 5': '#d62728',
};

export function getLeverColor(leverLabel: string): string {
  return LEVER_COLORS[leverLabel] ?? getCostComponentColor(0);
}
