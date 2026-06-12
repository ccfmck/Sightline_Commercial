import type { AppDisplaySettings, OpportunitySettings } from '../types';
import { anchorYearLabel } from '../lib/opportunitySizing';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValueLeft,
} from './ui/select';

interface InputsAssumptionsPanelProps {
  anchorYear: number;
  availableAnchorYears: number[];
  quoteYears: number[];
  opportunitySettings: OpportunitySettings;
  displaySettings: AppDisplaySettings;
  nonUsdCurrencies: string[];
  onAnchorYearChange: (year: number) => void;
  onOpportunitySettingsChange: (settings: OpportunitySettings) => void;
  onDisplaySettingsChange: (settings: AppDisplaySettings) => void;
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function InputsAssumptionsPanel({
  anchorYear,
  availableAnchorYears,
  quoteYears,
  opportunitySettings,
  displaySettings,
  nonUsdCurrencies,
  onAnchorYearChange,
  onOpportunitySettingsChange,
  onDisplaySettingsChange,
}: InputsAssumptionsPanelProps) {
  function updateSetting<K extends keyof OpportunitySettings>(key: K, raw: string) {
    onOpportunitySettingsChange({
      ...opportunitySettings,
      [key]: clampPercent(Number(raw)),
    });
  }

  function updateFxRate(currency: string, raw: string) {
    const rate = Number(raw);
    onDisplaySettingsChange({
      ...displaySettings,
      fxRatesToUsd: {
        ...displaySettings.fxRatesToUsd,
        [currency]: Number.isFinite(rate) && rate > 0 ? rate : 0,
      },
    });
  }

  return (
    <Card id="inputs-assumptions">
      <CardHeader>
        <CardTitle className="text-base">Additional Input and Assumptions</CardTitle>
        <CardDescription>
          Anchor year, margin targets, recovery haircuts, and currency conversion settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1.5">
            <Label htmlFor="anchor-year">Anchor year</Label>
            <Select
              value={String(anchorYear)}
              onValueChange={(value) => onAnchorYearChange(Number(value))}
            >
              <SelectTrigger id="anchor-year">
                <SelectValueLeft placeholder="Select anchor year" />
              </SelectTrigger>
              <SelectContent>
                {availableAnchorYears.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                    {quoteYears.includes(year) ? ' (quote available)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="target-margin">Target EBIT margin %</Label>
            <input
              id="target-margin"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={opportunitySettings.targetEbitMarginPercent}
              onChange={(e) => updateSetting('targetEbitMarginPercent', e.target.value)}
              className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="external-factor">External factor %</Label>
            <input
              id="external-factor"
              type="number"
              min={0}
              max={100}
              step={1}
              value={opportunitySettings.externalFactorPercent}
              onChange={(e) => updateSetting('externalFactorPercent', e.target.value)}
              className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="capture-rate">Capture rate %</Label>
            <input
              id="capture-rate"
              type="number"
              min={0}
              max={100}
              step={1}
              value={opportunitySettings.captureRatePercent}
              onChange={(e) => updateSetting('captureRatePercent', e.target.value)}
              className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="display-currency">Display currency</Label>
            <Select
              value={displaySettings.displayCurrency}
              onValueChange={(value: 'USD' | 'source') =>
                onDisplaySettingsChange({ ...displaySettings, displayCurrency: value })
              }
            >
              <SelectTrigger id="display-currency">
                <SelectValueLeft />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">US Dollar (USD)</SelectItem>
                <SelectItem value="source">Source currency (workbook)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {nonUsdCurrencies.length > 0 && displaySettings.displayCurrency === 'USD' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {nonUsdCurrencies.map((currency) => (
              <div key={currency} className="space-y-1.5">
                <Label htmlFor={`fx-${currency}`}>{currency} → USD FX rate</Label>
                <input
                  id={`fx-${currency}`}
                  type="number"
                  min={0}
                  step={0.0001}
                  value={displaySettings.fxRatesToUsd[currency] ?? ''}
                  placeholder="e.g. 0.18"
                  onChange={(e) => updateFxRate(currency, e.target.value)}
                  className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                />
                <p className="text-xs text-slate-500">1 {currency} equals this many USD</p>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-500">
          At Quote uses the {anchorYear} quote price, volume, and at-quote unit costs. Chart tooltips
          compare each period to {anchorYearLabel(anchorYear)}.
        </p>
      </CardContent>
    </Card>
  );
}
