const PALETTE = [
  '#1e3a5f',
  '#2d6a4f',
  '#40916c',
  '#52b788',
  '#74c69d',
  '#b7e4c7',
  '#95d5b2',
  '#d8f3dc',
  '#457b9d',
  '#a8dadc',
  '#e9c46a',
  '#f4a261',
];

export function getCostComponentColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

export const PRICE_LINE_COLOR = '#dc2626';
