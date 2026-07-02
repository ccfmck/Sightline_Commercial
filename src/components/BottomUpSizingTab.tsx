import { useMemo } from 'react';
import type {
  AppDisplaySettings,
  BottomUpLeverSettingsBundle,
  BottomUpParseResult,
  BottomUpWizardStep,
  CostComponentMapping,
  OpportunitySettings,
  ParseResult,
  PortfolioBottomUpOpportunityResult,
} from '../types';
import { BottomUpDataUploadPanel } from './BottomUpDataUploadPanel';
import { BottomUpLever1Panel } from './BottomUpLever1Panel';
import { BottomUpLever2Panel } from './BottomUpLever2Panel';
import { BottomUpLever3Panel } from './BottomUpLever3Panel';
import { BottomUpLever4Panel } from './BottomUpLever4Panel';
import { BottomUpLever5Panel } from './BottomUpLever5Panel';
import { BottomUpOpportunityPanel } from './BottomUpOpportunityPanel';
import { InputsAssumptionsPanel } from './InputsAssumptionsPanel';
import { PAGE_CHROME_OFFSET } from './tabSections';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface BottomUpSizingTabProps {
  parseResult: ParseResult;
  bottomUpData: BottomUpParseResult | null;
  beginningYear: number;
  anchorYear: number;
  availableYears: number[];
  costMapping: CostComponentMapping;
  leverSettings: BottomUpLeverSettingsBundle;
  wizardStep: BottomUpWizardStep;
  completedThrough: number;
  portfolio: PortfolioBottomUpOpportunityResult | null;
  opportunitySettings: OpportunitySettings;
  displaySettings: AppDisplaySettings;
  nonUsdCurrencies: string[];
  onDataLoaded: (result: BottomUpParseResult) => void;
  onBeginningYearChange: (year: number) => void;
  onAnchorYearChange: (year: number) => void;
  onCostMappingChange: (mapping: CostComponentMapping) => void;
  onLeverSettingsChange: (
    updater: (prev: BottomUpLeverSettingsBundle) => BottomUpLeverSettingsBundle,
    changedLever: 1 | 2 | 3 | 4 | 5,
  ) => void;
  onWizardStepChange: (step: BottomUpWizardStep) => void;
  onCalculateLever: (lever: 1 | 2 | 3 | 4 | 5) => void;
  onOpportunitySettingsChange: (settings: OpportunitySettings) => void;
  onDisplaySettingsChange: (settings: AppDisplaySettings) => void;
}

function DataStep({
  parseResult,
  bottomUpData,
  beginningYear,
  anchorYear,
  availableYears,
  costMapping,
  opportunitySettings,
  displaySettings,
  nonUsdCurrencies,
  onDataLoaded,
  onBeginningYearChange,
  onAnchorYearChange,
  onCostMappingChange,
  onOpportunitySettingsChange,
  onDisplaySettingsChange,
}: Pick<
  BottomUpSizingTabProps,
  | 'parseResult'
  | 'bottomUpData'
  | 'beginningYear'
  | 'anchorYear'
  | 'availableYears'
  | 'costMapping'
  | 'opportunitySettings'
  | 'displaySettings'
  | 'nonUsdCurrencies'
  | 'onDataLoaded'
  | 'onBeginningYearChange'
  | 'onAnchorYearChange'
  | 'onCostMappingChange'
  | 'onOpportunitySettingsChange'
  | 'onDisplaySettingsChange'
>) {
  // The bottom-up tab converts currency only when the loaded data actually
  // contains a non-USD currency. When it's all USD (or has no currency column),
  // the display-currency picker and FX inputs are irrelevant and hidden.
  const hideCurrency = nonUsdCurrencies.length === 0;
  return (
    <>
      <BottomUpDataUploadPanel
        parseResult={parseResult}
        bottomUpData={bottomUpData}
        beginningYear={beginningYear}
        anchorYear={anchorYear}
        costMapping={costMapping}
        onDataLoaded={onDataLoaded}
        onBeginningYearChange={onBeginningYearChange}
        onAnchorYearChange={onAnchorYearChange}
        onCostMappingChange={onCostMappingChange}
      />

      <InputsAssumptionsPanel
        anchorYear={anchorYear}
        availableAnchorYears={availableYears}
        beginningYear={beginningYear}
        availableBeginningYears={availableYears}
        quoteYears={parseResult.availableQuoteYears}
        opportunitySettings={opportunitySettings}
        displaySettings={displaySettings}
        nonUsdCurrencies={nonUsdCurrencies}
        onAnchorYearChange={onAnchorYearChange}
        onBeginningYearChange={onBeginningYearChange}
        onOpportunitySettingsChange={onOpportunitySettingsChange}
        onDisplaySettingsChange={onDisplaySettingsChange}
        hideAnchorYear
        hideTargetEbit
        hideCurrency={hideCurrency}
        hideQuoteNote
      />
    </>
  );
}

