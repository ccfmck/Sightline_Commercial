export type SectionType =
  | 'metadata'
  | 'at_quote'
  | 'year'
  | 'other';

export type MetricType =
  | 'metadata'
  | 'price'
  | 'volume'
  | 'cost'
  | 'skip';

export type PeriodId = 'at_quote' | `${number}`;

export interface ColumnHeader {
  columnIndex: number;
  section: SectionType;
  sectionLabel: string;
  year: number | null;
  metricType: MetricType;
  fieldName: string;
  unit: string | null;
  costComponentKey: string | null;
}

export interface PeriodDefinition {
  id: PeriodId;
  label: string;
  year: number | null;
  sortOrder: number;
  isAnchorYear: boolean;
}

export interface PeriodMetrics {
  avgPrice: number | null;
  volume: number | null;
  costs: Record<string, number | null>;
}

export interface PartProgramRecord {
  id: string;
  metadata: Record<string, string>;
  /** Quote price/volume keyed by quote year (from At Time of Quote section). */
  quoteYears: Partial<Record<number, { avgPrice: number | null; volume: number | null }>>;
  /** Unit costs from the At Time of Quote section (shared across quote years). */
  atQuoteCosts: Record<string, number | null>;
  /** Annual period metrics (historical actuals / estimates). */
  periods: Partial<Record<`${number}`, PeriodMetrics>>;
}

export interface ParseResult {
  sheetName: string;
  warnings: string[];
  headers: ColumnHeader[];
  metadataFields: string[];
  availableQuoteYears: number[];
  availableHistoricalYears: number[];
  hasAtQuote: boolean;
  defaultAnchorYear: number;
  costComponents: string[];
  records: PartProgramRecord[];
  rowCount: number;
  availableCurrencies: string[];
}

export interface AggregatedPeriod {
  periodId: PeriodId;
  label: string;
  year: number | null;
  isAnchorYear: boolean;
  volume: number | null;
  avgPrice: number | null;
  costs: Record<string, number | null>;
  totalCost: number | null;
  ebitMarginPercent: number | null;
}

export interface AggregationResult {
  periods: AggregatedPeriod[];
  selectionLabel: string;
  costComponents: string[];
  anchorYear: number;
}

export const DEFAULT_ANCHOR_YEAR = 2025;

export interface OpportunitySettings {
  targetEbitMarginPercent: number;
  externalFactorPercent: number;
  captureRatePercent: number;
}

export const DEFAULT_OPPORTUNITY_SETTINGS: OpportunitySettings = {
  targetEbitMarginPercent: 12,
  externalFactorPercent: 50,
  captureRatePercent: 50,
};

export type DisplayCurrencyMode = 'USD' | 'source';

export interface AppDisplaySettings {
  displayCurrency: DisplayCurrencyMode;
  fxRatesToUsd: Record<string, number>;
}

export const DEFAULT_DISPLAY_SETTINGS: AppDisplaySettings = {
  displayCurrency: 'USD',
  fxRatesToUsd: {},
};

export type OpportunityBasisId = 'auto' | 'exclude' | OpportunityFrameId | 'bleeder' | 'leaker';

export interface RowOpportunityOverride {
  basis?: OpportunityBasisId;
  excluded?: boolean;
}

export type RowOpportunityOverrides = Record<string, RowOpportunityOverride>;

export type OpportunityFrameId = 'at_quote' | `${number}`;

export type BleederLeakerClassification = 'healthy' | 'bleeder' | 'leaker' | 'no_data';

export type RowOpportunityStatus = 'erosion' | 'bleeder' | 'leaker' | 'healthy' | 'no_data';

export type WinningMethod = 'margin_erosion' | 'bleeder_leaker';

export interface CostIncreaseDetail {
  component: string;
  increase: number;
}

export interface MarginErosionFrameResult {
  frameId: OpportunityFrameId;
  frameLabel: string;
  increasedCostComponents: CostIncreaseDetail[];
  totalCostIncrease: number;
  costIncreasePercent: number;
  referenceTotalCost: number;
  referencePrice: number;
  referenceEbitMarginPercent: number | null;
  anchorPrice: number;
  priceIncreasePercent: number;
  expectedPrice: number;
  unitOpportunity: number;
  targetPriceIncrease: number;
  targetPrice: number;
  dollarOpportunity: number;
  skipped: boolean;
  skipReason?: string;
}

