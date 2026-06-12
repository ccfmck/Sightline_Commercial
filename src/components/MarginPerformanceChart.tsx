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
import type { AggregatedPeriod, AggregationResult, AppDisplaySettings } from '../types';
import { formatPeriodAxisLabel } from '../lib/aggregate';
import { convertToDisplayCurrency, getDisplayCurrencyCode } from '../lib/currency';
import { formatMarginPercent, formatUnitValue, formatUnitValueWithCurrency, formatVolume } from '../lib/format';
import { getCostComponentColor, PRICE_LINE_COLOR } from '../lib/chartColors';

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

interface MarginPerformanceChartProps {
  aggregation: AggregationResult;
  height?: number;
  showAnchorComparison?: boolean;
  displaySettings?: AppDisplaySettings;
  sourceCurrency?: string;
}

interface CostIncreaseDetail {
  component: string;
  increase: number;
}

interface TooltipMetricRow {
  label: string;
  value: number | null;
  anchorValue: number | null;
  formatter: (v: number) => string;
  kind: 'price' | 'volume' | 'cost' | 'totalCost' | 'margin';
  costIncreaseBreakdown?: CostIncreaseDetail[];
}

function convertMonetaryValue(
  value: number | null | undefined,
  displaySettings?: AppDisplaySettings,
  sourceCurrency?: string,
): number | null {
  if (value === null || value === undefined) return null;
  if (!displaySettings || !sourceCurrency) return value;
  return convertToDisplayCurrency(value, sourceCurrency, displaySettings);
}

function createMonetaryFormatter(
  displaySettings?: AppDisplaySettings,
  sourceCurrency?: string,
): (v: number) => string {
  if (!displaySettings || !sourceCurrency) return formatUnitValue;
  const code = getDisplayCurrencyCode(sourceCurrency, displaySettings);
  return (v: number) => formatUnitValueWithCurrency(v, code);
}

function convertPeriodForDisplay(
  period: AggregatedPeriod,
  costComponents: string[],
  displaySettings?: AppDisplaySettings,
  sourceCurrency?: string,
): AggregatedPeriod {
  if (!displaySettings || !sourceCurrency) return period;

  const costs: Record<string, number | null> = {};
  for (const component of costComponents) {
    costs[component] = convertMonetaryValue(period.costs[component], displaySettings, sourceCurrency);
  }

  return {
    ...period,
    avgPrice: convertMonetaryValue(period.avgPrice, displaySettings, sourceCurrency),
    totalCost: convertMonetaryValue(period.totalCost, displaySettings, sourceCurrency),
    costs,
  };
}

function buildChartData(
  aggregation: AggregationResult,
  displaySettings?: AppDisplaySettings,
  sourceCurrency?: string,
): ChartPoint[] {
  const { periods, costComponents } = aggregation;
  return periods.map((period) => {
    const displayPeriod = convertPeriodForDisplay(period, costComponents, displaySettings, sourceCurrency);
    const entry: ChartPoint = {
      periodKey: displayPeriod.periodId,
      periodLabel: formatPeriodAxisLabel(displayPeriod.periodId, displayPeriod.label),
      isAnchorYear: displayPeriod.isAnchorYear,
      avgPrice: displayPeriod.avgPrice,
      volume: displayPeriod.volume,
      totalCost: displayPeriod.totalCost,
      ebitMarginPercent: displayPeriod.ebitMarginPercent,
    };
    for (const component of costComponents) {
      entry[component] = displayPeriod.costs[component] ?? null;
    }
    return entry;
  });
}

function findAnchorPeriod(periods: AggregatedPeriod[], anchorYear: number): AggregatedPeriod | null {
  return periods.find((p) => p.periodId === String(anchorYear)) ?? null;
}

