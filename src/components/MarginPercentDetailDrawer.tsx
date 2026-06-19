import type { ReactNode } from 'react';
import type { AppDisplaySettings, RowMarginPercentOpportunityResult } from '../types';
import { convertToDisplayCurrency, getDisplayCurrencyCode } from '../lib/currency';
import { formatCurrency, formatMarginPercent, formatUnitValueWithCurrency } from '../lib/format';
import { anchorYearLabel } from '../lib/opportunitySizing';
import { optimizeForLabel } from '../lib/marginComponentDefaults';
import { MarginPercentByFrameChart } from './MarginPercentByFrameChart';

interface MarginPercentDetailDrawerProps {
  row: RowMarginPercentOpportunityResult;
  settings: {
    externalFactorPercent: number;
    captureRatePercent: number;
  };
  displaySettings: AppDisplaySettings;
}

function formatMoney(
  amount: number | null | undefined,
  row: RowMarginPercentOpportunityResult,
  displaySettings: AppDisplaySettings,
) {
  if (amount === null || amount === undefined) return '—';
  const converted = convertToDisplayCurrency(amount, row.currency, displaySettings);
  const code = getDisplayCurrencyCode(row.currency, displaySettings);
  return formatCurrency(converted, code);
}

function formatUnitMoney(
  amount: number | null | undefined,
  row: RowMarginPercentOpportunityResult,
  displaySettings: AppDisplaySettings,
) {
  if (amount === null || amount === undefined) return '—';
  const converted = convertToDisplayCurrency(amount, row.currency, displaySettings);
  const code = getDisplayCurrencyCode(row.currency, displaySettings);
  return formatUnitValueWithCurrency(converted, code);
}

function formatPercentInput(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-40 shrink-0 text-slate-500">{label}</dt>
      <dd className="font-medium tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}

export function MarginPercentDetailDrawer({
  row,
  settings,
  displaySettings,
}: MarginPercentDetailDrawerProps) {
  const effectivePct = (settings.externalFactorPercent * settings.captureRatePercent) / 100;
  const anchorLabel = anchorYearLabel(row.anchorYear);
  const gap = row.marginPercentGap;
  const selectedFrame =
    row.selectedBasis !== 'auto' &&
    row.selectedBasis !== 'exclude' &&
    row.selectedBasis !== 'bleeder' &&
    row.selectedBasis !== 'leaker'
      ? gap.marginPercentByFrame.find((f) => f.frameId === row.selectedBasis)
      : null;
  const sizingFrameLabel =
    selectedFrame?.frameLabel ?? gap.bestReferenceFrameLabel ?? '—';
  const sizingMarginPercent =
    selectedFrame?.referenceMarginPercent ?? gap.bestReferenceMarginPercent;

  return (
    <div className="space-y-4 border-t border-slate-100 bg-slate-50/80 px-3 py-4 text-sm">
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Margin % by frame — {optimizeForLabel(gap.optimizeFor)}
        </h4>
        <MarginPercentByFrameChart row={row} />
        <dl className="mt-4 grid max-w-2xl gap-2 text-xs sm:grid-cols-2">
          <DetailRow
            label={`${anchorLabel} margin %`}
            value={formatMarginPercent(gap.anchorMarginPercent)}
          />
          <DetailRow label="Sizing reference frame" value={sizingFrameLabel} />
          <DetailRow label="Target margin %" value={formatMarginPercent(sizingMarginPercent)} />
          <DetailRow
            label="Target price increase"
            value={formatUnitMoney(row.targetPriceIncrease, row, displaySettings)}
          />
        </dl>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Bleeder / leaker (EBIT)
          </h4>
          <dl className="space-y-2 text-xs">
            <DetailRow
              label="Classification"
              value={<span className="capitalize">{row.bleederLeaker.classification.replace('_', ' ')}</span>}
            />
            <DetailRow
              label={`${anchorLabel} EBIT %`}
              value={formatMarginPercent(row.bleederLeaker.anchorMarginPercent)}
            />
            <DetailRow
              label="Target margin"
              value={formatMarginPercent(row.bleederLeaker.targetMarginPercent)}
            />
            <DetailRow
              label="Target price increase"
              value={formatUnitMoney(row.bleederLeaker.targetPriceIncrease, row, displaySettings)}
            />
            <DetailRow
              label="Full potential"
              value={formatMoney(row.bleederLeaker.dollarOpportunity, row, displaySettings)}
            />
          </dl>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Final sizing
          </h4>
          <dl className="space-y-2 text-xs">
            <DetailRow
              label="Full potential"
              value={formatMoney(row.fullPotential, row, displaySettings)}
            />
            <DetailRow
              label={`Haircuts (${settings.externalFactorPercent}% × ${settings.captureRatePercent}%)`}
              value={formatPercentInput(effectivePct)}
            />
            <div className="border-t border-slate-100 pt-2">
              <DetailRow
                label="Recovery target"
                value={formatMoney(row.commercialRecovery, row, displaySettings)}
              />
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
