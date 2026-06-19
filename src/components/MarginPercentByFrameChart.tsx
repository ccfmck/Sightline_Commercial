import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  MarginPercentFrameDetail,
  MarginPercentGapResult,
  OpportunityFrameId,
  RowMarginPercentOpportunityResult,
} from '../types';
import {
  ANCHOR_BAR_COLOR,
  BEST_MARGIN_BAR_COLOR,
  REFERENCE_MARGIN_BAR_COLOR,
} from '../lib/chartColors';
import { formatMarginPercent } from '../lib/format';
import { anchorYearLabel } from '../lib/opportunitySizing';
import { optimizeForLabel } from '../lib/marginComponentDefaults';

type BarKind = 'anchor' | 'best' | 'reference';

interface ChartPoint {
  key: string;
  label: string;
  marginPercent: number;
  kind: BarKind;
  sortOrder: number;
}

function barColor(kind: BarKind): string {
  switch (kind) {
    case 'anchor':
      return ANCHOR_BAR_COLOR;
    case 'best':
      return BEST_MARGIN_BAR_COLOR;
    case 'reference':
      return REFERENCE_MARGIN_BAR_COLOR;
  }
}

function frameSortOrder(frameId: OpportunityFrameId | 'anchor', anchorYear: number): number {
  if (frameId === 'at_quote') return 0;
  if (frameId === 'anchor') return 10_000 + anchorYear;
  const year = Number(frameId);
  return Number.isFinite(year) ? year : 5_000;
}

function buildChartData(
  row: RowMarginPercentOpportunityResult,
  gap: MarginPercentGapResult,
): ChartPoint[] {
  const anchorLabel = anchorYearLabel(row.anchorYear);
  const points: ChartPoint[] = [];

  if (gap.anchorMarginPercent !== null) {
    points.push({
      key: 'anchor',
      label: anchorLabel,
      marginPercent: gap.anchorMarginPercent,
      kind: 'anchor',
      sortOrder: frameSortOrder('anchor', row.anchorYear),
    });
  }

  for (const frame of gap.marginPercentByFrame) {
    if (frame.skipped || frame.referenceMarginPercent === null) continue;
    points.push(frameToChartPoint(frame, gap.bestReferenceFrameId));
  }

  return points.sort((a, b) => a.sortOrder - b.sortOrder);
}

function frameToChartPoint(
  frame: MarginPercentFrameDetail,
  bestReferenceFrameId: OpportunityFrameId | null,
): ChartPoint {
  return {
    key: frame.frameId,
    label: frame.frameLabel,
    marginPercent: frame.referenceMarginPercent!,
    kind: frame.frameId === bestReferenceFrameId ? 'best' : 'reference',
    sortOrder: frameSortOrder(frame.frameId, 0),
  };
}

function MarginBarLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
}) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const height = Number(props.height ?? 0);
  const value = Number(props.value);
  if (!Number.isFinite(value)) return null;

  const isNegative = value < 0;
  const textY = isNegative ? y + height + 12 : y - 5;

  return (
    <text x={x + width / 2} y={textY} textAnchor="middle" fontSize={10} fill="#475569">
      {formatMarginPercent(value)}
    </text>
  );
}

interface MarginPercentByFrameChartProps {
  row: RowMarginPercentOpportunityResult;
  height?: number;
}

export function MarginPercentByFrameChart({
  row,
  height = 300,
}: MarginPercentByFrameChartProps) {
  const gap = row.marginPercentGap;
  const chartData = useMemo(() => buildChartData(row, gap), [row, gap]);
  const optimizeLabel = optimizeForLabel(gap.optimizeFor);
  const labelAngle = chartData.length > 5 ? -30 : chartData.length > 3 ? -15 : 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: ANCHOR_BAR_COLOR }}
          />
          Anchor year
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: BEST_MARGIN_BAR_COLOR }}
          />
          Best reference margin
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: REFERENCE_MARGIN_BAR_COLOR }}
          />
          Other reference frames
        </span>
      </div>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 22, right: 12, left: 0, bottom: 4 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              interval={0}
              angle={labelAngle}
              textAnchor={labelAngle !== 0 ? 'end' : 'middle'}
              height={labelAngle !== 0 ? 60 : 32}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => `${value}%`}
              width={48}
            />
            <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1.5} />
            <Tooltip
              formatter={(_value, _name, item) => {
                const point = item.payload as ChartPoint;
                return formatMarginPercent(point.marginPercent);
              }}
              labelFormatter={(label) => `${label} — ${optimizeLabel}`}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="marginPercent" maxBarSize={56}>
              {chartData.map((point) => (
                <Cell key={point.key} fill={barColor(point.kind)} />
              ))}
              <LabelList dataKey="marginPercent" content={<MarginBarLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
