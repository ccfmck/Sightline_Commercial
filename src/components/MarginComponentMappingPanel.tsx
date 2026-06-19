import type { MarginLevel, MarginPercentSettings } from '../types';
import { marginLevelLabel, optimizeForLabel } from '../lib/marginComponentDefaults';
import { PAGE_CHROME_OFFSET } from './tabSections';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValueLeft,
} from './ui/select';

interface MarginComponentMappingPanelProps {
  costComponents: string[];
  settings: MarginPercentSettings;
  onSettingsChange: (settings: MarginPercentSettings) => void;
}

const MARGIN_LEVELS: MarginLevel[] = ['material', 'contribution', 'ebit'];

export function MarginComponentMappingPanel({
  costComponents,
  settings,
  onSettingsChange,
}: MarginComponentMappingPanelProps) {
  function updateOptimizeFor(value: MarginLevel) {
    onSettingsChange({ ...settings, optimizeFor: value });
  }

  function updateComponentLevel(component: string, level: MarginLevel) {
    onSettingsChange({
      ...settings,
      componentLevels: {
        ...settings.componentLevels,
        [component]: level,
      },
    });
  }

  return (
    <Card id="margin-configuration" style={{ scrollMarginTop: PAGE_CHROME_OFFSET + 12 }}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Margin configuration</CardTitle>
        <CardDescription>
          Choose which margin to optimize and map each cost component to its deepest margin level.
          Higher margin types include all lower-level costs (material ⊂ contribution ⊂ EBIT).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="optimize-for">Optimize for</Label>
          <Select
            value={settings.optimizeFor}
            onValueChange={(value) => updateOptimizeFor(value as MarginLevel)}
          >
            <SelectTrigger id="optimize-for">
              <SelectValueLeft placeholder="Select margin type" />
            </SelectTrigger>
            <SelectContent>
              {MARGIN_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {optimizeForLabel(level)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-900">Cost component mapping</h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {costComponents.map((component) => (
              <div
                key={component}
                className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/50 px-2 py-1.5"
              >
                <span
                  className="min-w-0 flex-1 truncate text-xs text-slate-700"
                  title={component}
                >
                  {component}
                </span>
                <Select
                  value={settings.componentLevels[component] ?? 'ebit'}
                  onValueChange={(value) => updateComponentLevel(component, value as MarginLevel)}
                >
                  <SelectTrigger className="h-7 w-[9.5rem] shrink-0 text-[11px]">
                    <SelectValueLeft />
                  </SelectTrigger>
                  <SelectContent>
                    {MARGIN_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {marginLevelLabel(level)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
