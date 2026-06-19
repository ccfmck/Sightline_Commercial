import type { MarginLevel, MarginPercentSettings } from '../types';

const DEFAULT_LEVEL_BY_COMPONENT: Record<string, MarginLevel> = {
  'Direct material': 'material',
  'Direct labor': 'contribution',
  'Variable Overhead': 'contribution',
  'Fixed Overhead': 'ebit',
  Depreciation: 'ebit',
  'Amortized tooling': 'ebit',
  'Corporate allocation': 'ebit',
  'Other SG&A': 'ebit',
};

export function defaultComponentLevel(component: string): MarginLevel {
  return DEFAULT_LEVEL_BY_COMPONENT[component] ?? 'ebit';
}

export function buildDefaultMarginPercentSettings(costComponents: string[]): MarginPercentSettings {
  const componentLevels: Record<string, MarginLevel> = {};
  for (const component of costComponents) {
    componentLevels[component] = defaultComponentLevel(component);
  }
  return {
    optimizeFor: 'ebit',
    componentLevels,
  };
}

export function marginLevelLabel(level: MarginLevel): string {
  switch (level) {
    case 'material':
      return 'Material margin';
    case 'contribution':
      return 'Contribution margin';
    case 'ebit':
      return 'EBIT margin';
  }
}

export function optimizeForLabel(optimizeFor: MarginLevel): string {
  return marginLevelLabel(optimizeFor);
}
