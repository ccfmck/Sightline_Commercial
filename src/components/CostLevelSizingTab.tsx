import type {
  AggregationResult,
  AppDisplaySettings,
  OpportunityBasisId,
  OpportunitySettings,
  ParseResult,
  PartProgramRecord,
  PeriodDefinition,
  PortfolioOpportunityResult,
  RowOpportunityOverride,
  RowOpportunityOverrides,
} from '../types';
import { FilterBar } from './FilterBar';
import { MarginChart } from './MarginChart';
import { OpportunityPanel } from './OpportunityPanel';
import { PAGE_CHROME_OFFSET } from './tabSections';
import { VolumeTable } from './VolumeTable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface CostLevelSizingTabProps {
  parseResult: ParseResult;
  opportunitySettings: OpportunitySettings;
  displaySettings: AppDisplaySettings;
  nonUsdCurrencies: string[];
  basisOptions: { id: OpportunityBasisId; label: string }[];
  rowOverrides: RowOpportunityOverrides;
  portfolioOpportunity: PortfolioOpportunityResult;
  periods: PeriodDefinition[];
  filters: Record<string, string>;
  selectedIds: Set<string>;
  selectedRecords: PartProgramRecord[];
  aggregation: AggregationResult | null;
  chartSourceCurrency: string | undefined;
  onRowOverrideChange: (recordId: string, override: RowOpportunityOverride) => void;
  onFilterChange: (key: string, value: string) => void;
  onToggleRow: (id: string) => void;
  onSelectAllFiltered: () => void;
  onClearSelection: () => void;
}

export function CostLevelSizingTab({
  parseResult,
  opportunitySettings,
  displaySettings,
  nonUsdCurrencies,
  basisOptions,
  rowOverrides,
  portfolioOpportunity,
  periods,
  filters,
  selectedIds,
  selectedRecords,
  aggregation,
  chartSourceCurrency,
  onRowOverrideChange,
  onFilterChange,
  onToggleRow,
  onSelectAllFiltered,
  onClearSelection,
}: CostLevelSizingTabProps) {
  return (
    <>
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
        onRowOverrideChange={onRowOverrideChange}
        highlightedRecordIds={selectedIds}
      />

      <Card id="price-cost-evolution" style={{ scrollMarginTop: PAGE_CHROME_OFFSET + 12 }}>
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
            onFilterChange={onFilterChange}
            onToggleRow={onToggleRow}
            onSelectAllFiltered={onSelectAllFiltered}
            onClearSelection={onClearSelection}
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
    </>
  );
}
