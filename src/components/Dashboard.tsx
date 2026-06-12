import { useEffect, useMemo, useState } from 'react';
import type {
  AppDisplaySettings,
  OpportunitySettings,
  ParseResult,
  RowOpportunityOverride,
  RowOpportunityOverrides,
} from '../types';
import { DEFAULT_DISPLAY_SETTINGS, DEFAULT_OPPORTUNITY_SETTINGS } from '../types';
import { aggregateRecords } from '../lib/aggregate';
import { normalizeCurrencyCode } from '../lib/currency';
import { buildBasisOptions, buildOpportunityFrames, sizePortfolioOpportunity } from '../lib/opportunitySizing';
import { buildPeriods, getAvailableAnchorYears } from '../lib/periods';
import { AppBanner } from './AppBanner';
import { ExcelUpload } from './ExcelUpload';
import { FilterBar } from './FilterBar';
import { InputsAssumptionsPanel } from './InputsAssumptionsPanel';
import { MarginChart } from './MarginChart';
import { OpportunityPanel } from './OpportunityPanel';
import { SectionNav } from './SectionNav';
import { VolumeTable } from './VolumeTable';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface DashboardProps {
  parseResult: ParseResult | null;
  isLoading: boolean;
  onFileSelected: (file: File) => void;
}

