import type { AggregationResult, AppDisplaySettings, RowOpportunityResult } from '../types';
import { convertToDisplayCurrency, getDisplayCurrencyCode } from '../lib/currency';
import { formatCurrency, formatMarginPercent, formatUnitValueWithCurrency } from '../lib/format';
import { anchorYearLabel } from '../lib/opportunitySizing';
import { MarginPerformanceChart } from './MarginPerformanceChart';

interface OpportunityDetailDrawerProps {
  row: RowOpportunityResult;
  settings: {
    externalFactorPercent: number;
    captureRatePercent: number;
  };
  displaySettings: AppDisplaySettings;
  recordAggregation: AggregationResult | null;
}

function formatMoney(
  amount: number | null | undefined,
  row: RowOpportunityResult,
  displaySettings: AppDisplaySettings,
) {
  if (amount === null || amount === undefined) return '—';
  const converted = convertToDisplayCurrency(amount, row.currency, displaySettings);
  const code = getDisplayCurrencyCode(row.currency, displaySettings);
  return formatCurrency(converted, code);
}

function formatUnitMoney(
  amount: number | null | undefined,
  row: RowOpportunityResult,
  displaySettings: AppDisplaySettings,
) {
  if (amount === null || amount === undefined) return '—';
  const converted = convertToDisplayCurrency(amount, row.currency, displaySettings);
  const code = getDisplayCurrencyCode(row.currency, displaySettings);
  return formatUnitValueWithCurrency(converted, code);
}

export function OpportunityDetailDrawer({
  row,
  settings,
  displaySettings,
  recordAggregation,
}: OpportunityDetailDrawerProps) {
  const effectivePct = (settings.externalFactorPercent * settings.captureRatePercent) / 100;
  const anchorLabel = anchorYearLabel(row.anchorYear);

  return (
    <div className="space-y-4 border-t border-slate-100 bg-slate-50/80 px-3 py-4 text-sm">
      {recordAggregation && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Price, cost, and margin evolution
          </h4>
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <MarginPerformanceChart
              aggregation={recordAggregation}
              height={320}
              displaySettings={displaySettings}
              sourceCurrency={row.currency}
            />
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Bleeder / leaker
          </h4>
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Classification</dt>
              <dd className="capitalize">{row.bleederLeaker.classification.replace('_', ' ')}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{anchorLabel} EBIT %</dt>
              <dd>{formatMarginPercent(row.bleederLeaker.anchorMarginPercent)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Target margin</dt>
              <dd>{formatMarginPercent(row.bleederLeaker.targetMarginPercent)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Target price increase</dt>
              <dd>{formatUnitMoney(row.bleederLeaker.targetPriceIncrease, row, displaySettings)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Target price</dt>
              <dd>{formatUnitMoney(row.bleederLeaker.targetPrice, row, displaySettings)}</dd>
            </div>
            <div className="flex justify-between gap-4 font-medium">
              <dt className="text-slate-500">Full potential</dt>
              <dd>{formatMoney(row.bleederLeaker.dollarOpportunity, row, displaySettings)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Final sizing
          </h4>
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Full potential</dt>
              <dd className="font-medium">{formatMoney(row.fullPotential, row, displaySettings)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">
                Haircuts ({settings.externalFactorPercent}% × {settings.captureRatePercent}%)
              </dt>
              <dd>{formatPercentInput(effectivePct)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-slate-100 pt-1 font-medium">
              <dt className="text-slate-700">Recovery target</dt>
              <dd>{formatMoney(row.commercialRecovery, row, displaySettings)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

function formatPercentInput(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}
