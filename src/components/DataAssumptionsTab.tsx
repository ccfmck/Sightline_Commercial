import type {
  AppDisplaySettings,
  OpportunitySettings,
  ParseResult,
} from '../types';
import { ExcelUpload } from './ExcelUpload';
import { InputsAssumptionsPanel } from './InputsAssumptionsPanel';
import { PAGE_CHROME_OFFSET } from './tabSections';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface DataAssumptionsTabProps {
  parseResult: ParseResult;
  isLoading: boolean;
  anchorYear: number | null;
  availableAnchorYears: number[];
  opportunitySettings: OpportunitySettings;
  displaySettings: AppDisplaySettings;
  nonUsdCurrencies: string[];
  onFileSelected: (file: File) => void;
  onAnchorYearChange: (year: number) => void;
  onOpportunitySettingsChange: (settings: OpportunitySettings) => void;
  onDisplaySettingsChange: (settings: AppDisplaySettings) => void;
}

export function DataAssumptionsTab({
  parseResult,
  isLoading,
  anchorYear,
  availableAnchorYears,
  opportunitySettings,
  displaySettings,
  nonUsdCurrencies,
  onFileSelected,
  onAnchorYearChange,
  onOpportunitySettingsChange,
  onDisplaySettingsChange,
}: DataAssumptionsTabProps) {
  const currencySummary = parseResult.availableCurrencies.join(', ') || 'USD';

  return (
    <>
      <div id="data-upload" style={{ scrollMarginTop: PAGE_CHROME_OFFSET + 12 }}>
        <ExcelUpload onFileSelected={onFileSelected} isLoading={isLoading} />
      </div>

      <Card id="data-summary" style={{ scrollMarginTop: PAGE_CHROME_OFFSET + 12 }}>
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
          onAnchorYearChange={onAnchorYearChange}
          onOpportunitySettingsChange={onOpportunitySettingsChange}
          onDisplaySettingsChange={onDisplaySettingsChange}
        />
      )}
    </>
  );
}
