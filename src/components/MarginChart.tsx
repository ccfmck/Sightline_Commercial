import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AggregationResult } from '../types';
import { formatPeriodAxisLabel } from '../lib/aggregate';
import { formatMarginPercent, formatUnitValue, formatVolume } from '../lib/format';
import { getCostComponentColor, PRICE_LINE_COLOR } from '../lib/chartColors';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';

interface MarginChartProps {
  aggregation: AggregationResult;
}

export function MarginChart({ aggregation }: MarginChartProps) {
  const { periods, costComponents, selectionLabel, anchorYear } = aggregation;

  interface ChartPoint {
    periodKey: string;
    periodLabel: string;
    isAnchorYear: boolean;
    avgPrice: number | null;
    volume: number | null;
    totalCost: number | null;
    ebitMarginPercent: number | null;
    [key: string]: string | number | boolean | null;
  }

  const chartData: ChartPoint[] = periods.map((period) => {
    const entry: ChartPoint = {
      periodKey: period.periodId,
      periodLabel: formatPeriodAxisLabel(period.periodId, period.label),
      isAnchorYear: period.isAnchorYear,
      avgPrice: period.avgPrice,
      volume: period.volume,
      totalCost: period.totalCost,
      ebitMarginPercent: period.ebitMarginPercent,
    };

    for (const component of costComponents) {
      entry[component] = period.costs[component] ?? null;
    }

    return entry;
  });

  return (
    <Card>
      <CardHeader>
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
      <CardContent>
        <div className="h-[420px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="periodLabel"
                tick={(props) => {
                  const { x, y, payload } = props;
                  const item = chartData.find((d) => d.periodLabel === payload.value);
                  const isAnchor = item?.isAnchorYear && item.periodKey !== 'at_quote';
                  return (
                    <text
                      x={Number(x)}
                      y={Number(y) + 12}
                      textAnchor="middle"
                      fill={isAnchor ? '#b45309' : '#475569'}
                      fontSize={12}
                      fontWeight={isAnchor ? 700 : 400}
                    >
                      {payload.value}
                    </text>
                  );
                }}
              />
              <YAxis
                tickFormatter={(v) => formatUnitValue(v)}
                width={72}
                label={{
                  value: 'Unit $ / part',
                  angle: -90,
                  position: 'insideLeft',
                  offset: 8,
                  style: { fontSize: 11 },
                }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as ChartPoint;
                  return (
                    <div className="rounded-md border border-slate-200 bg-white p-3 text-xs shadow-lg">
                      <p className="mb-2 font-semibold text-slate-900">{label}</p>
                      <p>Avg Price: {formatUnitValue(row.avgPrice)}</p>
                      <p>Volume: {formatVolume(row.volume)}</p>
                      {costComponents.map((c) => (
                        row[c] != null ? <p key={c}>{c}: {formatUnitValue(row[c] as number)}</p> : null
                      ))}
                      <p className="mt-1 border-t border-slate-100 pt-1">
                        Total Cost: {formatUnitValue(row.totalCost)}
                      </p>
                      <p className="font-medium">EBIT Margin: {formatMarginPercent(row.ebitMarginPercent)}</p>
                    </div>
                  );
                }}
              />
              <Legend />
              {costComponents.map((component, index) => (
                <Bar
                  key={component}
                  dataKey={component}
                  stackId="costs"
                  fill={getCostComponentColor(index)}
                  name={component}
                />
              ))}
              <Line
                type="monotone"
                dataKey="avgPrice"
                stroke={PRICE_LINE_COLOR}
                strokeWidth={2}
                dot={{ r: 4, fill: PRICE_LINE_COLOR }}
                name="Average Price"
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