export function Dashboard({ parseResult, isLoading, onFileSelected }: DashboardProps) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorYear, setAnchorYear] = useState<number | null>(null);
  const [opportunitySettings, setOpportunitySettings] = useState<OpportunitySettings>(
    DEFAULT_OPPORTUNITY_SETTINGS,
  );
  const [displaySettings, setDisplaySettings] = useState<AppDisplaySettings>(
    DEFAULT_DISPLAY_SETTINGS,
  );
  const [rowOverrides, setRowOverrides] = useState<RowOpportunityOverrides>({});

  const availableAnchorYears = useMemo(
    () => (parseResult ? getAvailableAnchorYears(parseResult) : []),
    [parseResult],
  );

  const nonUsdCurrencies = useMemo(
    () => (parseResult?.availableCurrencies ?? []).filter((c) => c !== 'USD'),
    [parseResult],
  );

  useEffect(() => {
    if (parseResult) {
      setAnchorYear(parseResult.defaultAnchorYear);
      setFilters({});
      setSelectedIds(new Set());
      setRowOverrides({});
      setDisplaySettings((prev) => {
        const fxRatesToUsd: Record<string, number> = { ...prev.fxRatesToUsd };
        for (const currency of parseResult.availableCurrencies) {
          if (currency !== 'USD' && fxRatesToUsd[currency] === undefined) {
            fxRatesToUsd[currency] = 0;
          }
        }
        return { ...prev, fxRatesToUsd };
      });
    }
  }, [parseResult]);

  const periods = useMemo(() => {
    if (!parseResult || anchorYear === null) return [];
    return buildPeriods(anchorYear, parseResult.hasAtQuote, parseResult.availableHistoricalYears);
  }, [parseResult, anchorYear]);

  const basisOptions = useMemo(() => {
    if (!parseResult || anchorYear === null) return [];
    const frames = buildOpportunityFrames(
      anchorYear,
      parseResult.hasAtQuote,
      parseResult.availableHistoricalYears,
    );
    return buildBasisOptions(frames);
  }, [parseResult, anchorYear]);

  const filteredRecords = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.records.filter((record) =>
      Object.entries(filters).every(([key, value]) => {
        if (!value || value === '__all__') return true;
        return (record.metadata[key] ?? '') === value;
      }),
    );
  }, [parseResult, filters]);

  const selectedRecords = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.records.filter((r) => selectedIds.has(r.id));
  }, [parseResult, selectedIds, selectedIds.size]);

  const aggregation = useMemo(() => {
    if (!parseResult || !selectedRecords.length || anchorYear === null) return null;
    return aggregateRecords(
      selectedRecords,
      periods,
      parseResult.costComponents,
      anchorYear,
    );
  }, [parseResult, selectedRecords, periods, anchorYear]);

  const chartSourceCurrency = useMemo(() => {
    if (!selectedRecords.length) return undefined;
    const currencies = new Set(
      selectedRecords.map((record) => normalizeCurrencyCode(record.metadata.Currency)),
    );
    return currencies.size === 1 ? [...currencies][0] : undefined;
  }, [selectedRecords]);

  const portfolioOpportunity = useMemo(() => {
    if (!parseResult || anchorYear === null) return null;
    return sizePortfolioOpportunity(
      parseResult.records,
      anchorYear,
      parseResult.hasAtQuote,
      parseResult.availableHistoricalYears,
      opportunitySettings,
      rowOverrides,
    );
  }, [parseResult, anchorYear, opportunitySettings, rowOverrides]);

  function handleRowOverrideChange(recordId: string, override: RowOpportunityOverride) {
    setRowOverrides((prev) => ({
      ...prev,
      [recordId]: {
        ...prev[recordId],
        ...override,
      },
    }));
  }

  if (!parseResult) {
    return (
      <>
        <AppBanner />
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          <ExcelUpload onFileSelected={onFileSelected} isLoading={isLoading} />
        </div>
      </>
    );
  }

  const currencySummary = parseResult.availableCurrencies.join(', ') || 'USD';

  return (
    <>
      <AppBanner />
      <SectionNav />

      <div className="w-full space-y-6 px-3 py-6 sm:px-4 lg:pl-56 lg:pr-6 xl:pl-60 xl:pr-8">
        <Card id="data-summary">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Data summary</CardTitle>
            <CardDescription>Workbook metadata detected from the uploaded file.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Sheet: {parseResult.sheetName}</Badge>
              <Badge variant="secondary">{parseResult.rowCount} parts</Badge>
              <Badge variant="outline">Currencies: {currencySummary}</Badge>
              {parseResult.warnings.map((warning) => (
                <Badge key={warning} variant="accent" className="max-w-full whitespace-normal">
                  {warning}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {anchorYear !== null && (
          <InputsAssumptionsPanel
            anchorYear={anchorYear}
            availableAnchorYears={availableAnchorYears}
            quoteYears={parseResult.availableQuoteYears}
            opportunitySettings={opportunitySettings}
            displaySettings={displaySettings}
            nonUsdCurrencies={nonUsdCurrencies}
            onAnchorYearChange={setAnchorYear}
            onOpportunitySettingsChange={setOpportunitySettings}
            onDisplaySettingsChange={setDisplaySettings}
          />
        )}

        {portfolioOpportunity && anchorYear !== null && (
          <OpportunityPanel
            portfolio={portfolioOpportunity}
            settings={opportunitySettings}
            displaySettings={displaySettings}
            nonUsdCurrencies={nonUsdCurrencies}
            basisOptions={basisOptions}
            rowOverrides={rowOverrides}
            records={parseResult.records}
            periods={periods}
            costComponents={parseResult.costComponents}
            onRowOverrideChange={handleRowOverrideChange}
            highlightedRecordIds={selectedIds}
          />
        )}

        <Card id="price-cost-evolution">
          <CardHeader>
            <CardTitle className="text-base">Price, Cost, and Margin evolution</CardTitle>
            <CardDescription>
              Filter and select parts to compare price, cost, and margin performance over time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FilterBar
              embedded
              records={parseResult.records}
              filters={filters}
              selectedIds={selectedIds}
              onFilterChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
              onToggleRow={(id) => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
              onSelectAllFiltered={() => setSelectedIds(new Set(filteredRecords.map((r) => r.id)))}
              onClearSelection={() => setSelectedIds(new Set())}
            />

            {!selectedRecords.length ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Select one or more programs/parts above to view margin and cost performance.
              </div>
            ) : aggregation ? (
              <>
                <MarginChart
                  aggregation={aggregation}
                  displaySettings={displaySettings}
                  sourceCurrency={chartSourceCurrency}
                />
                <VolumeTable aggregation={aggregation} embedded />
              </>
            ) : null}
          </CardContent>
        </Card>

        <div className="text-center">
          <button
            type="button"
            className="text-sm text-slate-500 underline hover:text-slate-700"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.xlsx,.xls';
              input.onchange = () => {
                const file = input.files?.[0];
                if (file) onFileSelected(file);
              };
              input.click();
            }}
          >
            Upload a different workbook
          </button>
        </div>
      </div>
    </>
  );
}
