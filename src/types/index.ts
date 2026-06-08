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
