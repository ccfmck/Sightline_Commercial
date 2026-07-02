import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AppDisplaySettings, RowBottomUpOpportunityResult } from '../types';
import { convertToDisplayCurrency, getDisplayCurrencyCode } from '../lib/currency';
import { formatMarginPercent, formatUnitValueWithCurrency } from '../lib/format';
import { ANCHOR_BAR_COLOR, getLeverColor } from '../lib/chartColors';
import { getRecordPartNumber } from '../lib/partNumber';

interface BottomUpDetailDrawerProps {
  row: RowBottomUpOpportunityResult;
  settings: {
    externalFactorPercent: number;
    captureRatePercent: number;
  };
  displaySettings: AppDisplaySettings;
}

const FINAL_BAR_COLOR = '#334155';
const EXCLUDED_BAR_COLOR = '#cbd5e1';

const LEVER_LABELS = [
  'Lever 1 — Inflation',
  'Lever 2 — Material margin',
  'Lever 3 — Long tail',
  'Lever 4 — Handling fee',
  'Lever 5 — Leaker uplift',
] as const;

type WaterfallKind = 'anchor' | 'lever' | 'final';

interface WaterfallPoint {
  key: string;
  /** Full category label used as the x-axis dataKey (unique). */
  label: string;
  /** Wrapped label lines rendered under the bar. */
  lines: string[];
  /** Transparent riser so floating bars start at the running price. */
  base: number;
  /** Visible building-block height (the step-up in unit price). */
  increment: number;
  /** Cumulative unit price at this step (display currency). */
  price: number;
  cmPercent: number | null;
  kind: WaterfallKind;
  color: string;
  excluded: boolean;
}

