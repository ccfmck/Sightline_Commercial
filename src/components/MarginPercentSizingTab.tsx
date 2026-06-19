import type {
  AppDisplaySettings,
  MarginPercentSettings,
  OpportunitySettings,
  ParseResult,
  PortfolioMarginPercentOpportunityResult,
  RowMarginPercentOverride,
  RowMarginPercentOverrides,
} from '../types';
import { buildOpportunityFrames } from '../lib/opportunitySizing';
import { buildMarginPercentBasisOptions } from '../lib/marginPercentSizing';
import { MarginComponentMappingPanel } from './MarginComponentMappingPanel';
import { MarginPercentOpportunityPanel } from './MarginPercentOpportunityPanel';

interface MarginPercentSizingTabProps {
  parseResult: ParseResult;
  opportunitySettings: OpportunitySettings;
  marginPercentSettings: MarginPercentSettings;
  displaySettings: AppDisplaySettings;
  nonUsdCurrencies: string[];
  rowOverrides: RowMarginPercentOverrides;
  portfolioOpportunity: PortfolioMarginPercentOpportunityResult;
  onMarginPercentSettingsChange: (settings: MarginPercentSettings) => void;
  onRowOverrideChange: (recordId: string, override: RowMarginPercentOverride) => void;
}

export function MarginPercentSizingTab({
  parseResult,
  opportunitySettings,
  marginPercentSettings,
  displaySettings,
  nonUsdCurrencies,
  rowOverrides,
  portfolioOpportunity,
  onMarginPercentSettingsChange,
  onRowOverrideChange,
}: MarginPercentSizingTabProps) {
  const basisOptions = buildMarginPercentBasisOptions(
    buildOpportunityFrames(
      portfolioOpportunity.anchorYear,
      parseResult.hasAtQuote,
      parseResult.availableHistoricalYears,
    ),
  );

  return (
    <>
      <MarginComponentMappingPanel
        costComponents={parseResult.costComponents}
        settings={marginPercentSettings}
        onSettingsChange={onMarginPercentSettingsChange}
      />

      <MarginPercentOpportunityPanel
        portfolio={portfolioOpportunity}
        settings={opportunitySettings}
        marginPercentSettings={marginPercentSettings}
        displaySettings={displaySettings}
        nonUsdCurrencies={nonUsdCurrencies}
        basisOptions={basisOptions}
        rowOverrides={rowOverrides}
        onRowOverrideChange={onRowOverrideChange}
      />
    </>
  );
}