function formatSignedDelta(delta: number, formatter: (v: number) => string): string {
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${formatter(delta)}`;
}

function getCostIncreasesTowardAnchor(
  costComponents: string[],
  periodCosts: ChartPoint,
  anchorPeriod: AggregatedPeriod,
): CostIncreaseDetail[] {
  const increases: CostIncreaseDetail[] = [];

  for (const component of costComponents) {
    const anchorCost = anchorPeriod.costs[component];
    const periodCost = periodCosts[component];
    if (anchorCost === undefined || anchorCost === null || periodCost === null || typeof periodCost !== 'number') {
      continue;
    }
    if (anchorCost > periodCost) {
      increases.push({ component, increase: anchorCost - periodCost });
    }
  }

  return increases;
}

function netDelta(value: number, anchorValue: number): number {
  return value - anchorValue;
}

function costBuildToAnchor(value: number, anchorValue: number): number | null {
  const build = anchorValue - value;
  return build > 0.0001 ? build : null;
}

function formatDeltaOrDash(delta: number | null, formatter: (v: number) => string): string {
  if (delta === null || Math.abs(delta) < 0.0001) return '—';
  return formatSignedDelta(delta, formatter);
}

function ChartComparisonTooltip({
  periodLabel,
  rows,
  anchorYear,
  isAnchorPeriod,
}: {
  periodLabel: string;
  rows: TooltipMetricRow[];
  anchorYear: number;
  isAnchorPeriod: boolean;
}) {
  return (
    <div className="relative z-[1000] rounded-md border border-slate-200 bg-white p-3 text-xs shadow-xl">
      <p className="mb-2 font-semibold text-slate-900">{periodLabel}</p>
      <table className="w-full min-w-[320px] border-collapse">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-1 pr-3 text-left font-medium">Metric</th>
            <th className="py-1 pr-3 text-right font-medium">Current</th>
            <th className="py-1 pr-3 text-right font-medium">Change vs {anchorYear}</th>
            <th className="py-1 text-right font-medium">Cost build to {anchorYear}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const current = row.value !== null ? row.formatter(row.value) : '—';
            let netChange = '—';
            let costBuild = '—';

            if (!isAnchorPeriod && row.value !== null && row.anchorValue !== null) {
              netChange = formatDeltaOrDash(netDelta(row.value, row.anchorValue), row.formatter);

              if (row.kind === 'cost') {
                const build = costBuildToAnchor(row.value, row.anchorValue);
                costBuild = formatDeltaOrDash(build, row.formatter);
              } else if (row.kind === 'totalCost') {
                const sizingTotal = row.costIncreaseBreakdown?.reduce((sum, item) => sum + item.increase, 0) ?? 0;
                const sizingBuild = sizingTotal > 0.0001 ? sizingTotal : null;
                costBuild = formatDeltaOrDash(sizingBuild, row.formatter);
              }
            }

            const highlightCostBuild =
              !isAnchorPeriod
              && row.kind === 'cost'
              && row.value !== null
              && row.anchorValue !== null
              && costBuildToAnchor(row.value, row.anchorValue) !== null;

            const highlightTotalCost =
              !isAnchorPeriod
              && row.kind === 'totalCost'
              && (row.costIncreaseBreakdown?.length ?? 0) > 0;

            const highlight = highlightCostBuild || highlightTotalCost;

            return (
              <tr
                key={row.label}
                className={
                  highlight
                    ? 'border-b border-amber-100 bg-amber-50 last:border-0'
                    : 'border-b border-slate-100 last:border-0'
                }
              >
                <td className={highlight ? 'py-1 pr-3 font-medium text-amber-900' : 'py-1 pr-3 text-slate-700'}>
                  {row.label}
                </td>
                <td className={highlight ? 'py-1 pr-3 text-right tabular-nums text-amber-900' : 'py-1 pr-3 text-right tabular-nums'}>
                  {current}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-600">{netChange}</td>
                <td className={highlight ? 'py-1 text-right tabular-nums text-amber-800' : 'py-1 text-right tabular-nums text-slate-600'}>
                  {row.kind === 'cost' || row.kind === 'totalCost' ? costBuild : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MarginPerformanceChart({
  aggregation,
  height = 420,
  showAnchorComparison = true,
  displaySettings,
  sourceCurrency,
}: MarginPerformanceChartProps) {
  const { periods, costComponents, anchorYear } = aggregation;
  const chartData = buildChartData(aggregation, displaySettings, sourceCurrency);
  const monetaryFormatter = createMonetaryFormatter(displaySettings, sourceCurrency);
  const displayPeriods = periods.map((period) =>
    convertPeriodForDisplay(period, costComponents, displaySettings, sourceCurrency),
  );
  const anchorPeriod = findAnchorPeriod(displayPeriods, anchorYear);

  return (
    <div className="relative z-0 w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 12, right: 16, left: 8, bottom: 36 }}>
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
            tickFormatter={(v) => monetaryFormatter(v)}
            width={72}
            label={{
              value: 'Unit $ / part',
              angle: -90,
              position: 'insideLeft',
              offset: 8,
              style: { fontSize: 11 },
            }}
          />
          <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 12 }} />
          <Tooltip
            offset={24}
            wrapperStyle={{ zIndex: 1000, pointerEvents: 'none' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as ChartPoint;
              const isAnchorPeriod = row.periodKey === String(anchorYear);
              const useComparison = showAnchorComparison && anchorPeriod;

              if (!useComparison) {
                return (
                  <div className="relative z-[1000] rounded-md border border-slate-200 bg-white p-3 text-xs shadow-xl">
                    <p className="mb-2 font-semibold text-slate-900">{label}</p>
                    <p>Avg Price: {monetaryFormatter(row.avgPrice ?? 0)}</p>
                    <p>Volume: {formatVolume(row.volume)}</p>
                    {costComponents.map((c) =>
                      row[c] != null ? (
                        <p key={c}>{c}: {monetaryFormatter(row[c] as number)}</p>
                      ) : null,
                    )}
                    <p className="mt-1 border-t border-slate-100 pt-1">
                      Total Cost: {monetaryFormatter(row.totalCost ?? 0)}
                    </p>
                    <p className="font-medium">EBIT Margin: {formatMarginPercent(row.ebitMarginPercent)}</p>
                  </div>
                );
              }

              const costIncreaseBreakdown = getCostIncreasesTowardAnchor(
                costComponents,
                row,
                anchorPeriod,
              );

              const metricRows: TooltipMetricRow[] = [
                {
                  label: 'Avg Price',
                  value: row.avgPrice,
                  anchorValue: anchorPeriod.avgPrice,
                  formatter: monetaryFormatter,
                  kind: 'price',
                },
                {
                  label: 'Volume',
                  value: row.volume,
                  anchorValue: anchorPeriod.volume,
                  formatter: formatVolume,
                  kind: 'volume',
                },
                ...costComponents
                  .filter((c) => row[c] != null)
                  .map((c) => ({
                    label: c,
                    value: row[c] as number,
                    anchorValue: anchorPeriod.costs[c] ?? null,
                    formatter: monetaryFormatter,
                    kind: 'cost' as const,
                  })),
                {
                  label: 'Total Cost',
                  value: row.totalCost,
                  anchorValue: anchorPeriod.totalCost,
                  formatter: monetaryFormatter,
                  kind: 'totalCost',
                  costIncreaseBreakdown,
                },
                {
                  label: 'EBIT Margin',
                  value: row.ebitMarginPercent,
                  anchorValue: anchorPeriod.ebitMarginPercent,
                  formatter: formatMarginPercent,
                  kind: 'margin',
                },
              ];

              return (
                <ChartComparisonTooltip
                  periodLabel={String(label)}
                  rows={metricRows}
                  anchorYear={anchorYear}
                  isAnchorPeriod={isAnchorPeriod}
                />
              );
            }}
          />
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
  );
}