export function BottomUpDetailDrawer({
  row,
  displaySettings,
}: BottomUpDetailDrawerProps) {
  const levers = [
    row.levers.lever1,
    row.levers.lever2,
    row.levers.lever3,
    row.levers.lever4,
    row.levers.lever5,
  ];

  const partNumber = getRecordPartNumber(row.metadata) ?? row.recordId;
  const secondaryLabel = row.metadata.OEM ?? row.metadata['Program Name'] ?? row.metadata.Program;

  const currencyCode = getDisplayCurrencyCode(row.currency, displaySettings);
  const toDisplay = (amount: number) =>
    convertToDisplayCurrency(amount, row.currency, displaySettings);

  // Anchor CM is not stored on the row, but it can be recovered from Lever 1:
  // lever1.cm = anchorCm + (lever1.price - anchorPrice) for both the sized and
  // pass-through cases, so anchorCm = lever1.cm - (lever1.price - anchorPrice).
  const waterfall = useMemo<WaterfallPoint[]>(() => {
    if (row.anchorPrice === null) return [];

    const anchorPriceDisplay = toDisplay(row.anchorPrice);
    const anchorCm = row.levers.lever1.cm - (row.levers.lever1.price - row.anchorPrice);
    const anchorCmPercent = row.anchorPrice > 0 ? (anchorCm / row.anchorPrice) * 100 : null;

    const anchorYearLabel = String(row.anchorYear);

    const points: WaterfallPoint[] = [
      {
        key: 'anchor',
        label: anchorYearLabel,
        lines: [anchorYearLabel],
        base: 0,
        increment: anchorPriceDisplay,
        price: anchorPriceDisplay,
        cmPercent: anchorCmPercent,
        kind: 'anchor',
        color: ANCHOR_BAR_COLOR,
        excluded: false,
      },
    ];

    let prevPriceDisplay = anchorPriceDisplay;
    levers.forEach((lever, i) => {
      const priceDisplay = toDisplay(lever.price);
      const increment = Math.max(0, priceDisplay - prevPriceDisplay);
      const excluded = lever.excluded === true;
      const [head, ...rest] = LEVER_LABELS[i].split(' — ');
      points.push({
        key: `lever${lever.lever}`,
        label: LEVER_LABELS[i],
        lines: rest.length > 0 ? [head, rest.join(' — ')] : [head],
        base: prevPriceDisplay,
        increment,
        price: priceDisplay,
        cmPercent: lever.cmPercent,
        kind: 'lever',
        color: excluded ? EXCLUDED_BAR_COLOR : getLeverColor(`Lever ${lever.lever}`),
        excluded,
      });
      prevPriceDisplay = priceDisplay;
    });

    const finalPriceDisplay = toDisplay(row.finalPrice);
    points.push({
      key: 'final',
      label: 'Final',
      lines: ['Final'],
      base: 0,
      increment: finalPriceDisplay,
      price: finalPriceDisplay,
      cmPercent: row.finalCmPercent,
      kind: 'final',
      color: FINAL_BAR_COLOR,
      excluded: false,
    });

    return points;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, displaySettings]);

  const lookup = useMemo(() => {
    const map = new Map<string, WaterfallPoint>();
    for (const point of waterfall) map.set(point.label, point);
    return map;
  }, [waterfall]);

  function AxisTick(props: {
    x?: number | string;
    y?: number | string;
    payload?: { value?: string | number };
  }) {
    const cx = Number(props.x ?? 0);
    const cy = Number(props.y ?? 0);
    const point = lookup.get(String(props.payload?.value ?? ''));
    if (!point) return null;
    const cmText = point.cmPercent !== null ? formatMarginPercent(point.cmPercent) : '—';
    return (
      <g>
        {point.lines.map((line, i) => (
          <text
            key={i}
            x={cx}
            y={cy + 12 + i * 11}
            textAnchor="middle"
            fontSize={10}
            fill={point.excluded ? '#94a3b8' : '#475569'}
          >
            {line}
          </text>
        ))}
        <text
          x={cx}
          y={cy + 12 + point.lines.length * 11}
          textAnchor="middle"
          fontSize={10}
          fontWeight={600}
          fill={point.excluded ? '#94a3b8' : '#0f172a'}
        >
          {cmText}
        </text>
      </g>
    );
  }

  // Cumulative price shown ABOVE the full-height Anchor and Final bars.
  function PriceLabel(props: {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    index?: number;
  }) {
    const index = props.index ?? -1;
    const point = waterfall[index];
    if (!point) return null;
    // Lever bars show their step-up in the middle instead (see StepUpLabel).
    if (point.kind === 'lever') return null;
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const width = Number(props.width ?? 0);
    return (
      <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={10} fill="#334155">
        {formatUnitValueWithCurrency(point.price, currencyCode)}
      </text>
    );
  }

  // Step-up amount (Pn − Pn-1) shown in the MIDDLE of each lever block.
  // Zero-uplift levers still get a thin marker + "$0.00" so the slot is visible.
  function StepUpLabel(props: {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    index?: number;
  }) {
    const index = props.index ?? -1;
    const point = waterfall[index];
    if (!point || point.kind !== 'lever') return null;
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const width = Number(props.width ?? 0);
    const height = Number(props.height ?? 0);
    const cx = x + width / 2;
    const stepText = formatUnitValueWithCurrency(point.increment, currencyCode);
    const textFill = point.excluded ? '#94a3b8' : '#0f172a';

    if (point.increment <= 0) {
      const markerColor = point.excluded ? EXCLUDED_BAR_COLOR : point.color;
      return (
        <g>
          <line x1={x} x2={x + width} y1={y} y2={y} stroke={markerColor} strokeWidth={2} />
          <text x={cx} y={y - 4} textAnchor="middle" fontSize={10} fill={textFill}>
            {stepText}
          </text>
        </g>
      );
    }

    return (
      <text
        x={cx}
        y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontWeight={600}
        fill={textFill}
      >
        {stepText}
      </text>
    );
  }

  function WaterfallTooltip(props: {
    active?: boolean;
    payload?: ReadonlyArray<{ payload?: WaterfallPoint }>;
  }) {
    if (!props.active || !props.payload?.length) return null;
    const point = props.payload[0]?.payload;
    if (!point) return null;
    return (
      <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm">
        <div className="font-medium text-slate-900">
          {point.label}
          {point.excluded && ' (excluded)'}
        </div>
        <div className="tabular-nums text-slate-600">
          Price: {formatUnitValueWithCurrency(point.price, currencyCode)}
        </div>
        {point.kind === 'lever' && (
          <div className="tabular-nums text-slate-600">
            Step-up: {formatUnitValueWithCurrency(point.increment, currencyCode)}
          </div>
        )}
        <div className="tabular-nums text-slate-600">
          CM%: {point.cmPercent !== null ? formatMarginPercent(point.cmPercent) : '—'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t border-slate-100 bg-slate-50/80 px-3 py-4 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Part number
        </span>
        <span className="font-medium tabular-nums text-slate-900">{partNumber}</span>
        {secondaryLabel && <span className="text-xs text-slate-500">({secondaryLabel})</span>}
      </div>

      {waterfall.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Unit price waterfall
          </h4>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waterfall} margin={{ top: 22, right: 12, left: 0, bottom: 4 }}>
                <XAxis
                  dataKey="label"
                  interval={0}
                  height={56}
                  tickLine={false}
                  tick={(tickProps) => <AxisTick {...tickProps} />}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  width={56}
                  tickFormatter={(value) =>
                    formatUnitValueWithCurrency(Number(value), currencyCode)
                  }
                />
                <Tooltip content={(tipProps) => <WaterfallTooltip {...tipProps} />} />
                <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
                <Bar dataKey="increment" stackId="wf" maxBarSize={64} isAnimationActive={false}>
                  {waterfall.map((point) => (
                    <Cell key={point.key} fill={point.color} />
                  ))}
                  <LabelList dataKey="increment" content={(labelProps) => <PriceLabel {...labelProps} />} />
                  <LabelList dataKey="increment" content={(labelProps) => <StepUpLabel {...labelProps} />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: ANCHOR_BAR_COLOR }}
              />
              Anchor price
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: EXCLUDED_BAR_COLOR }}
              />
              Excluded lever
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: FINAL_BAR_COLOR }}
              />
              Final price (P₅)
            </span>
            <span>CM% shown beneath each step.</span>
          </div>
        </div>
      )}
    </div>
  );
}
