import { useEffect, useMemo, useState } from 'react';
import type {
  AppDisplaySettings,
  BottomUpLeverSettingsBundle,
  BottomUpParseResult,
  BottomUpWizardStep,
  CostComponentMapping,
  MarginPercentSettings,
  OpportunitySettings,
  ParseResult,
  PortfolioBottomUpOpportunityResult,
  RowMarginPercentOverride,
  RowMarginPercentOverrides,
  RowOpportunityOverride,
  RowOpportunityOverrides,
} from '../types';
import { DEFAULT_DISPLAY_SETTINGS, DEFAULT_OPPORTUNITY_SETTINGS } from '../types';
import { aggregateRecords } from '../lib/aggregate';
import { buildDefaultCostMapping } from '../lib/adaptExistingToBottomUp';
import {
  buildDefaultLeverSettings,
  completedThroughAfterLeverSettingsChange,
  sizePortfolioBottomUpOpportunity,
} from '../lib/bottomUpSizing';
import { normalizeCurrencyCode } from '../lib/currency';
import { buildDefaultMarginPercentSettings } from '../lib/marginComponentDefaults';
import { sizePortfolioMarginPercentOpportunity } from '../lib/marginPercentSizing';
import { buildBasisOptions, buildOpportunityFrames, sizePortfolioOpportunity } from '../lib/opportunitySizing';
import { buildPeriods, getAvailableAnchorYears } from '../lib/periods';
import { AppBanner } from './AppBanner';
import { AppTabNav, type AppTabId } from './AppTabNav';
import { BottomUpSizingTab } from './BottomUpSizingTab';
import { CostLevelSizingTab } from './CostLevelSizingTab';
import { DataAssumptionsTab } from './DataAssumptionsTab';
import { ExcelUpload } from './ExcelUpload';
import { MarginPercentSizingTab } from './MarginPercentSizingTab';
import { TabSectionNav } from './TabSectionNav';
import { getTabSections, PAGE_CHROME_OFFSET } from './tabSections';

interface DashboardProps {
  parseResult: ParseResult | null;
  isLoading: boolean;
  onFileSelected: (file: File) => void;
}

