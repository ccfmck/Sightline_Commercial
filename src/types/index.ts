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

// --- Bottom-up multi-lever sizing ---

export interface BottomUpYearMetrics {
  price: number | null;
  materialCost: number | null;
  laborCost: number | null;
  burdenCost: number | null;
  volume: number | null;
  cmPerUnit: number | null;
}

export interface BottomUpRecord {
  id: string;
  metadata: Record<string, string>;
  currency: string;
  beginningYear: number;
  anchorYear: number;
  beginning: BottomUpYearMetrics;
  anchor: BottomUpYearMetrics;
}

export interface BottomUpParseResult {
  sheetName: string;
  warnings: string[];
  metadataFields: string[];
  availableYears: number[];
  beginningYear: number;
  anchorYear: number;
  records: BottomUpRecord[];
  rowCount: number;
  availableCurrencies: string[];
}

export interface InflationRates {
  materialRates: Record<string, number>;
  laborRate: number;
  burdenRate: number;
}

/** Sentinel dropdown value: treat all records as one group. */
export const BOTTOM_UP_ALL_GROUPING_FIELD = '__all__';

/** Display label and group key when all-grouping is active. */
export const BOTTOM_UP_ALL_GROUP_LABEL = 'All (single group)';

export interface Lever1Settings {
  /** When false, this lever is skipped: price/CM pass through unchanged and it contributes $0. */
  included: boolean;
  groupingField: string;
  materials: string[];
  breakdownByGroup: Record<string, Record<string, number>>;
  inflation: InflationRates;
}

export interface Lever2Settings {
  included: boolean;
  groupingField: string;
}

export interface Lever3Settings {
  included: boolean;
  groupingField: string;
}

export interface Lever4Settings {
  included: boolean;
  directBuyGroupingField: string;
  markupGroupingField: string;
  directBuyByGroup: Record<string, number>;
  markupIncreaseByGroup: Record<string, number>;
}

export interface Lever5Settings {
  included: boolean;
  useGlobalTarget: boolean;
  groupingField: string;
  globalTargetCmPercent: number;
  targetCmPercentByGroup: Record<string, number>;
}

export type BottomUpLeverId = 1 | 2 | 3 | 4 | 5;

export interface BottomUpLeverResult {
  lever: BottomUpLeverId;
  price: number;
  cm: number;
  cmPercent: number | null;
  unitOpportunity: number;
  dollarOpportunity: number;
  targetCmPercent?: number | null;
  skipped?: boolean;
  skipReason?: string;
  /** True when the lever was excluded from sizing (pass-through, $0 opportunity). */
  excluded?: boolean;
  /**
   * Lever 1 should-cost intermediates (anchor-year should cost per unit),
   * exposed for the cost build-up detail table. Populated only by
   * `sizeLever1Row`; undefined for other levers and for the excluded pass-through.
   */
  /** Σ over materials of (beginning material × breakdown% × material inflation). */
  shouldMaterial?: number;
  /** Beginning labor × labor inflation. */
  shouldLabor?: number;
  /** Beginning burden × burden inflation. */
  shouldBurden?: number;
  /** shouldMaterial + shouldLabor + shouldBurden. */
  shouldTotalCost?: number;
  /**
   * Lever 2/3/5 build-up intermediates, exposed so the per-part detail tables
   * display calc-consistent numbers (never recomputed differently in the UI).
   * Populated only by the corresponding `sizeLeverNRow`; undefined for other
   * levers and for the excluded/skip pass-through results.
   */
  /** Price fed into this lever from the prior lever (Levers 2-5). */
  incomingPrice?: number;
  /** Lever 2 & 4: anchor-year material cost per unit used by the lever. */
  anchorMaterialCost?: number;
  /** Lever 2: this part's material margin % = (P₁ − material) / P₁ × 100. */
  partMaterialMarginPercent?: number | null;
  /** Lever 2: group-average material margin % the part is priced toward. */
  groupAvgMaterialMarginPercent?: number | null;
  /** Lever 2/3/5: should price implied by the lever's target/group average. */
  shouldPrice?: number;
  /** Lever 3/5: contribution cost C = incoming price − incoming CM. */
  contributionCost?: number;
  /** Lever 3: true when the part is in the bottom 1/5 by volume (long tail). */
  isLongTail?: boolean;
  /**
   * Lever 3: volume quintile within the part's group by anchor-year volume.
   * 1 = highest-volume 20% (top), … 5 = lowest-volume 20% (the long tail).
   */
  volumeQuintile?: 1 | 2 | 3 | 4 | 5;
  /** Lever 4: direct-buy share (%) applied to the uplift. */
  directBuyPercent?: number;
  /** Lever 4: markup increase (percentage points) applied to the uplift. */
  markupIncrease?: number;
  /** Lever 4: per-unit uplift = markup% × material × directBuy%. */
  perUnitUplift?: number;
}

export interface RowBottomUpOpportunityResult {
  recordId: string;
  metadata: Record<string, string>;
  currency: string;
  beginningYear: number;
  anchorYear: number;
  anchorPrice: number | null;
  anchorVolume: number | null;
  levers: Record<`lever${BottomUpLeverId}`, BottomUpLeverResult>;
  finalPrice: number;
  finalCm: number;
  finalCmPercent: number | null;
  fullPotential: number;
  commercialRecovery: number;
  excluded: boolean;
}

export interface BottomUpLeverSettingsBundle {
  lever1: Lever1Settings;
  lever2: Lever2Settings;
  lever3: Lever3Settings;
  lever4: Lever4Settings;
  lever5: Lever5Settings;
}

export interface PortfolioBottomUpOpportunityResult {
  settings: OpportunitySettings;
  beginningYear: number;
  anchorYear: number;
  leverSettings: BottomUpLeverSettingsBundle;
  rows: RowBottomUpOpportunityResult[];
  totalFullPotential: number;
  totalCommercialRecovery: number;
  rowsWithOpportunity: number;
  compositionByLever: Record<string, number>;
  targetCmByGroupL3: Record<string, number | null>;
}

export type BottomUpWizardStep =
  | 'data'
  | 'lever1'
  | 'lever2'
  | 'lever3'
  | 'lever4'
  | 'lever5'
  | 'summary';

export type CostComponentMapping = Record<'material' | 'labor' | 'burden', string[]>;