export function BottomUpSizingTab(props: BottomUpSizingTabProps) {
  const {
    bottomUpData,
    beginningYear,
    anchorYear,
    leverSettings,
    completedThrough,
    portfolio,
    opportunitySettings,
    displaySettings,
    onLeverSettingsChange,
    onCalculateLever,
  } = props;

  const hasData = bottomUpData !== null && bottomUpData.records.length > 0;

  // Derive the non-USD currency set from the loaded bottom-up data itself (not the
  // main workbook), preferring the parser's availableCurrencies list and falling
  // back to the per-record currency. This drives whether currency UI is shown.
  const nonUsdCurrencies = useMemo(() => {
    if (!bottomUpData) return [];
    const currencies = bottomUpData.availableCurrencies.length
      ? bottomUpData.availableCurrencies
      : [...new Set(bottomUpData.records.map((r) => r.currency))];
    return currencies.filter((c) => c && c !== 'USD');
  }, [bottomUpData]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bottom-up sizing workflow</CardTitle>
          <CardDescription>
            Load data, then configure and calculate each lever below. All sections live on one page —
            use the “Jump to” bar at the top to move between them. Toggle a lever off to exclude it
            (it passes price and contribution margin through unchanged and contributes $0). Editing or
            excluding a lever only invalidates that lever and the ones downstream.
          </CardDescription>
        </CardHeader>
      </Card>

      <DataStep {...props} nonUsdCurrencies={nonUsdCurrencies} />

      {hasData && bottomUpData && (
        <>
          <BottomUpLever1Panel
            records={bottomUpData.records}
            metadataFields={bottomUpData.metadataFields}
            settings={leverSettings.lever1}
            beginningYear={beginningYear}
            anchorYear={anchorYear}
            displaySettings={displaySettings}
            preview={portfolio}
            calculated={completedThrough >= 1}
            onSettingsChange={(lever1) =>
              onLeverSettingsChange((prev) => ({ ...prev, lever1 }), 1)
            }
            onCalculate={() => onCalculateLever(1)}
          />

          <BottomUpLever2Panel
            records={bottomUpData.records}
            metadataFields={bottomUpData.metadataFields}
            settings={leverSettings.lever2}
            anchorYear={anchorYear}
            displaySettings={displaySettings}
            preview={portfolio}
            calculated={completedThrough >= 2}
            onSettingsChange={(lever2) =>
              onLeverSettingsChange((prev) => ({ ...prev, lever2 }), 2)
            }
            onCalculate={() => onCalculateLever(2)}
          />

          <BottomUpLever3Panel
            metadataFields={bottomUpData.metadataFields}
            settings={leverSettings.lever3}
            displaySettings={displaySettings}
            preview={portfolio}
            calculated={completedThrough >= 3}
            onSettingsChange={(lever3) =>
              onLeverSettingsChange((prev) => ({ ...prev, lever3 }), 3)
            }
            onCalculate={() => onCalculateLever(3)}
          />

          <BottomUpLever4Panel
            records={bottomUpData.records}
            metadataFields={bottomUpData.metadataFields}
            settings={leverSettings.lever4}
            anchorYear={anchorYear}
            displaySettings={displaySettings}
            preview={portfolio}
            calculated={completedThrough >= 4}
            onSettingsChange={(lever4) =>
              onLeverSettingsChange((prev) => ({ ...prev, lever4 }), 4)
            }
            onCalculate={() => onCalculateLever(4)}
          />

          <BottomUpLever5Panel
            records={bottomUpData.records}
            metadataFields={bottomUpData.metadataFields}
            settings={leverSettings.lever5}
            displaySettings={displaySettings}
            preview={portfolio}
            calculated={completedThrough >= 5}
            onSettingsChange={(lever5) =>
              onLeverSettingsChange((prev) => ({ ...prev, lever5 }), 5)
            }
            onCalculate={() => onCalculateLever(5)}
          />
        </>
      )}

      {portfolio && completedThrough >= 5 ? (
        <BottomUpOpportunityPanel
          portfolio={portfolio}
          settings={opportunitySettings}
          displaySettings={displaySettings}
          nonUsdCurrencies={nonUsdCurrencies}
        />
      ) : (
        <Card id="bottom-up-summary" style={{ scrollMarginTop: PAGE_CHROME_OFFSET + 12 }}>
          <CardContent className="py-8 text-center text-sm text-slate-600">
            {hasData
              ? 'Calculate all five levers to view the portfolio summary.'
              : 'Load bottom-up data to begin sizing.'}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
