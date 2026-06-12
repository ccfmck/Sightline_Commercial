import type { AggregationResult, AppDisplaySettings } from '../types';
import { MarginPerformanceChart } from './MarginPerformanceChart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';

interface MarginChartProps {
  aggregation: AggregationResult;
  displaySettings?: AppDisplaySettings;
  sourceCurrency?: string;
}

export function MarginChart({ aggregation, displaySettings, sourceCurrency }: MarginChartProps) {
  const { selectionLabel, anchorYear } = aggregation;

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="px-0 pt-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Margin & Cost Performance</CardTitle>
            <CardDescription>
              Comparing historical years and At Quote vs {anchorYear} — stacked costs with average price overlay
            </CardDescription>
          </div>
          <Badge variant="secondary">{selectionLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <MarginPerformanceChart
          aggregation={aggregation}
          displaySettings={displaySettings}
          sourceCurrency={sourceCurrency}
        />
      </CardContent>
    </Card>
  );
}