export function Dashboard({ parseResult, isLoading, onFileSelected }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<AppTabId>('data');
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
  const [rowOverridesMarginPercent, setRowOverridesMarginPercent] =
    useState<RowMarginPercentOverrides>({});
  const [marginPercentSettings, setMarginPercentSettings] = useState<MarginPercentSettings | null>(
    null,
  );

  const [bottomUpData, setBottomUpData] = useState<BottomUpParseResult | null>(null);
  const [beginningYear, setBeginningYear] = useState<number>(2020);
  const [bottomUpWizardStep, setBottomUpWizardStep] = useState<BottomUpWizardStep>('data');
  const [completedThrough, setCompletedThrough] = useState(0);
  const [leverSettings, setLeverSettings] = useState<BottomUpLeverSettingsBundle | null>(null);
  const [costMapping, setCostMapping] = useState<CostComponentMapping>({
    material: [],
    labor: [],
    burden: [],
  });
  const [bottomUpPortfolio, setBottomUpPortfolio] =
    useState<PortfolioBottomUpOpportunityResult | null>(null);

  const availableAnchorYears = useMemo(
    () => (parseResult ? getAvailableAnchorYears(parseResult) : []),
    [parseResult],
  );

  const bottomUpAvailableYears = useMemo(() => {
    if (!parseResult) return [];
    return [
      ...new Set([
        ...parseResult.availableQuoteYears,
        ...parseResult.availableHistoricalYears,
      ]),
    ].sort((a, b) => a - b);
  }, [parseResult]);

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
      setRowOverridesMarginPercent({});
      setMarginPercentSettings(buildDefaultMarginPercentSettings(parseResult.costComponents));
      setCostMapping(buildDefaultCostMapping(parseResult));
      setBottomUpData(null);
      setBeginningYear(
        parseResult.availableHistoricalYears.filter((y) => y < parseResult.defaultAnchorYear)[0] ??
          parseResult.defaultAnchorYear - 1,
      );
      setBottomUpWizardStep('data');
      setCompletedThrough(0);
      setLeverSettings(
        buildDefaultLeverSettings(
          parseResult.metadataFields.length ? parseResult.metadataFields : ['Product Group'],
        ),
      );
      setBottomUpPortfolio(null);
      setActiveTab('data');
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

  const portfolioMarginPercent = useMemo(() => {
    if (!parseResult || anchorYear === null || marginPercentSettings === null) return null;
    return sizePortfolioMarginPercentOpportunity(
      parseResult.records,
      anchorYear,
      parseResult.hasAtQuote,
      parseResult.availableHistoricalYears,
      opportunitySettings,
      marginPercentSettings,
      rowOverridesMarginPercent,
    );
  }, [
    parseResult,
    anchorYear,
    opportunitySettings,
    marginPercentSettings,
    rowOverridesMarginPercent,
  ]);

  function handleRowOverrideChange(recordId: string, override: RowOpportunityOverride) {
    setRowOverrides((prev) => ({
      ...prev,
      [recordId]: {
        ...prev[recordId],
        ...override,
      },
    }));
  }

  function handleBottomUpDataLoaded(result: BottomUpParseResult) {
    setBottomUpData(result);
    setBeginningYear(result.beginningYear);
    setAnchorYear(result.anchorYear);
    setCompletedThrough(0);
    setBottomUpPortfolio(null);
    setLeverSettings(
      buildDefaultLeverSettings(
        result.metadataFields.length ? result.metadataFields : ['Product Group'],
      ),
    );
    setBottomUpWizardStep('lever1');
  }

  function handleCalculateLever(leverNum: 1 | 2 | 3 | 4 | 5) {
    if (!leverSettings || !bottomUpData || anchorYear === null) return;
    const portfolio = sizePortfolioBottomUpOpportunity(
      bottomUpData.records,
      beginningYear,
      anchorYear,
      leverSettings,
      opportunitySettings,
    );
    setBottomUpPortfolio(portfolio);
    setCompletedThrough(leverNum);
  }

  function handleLeverSettingsChange(
    updater: (prev: BottomUpLeverSettingsBundle) => BottomUpLeverSettingsBundle,
    changedLever: 1 | 2 | 3 | 4 | 5,
  ) {
    setLeverSettings((prev) => {
      if (!prev) return prev;
      return updater(prev);
    });
    setCompletedThrough((prev) => {
      const nextCompleted = completedThroughAfterLeverSettingsChange(prev, changedLever);
      if (nextCompleted === 0) {
        setBottomUpPortfolio(null);
      }
      return nextCompleted;
    });
  }

  function handleRowMarginPercentOverrideChange(
    recordId: string,
    override: RowMarginPercentOverride,
  ) {
    setRowOverridesMarginPercent((prev) => ({
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
        <AppBanner fixed />
        <div className="px-4 pb-8 pt-[4.5rem] sm:px-6 lg:px-8">
          <ExcelUpload onFileSelected={onFileSelected} isLoading={isLoading} />
        </div>
      </>
    );
  }

  const tabSections = getTabSections(activeTab);

  return (
    <>
      <AppBanner activeTab={activeTab} fixed />
      <TabSectionNav sections={tabSections} fixed />
      <AppTabNav activeTab={activeTab} onTabChange={setActiveTab} />

      <div
        className="w-full space-y-6 px-3 pb-6 sm:px-4 lg:pl-56 lg:pr-6 xl:pl-60 xl:pr-8"
        style={{ paddingTop: PAGE_CHROME_OFFSET + 16 }}
      >
        {activeTab === 'data' && anchorYear !== null && marginPercentSettings !== null && (
          <DataAssumptionsTab
            parseResult={parseResult}
            isLoading={isLoading}
            anchorYear={anchorYear}
            availableAnchorYears={availableAnchorYears}
            opportunitySettings={opportunitySettings}
            displaySettings={displaySettings}
            nonUsdCurrencies={nonUsdCurrencies}
            onFileSelected={onFileSelected}
            onAnchorYearChange={setAnchorYear}
            onOpportunitySettingsChange={setOpportunitySettings}
            onDisplaySettingsChange={setDisplaySettings}
          />
        )}

        {activeTab === 'cost-level' &&
          portfolioOpportunity &&
          anchorYear !== null && (
            <CostLevelSizingTab
              parseResult={parseResult}
              opportunitySettings={opportunitySettings}
              displaySettings={displaySettings}
              nonUsdCurrencies={nonUsdCurrencies}
              basisOptions={basisOptions}
              rowOverrides={rowOverrides}
              portfolioOpportunity={portfolioOpportunity}
              periods={periods}
              filters={filters}
              selectedIds={selectedIds}
              selectedRecords={selectedRecords}
              aggregation={aggregation}
              chartSourceCurrency={chartSourceCurrency}
              onRowOverrideChange={handleRowOverrideChange}
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
          )}

        {activeTab === 'margin-percent' &&
          portfolioMarginPercent &&
          marginPercentSettings &&
          anchorYear !== null && (
            <MarginPercentSizingTab
              parseResult={parseResult}
              opportunitySettings={opportunitySettings}
              marginPercentSettings={marginPercentSettings}
              displaySettings={displaySettings}
              nonUsdCurrencies={nonUsdCurrencies}
              rowOverrides={rowOverridesMarginPercent}
              portfolioOpportunity={portfolioMarginPercent}
              onMarginPercentSettingsChange={setMarginPercentSettings}
              onRowOverrideChange={handleRowMarginPercentOverrideChange}
            />
          )}

        {activeTab === 'bottom-up' && anchorYear !== null && leverSettings && (
          <BottomUpSizingTab
            parseResult={parseResult}
            bottomUpData={bottomUpData}
            beginningYear={beginningYear}
            anchorYear={anchorYear}
            availableYears={bottomUpAvailableYears}
            costMapping={costMapping}
            leverSettings={leverSettings}
            wizardStep={bottomUpWizardStep}
            completedThrough={completedThrough}
            portfolio={bottomUpPortfolio}
            opportunitySettings={opportunitySettings}
            displaySettings={displaySettings}
            nonUsdCurrencies={nonUsdCurrencies}
            onDataLoaded={handleBottomUpDataLoaded}
            onBeginningYearChange={setBeginningYear}
            onAnchorYearChange={setAnchorYear}
            onCostMappingChange={setCostMapping}
            onLeverSettingsChange={handleLeverSettingsChange}
            onWizardStepChange={setBottomUpWizardStep}
            onCalculateLever={handleCalculateLever}
            onOpportunitySettingsChange={setOpportunitySettings}
            onDisplaySettingsChange={setDisplaySettings}
          />
        )}
      </div>
    </>
  );
}