export interface BleederLeakerResult {
  classification: BleederLeakerClassification;
  anchorMarginPercent: number | null;
  targetMarginPercent: number;
  unitOpportunity: number;
  targetPriceIncrease: number;
  targetPrice: number | null;
  dollarOpportunity: number;
}

export interface RowOpportunityResult {
  recordId: string;
  metadata: Record<string, string>;
  currency: string;
  anchorYear: number;
  anchorPrice: number | null;
  anchorVolume: number | null;
  anchorTotalCost: number | null;
  anchorEbitMarginPercent: number | null;
  status: RowOpportunityStatus;
  marginErosionByFrame: MarginErosionFrameResult[];
  bleederLeaker: BleederLeakerResult;
  autoWinningMethod: WinningMethod | null;
  autoWinningFrameId: OpportunityFrameId | null;
  autoWinningFrameLabel: string | null;
  autoFullPotential: number;
  winningMethod: WinningMethod | null;
  winningFrameId: OpportunityFrameId | null;
  winningFrameLabel: string | null;
  selectedBasis: OpportunityBasisId;
  targetPrice: number | null;
  targetPriceIncrease: number | null;
  fullPotential: number;
  commercialRecovery: number;
  excluded: boolean;
}

export interface PortfolioOpportunityResult {
  settings: OpportunitySettings;
  anchorYear: number;
  rows: RowOpportunityResult[];
  totalFullPotential: number;
  totalCommercialRecovery: number;
  rowsWithOpportunity: number;
  compositionByWinner: Record<string, number>;
}

export type MarginLevel = 'material' | 'contribution' | 'ebit';

export type MarginOptimizeFor = MarginLevel;

export interface MarginPercentSettings {
  optimizeFor: MarginOptimizeFor;
  componentLevels: Record<string, MarginLevel>;
}

export type MarginPercentBasisId = 'auto' | 'exclude' | OpportunityFrameId | 'bleeder' | 'leaker';

export interface RowMarginPercentOverride {
  basis?: MarginPercentBasisId;
  excluded?: boolean;
}

export type RowMarginPercentOverrides = Record<string, RowMarginPercentOverride>;

export type MarginPercentWinningMethod = 'margin_percent_gap' | 'bleeder_leaker';

export type RowMarginPercentStatus = 'margin_gap' | 'bleeder' | 'leaker' | 'healthy' | 'no_data';

export interface MarginPercentFrameDetail {
  frameId: OpportunityFrameId;
  frameLabel: string;
  referencePrice: number | null;
  referenceMarginCost: number | null;
  referenceMarginPercent: number | null;
  unitOpportunity: number;
  targetPrice: number;
  dollarOpportunity: number;
  skipped: boolean;
  skipReason?: string;
}

export interface MarginPercentGapResult {
  optimizeFor: MarginOptimizeFor;
  anchorMarginCost: number | null;
  anchorMarginPercent: number | null;
  marginPercentByFrame: MarginPercentFrameDetail[];
  bestReferenceFrameId: OpportunityFrameId | null;
  bestReferenceFrameLabel: string | null;
  bestReferenceMarginPercent: number | null;
  unitOpportunity: number;
  targetPriceIncrease: number;
  targetPrice: number;
  dollarOpportunity: number;
  skipped: boolean;
  skipReason?: string;
}

export interface RowMarginPercentOpportunityResult {
  recordId: string;
  metadata: Record<string, string>;
  currency: string;
  anchorYear: number;
  anchorPrice: number | null;
  anchorVolume: number | null;
  anchorTotalCost: number | null;
  anchorEbitMarginPercent: number | null;
  status: RowMarginPercentStatus;
  marginPercentGap: MarginPercentGapResult;
  bleederLeaker: BleederLeakerResult;
  autoWinningMethod: MarginPercentWinningMethod | null;
  autoWinningFrameLabel: string | null;
  autoFullPotential: number;
  winningMethod: MarginPercentWinningMethod | null;
  winningFrameLabel: string | null;
  selectedBasis: MarginPercentBasisId;
  targetPrice: number | null;
  targetPriceIncrease: number | null;
  fullPotential: number;
  commercialRecovery: number;
  excluded: boolean;
}

export interface PortfolioMarginPercentOpportunityResult {
  settings: OpportunitySettings;
  marginPercentSettings: MarginPercentSettings;
  anchorYear: number;
  rows: RowMarginPercentOpportunityResult[];
  totalFullPotential: number;
  totalCommercialRecovery: number;
  rowsWithOpportunity: number;
  compositionByWinner: Record<string, number>;
}

