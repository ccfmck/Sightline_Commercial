import type {
  BottomUpRecord,
  BottomUpLeverSettingsBundle,
  BottomUpLeverResult,
  InflationRates,
  Lever1Settings,
  Lever5Settings,
  OpportunitySettings,
  PortfolioBottomUpOpportunityResult,
  RowBottomUpOpportunityResult,
} from '../types';
import {
  BOTTOM_UP_ALL_GROUPING_FIELD,
  BOTTOM_UP_ALL_GROUP_LABEL,
  DEFAULT_OPPORTUNITY_SETTINGS,
} from '../types';

export interface Lever1RowInput {
  recordId: string;
  groupKey: string;
  begPrice: number;
  begMaterial: number;
  begLabor: number;
  begBurden: number;
  anchorPrice: number;
  anchorVolume: number;
  anchorCm: number;
  breakdownPercents: Record<string, number>;
  inflation: InflationRates;
}

export interface Lever2RowInput {
  recordId: string;
  groupKey: string;
  p1: number;
  cm1: number;
  anchorMaterialCost: number;
  anchorVolume: number;
  groupAvgMaterialMargin: number;
}

export interface Lever3RowInput {
  recordId: string;
  groupKey: string;
  p2: number;
  cm2: number;
  anchorVolume: number;
  targetCmPercent: number | null;
  /** True when the part is in the bottom 1/5 by volume within its group. */
  isLongTail?: boolean;
  /**
   * Volume quintile within the group (1 = highest-volume 20% … 5 = lowest 20%).
   * Quintile 5 is exactly the long-tail set, so `isLongTail` is derived from it
   * when not supplied explicitly.
   */
  volumeQuintile?: VolumeQuintile;
}

export interface Lever4RowInput {
  recordId: string;
  directBuyGroupKey: string;
  markupGroupKey: string;
  p3: number;
  cm3: number;
  anchorMaterialCost: number;
  anchorVolume: number;
  directBuyPercent: number;
  markupIncrease: number;
}

export interface Lever5RowInput {
  recordId: string;
  groupKey: string;
  p4: number;
  cm4: number;
  anchorVolume: number;
  targetCmPercent: number;
}

function computeCmPercent(cm: number, price: number): number | null {
  if (price <= 0) return null;
  return (cm / price) * 100;
}

function totalBegCost(material: number, labor: number, burden: number): number {
  return material + labor + burden;
}

export function sizeLever1Row(input: Lever1RowInput): BottomUpLeverResult {
  const {
    begPrice,
    begMaterial,
    begLabor,
    begBurden,
    anchorPrice,
    anchorVolume,
    anchorCm,
    breakdownPercents,
    inflation,
  } = input;

  let inflatedMaterial = 0;
  for (const [material, pct] of Object.entries(breakdownPercents)) {
    const bucket = begMaterial * (pct / 100);
    const rate = inflation.materialRates[material] ?? 1;
    inflatedMaterial += bucket * rate;
  }

  const inflatedLabor = begLabor * inflation.laborRate;
  const inflatedBurden = begBurden * inflation.burdenRate;
  const shouldTotalCost = inflatedMaterial + inflatedLabor + inflatedBurden;
  const begTotalCost = totalBegCost(begMaterial, begLabor, begBurden);
  const deltaCost = shouldTotalCost - begTotalCost;
  const shouldPrice = begPrice + deltaCost;

  let unitOpportunity = 0;
  let price = anchorPrice;
  if (shouldPrice > anchorPrice) {
    unitOpportunity = shouldPrice - anchorPrice;
    price = shouldPrice;
  }

  const cm = anchorCm + (price - anchorPrice);
  const dollarOpportunity = anchorVolume > 0 ? unitOpportunity * anchorVolume : 0;

  return {
    lever: 1,
    price,
    cm,
    cmPercent: computeCmPercent(cm, price),
    unitOpportunity,
    dollarOpportunity,
    shouldMaterial: inflatedMaterial,
    shouldLabor: inflatedLabor,
    shouldBurden: inflatedBurden,
    shouldTotalCost,
  };
}

export interface GroupMaterialMarginBreakdown {
  /** Σ (anchor price × anchor volume) across contributing parts. */
  sales: number;
  /** Σ (anchor price × vol) − Σ (anchor material cost × vol). */
  materialMarginDollars: number;
  /** materialMarginDollars / sales × 100. Null when there are no valid sales. */
  materialMarginPercent: number | null;
}

/**
 * Dollar-weighted group material margin breakdown. This is the single source of
 * truth for both the Lever 2 target (`computeGroupMaterialMargin`) and the
 * group-level table shown in the Lever 2 panel, so the numbers always match.
 */
export function computeGroupMaterialMarginBreakdown(
  rows: { anchorPrice: number; anchorMaterialCost: number; anchorVolume: number }[],
): GroupMaterialMarginBreakdown {
  let sumPriceVol = 0;
  let sumMaterialVol = 0;
  for (const row of rows) {
    if (row.anchorVolume <= 0 || row.anchorPrice <= 0) continue;
    sumPriceVol += row.anchorPrice * row.anchorVolume;
    sumMaterialVol += row.anchorMaterialCost * row.anchorVolume;
  }
  const materialMarginDollars = sumPriceVol - sumMaterialVol;
  return {
    sales: sumPriceVol,
    materialMarginDollars,
    materialMarginPercent: sumPriceVol <= 0 ? null : (materialMarginDollars / sumPriceVol) * 100,
  };
}

export function computeGroupMaterialMargin(
  rows: { anchorPrice: number; anchorMaterialCost: number; anchorVolume: number }[],
): number | null {
  const { sales, materialMarginPercent } = computeGroupMaterialMarginBreakdown(rows);
  if (sales <= 0 || materialMarginPercent === null) return null;
  return materialMarginPercent / 100;
}

export function sizeLever2Row(input: Lever2RowInput): BottomUpLeverResult {
  const { p1, cm1, anchorMaterialCost, anchorVolume, groupAvgMaterialMargin } = input;

  const partMaterialMarginPercent = p1 > 0 ? ((p1 - anchorMaterialCost) / p1) * 100 : null;
  const groupAvgMaterialMarginPercent = groupAvgMaterialMargin * 100;

  if (groupAvgMaterialMargin >= 1) {
    return {
      lever: 2,
      price: p1,
      cm: cm1,
      cmPercent: computeCmPercent(cm1, p1),
      unitOpportunity: 0,
      dollarOpportunity: 0,
      incomingPrice: p1,
      anchorMaterialCost,
      partMaterialMarginPercent,
      groupAvgMaterialMarginPercent,
      skipped: true,
      skipReason: 'Invalid group average material margin',
    };
  }

  const shouldPrice = anchorMaterialCost / (1 - groupAvgMaterialMargin);
  let unitOpportunity = 0;
  let price = p1;
  if (shouldPrice > p1) {
    unitOpportunity = shouldPrice - p1;
    price = shouldPrice;
  }

  const cm = cm1 + Math.max(0, price - p1);
  const dollarOpportunity = anchorVolume > 0 ? unitOpportunity * anchorVolume : 0;

  return {
    lever: 2,
    price,
    cm,
    cmPercent: computeCmPercent(cm, price),
    unitOpportunity,
    dollarOpportunity,
    incomingPrice: p1,
    anchorMaterialCost,
    partMaterialMarginPercent,
    groupAvgMaterialMarginPercent,
    shouldPrice,
  };
}

export interface RankedPart {
  recordId: string;
  volume: number;
  p2: number;
  cm2: number;
}

/** 1 = highest-volume 20% (top) … 5 = lowest-volume 20% (the long tail). */
export type VolumeQuintile = 1 | 2 | 3 | 4 | 5;

/**
 * Sorts parts by descending anchor volume, breaking ties by ascending recordId
 * (the single ordering rule shared by every quintile-based calculation).
 */
function sortByVolumeDesc(parts: RankedPart[]): RankedPart[] {
  return [...parts].sort((a, b) => {
    if (b.volume !== a.volume) return b.volume - a.volume;
    return a.recordId.localeCompare(b.recordId);
  });
}

export function rankByVolumeQuintile(parts: RankedPart[]): {
  topFourFifths: RankedPart[];
  bottomOneFifth: RankedPart[];
} {
  const sorted = sortByVolumeDesc(parts);
  const topCount = Math.ceil(sorted.length * 0.8);
  return {
    topFourFifths: sorted.slice(0, topCount),
    bottomOneFifth: sorted.slice(topCount),
  };
}

/**
 * Assigns each part a volume quintile within its set using the same descending
 * volume ranking (and tie-break) as {@link rankByVolumeQuintile}. Rank `i`
 * (0-based) maps to `floor(5·i / n) + 1`, which spreads the parts as evenly as
 * possible across quintiles 1–5 and, critically, makes quintile 5 exactly equal
 * `rankByVolumeQuintile`'s `bottomOneFifth` (indices ≥ ceil(0.8·n)). For small
 * groups (n < 5) some quintiles are empty but the bottom-1/5 set still matches,
 * so the group target-CM math and this column always agree.
 */
export function assignVolumeQuintiles(parts: RankedPart[]): Record<string, VolumeQuintile> {
  const sorted = sortByVolumeDesc(parts);
  const n = sorted.length;
  const result: Record<string, VolumeQuintile> = {};
  for (let i = 0; i < n; i++) {
    result[sorted[i].recordId] = (Math.floor((5 * i) / n) + 1) as VolumeQuintile;
  }
  return result;
}

export function computeLongTailTargetCm(parts: RankedPart[]): number | null {
  const { topFourFifths } = rankByVolumeQuintile(parts);
  if (topFourFifths.length === 0) return null;

  let sumCmVol = 0;
  let sumPriceVol = 0;
  for (const part of topFourFifths) {
    if (part.volume <= 0 || part.p2 <= 0) continue;
    sumCmVol += part.cm2 * part.volume;
    sumPriceVol += part.p2 * part.volume;
  }
  if (sumPriceVol <= 0) return null;
  return (sumCmVol / sumPriceVol) * 100;
}

export function sizeLever3Row(input: Lever3RowInput): BottomUpLeverResult {
  const { p2, cm2, anchorVolume, targetCmPercent, isLongTail, volumeQuintile } = input;

  const cm2Percent = computeCmPercent(cm2, p2);
  const contributionCost = p2 - cm2;
  const shared = {
    lever: 3 as const,
    incomingPrice: p2,
    contributionCost,
    isLongTail: isLongTail ?? volumeQuintile === 5,
    volumeQuintile,
  };

  if (targetCmPercent === null) {
    return {
      ...shared,
      price: p2,
      cm: cm2,
      cmPercent: cm2Percent,
      unitOpportunity: 0,
      dollarOpportunity: 0,
      targetCmPercent: null,
      skipped: true,
      skipReason: 'No target CM% for group',
    };
  }

  const targetFactor = 1 - targetCmPercent / 100;
  const shouldPrice = targetFactor > 0 ? contributionCost / targetFactor : undefined;

  if (cm2Percent === null || cm2Percent >= targetCmPercent) {
    return {
      ...shared,
      price: p2,
      cm: cm2,
      cmPercent: cm2Percent,
      unitOpportunity: 0,
      dollarOpportunity: 0,
      targetCmPercent,
      shouldPrice,
    };
  }

  if (targetFactor <= 0) {
    return {
      ...shared,
      price: p2,
      cm: cm2,
      cmPercent: cm2Percent,
      unitOpportunity: 0,
      dollarOpportunity: 0,
      targetCmPercent,
      skipped: true,
      skipReason: 'Invalid target CM%',
    };
  }

  const p3 = contributionCost / targetFactor;
  const unitOpportunity = Math.max(0, p3 - p2);
  const cm = cm2 + unitOpportunity;
  const dollarOpportunity = anchorVolume > 0 ? unitOpportunity * anchorVolume : 0;

  return {
    ...shared,
    price: p3,
    cm,
    cmPercent: computeCmPercent(cm, p3),
    unitOpportunity,
    dollarOpportunity,
    targetCmPercent,
    shouldPrice: p3,
  };
}

export function sizeLever4Row(input: Lever4RowInput): BottomUpLeverResult {
  const { p3, cm3, anchorMaterialCost, anchorVolume, directBuyPercent, markupIncrease } = input;

  // `markupIncrease` is entered in percentage points (e.g. 3 → +3 pts → 0.03)
  // and `directBuyPercent` is entered as a percent (e.g. 40 → 40% → 0.40), so
  // both are divided by 100 before being applied to the material cost.
  const uplift = (markupIncrease / 100) * anchorMaterialCost * (directBuyPercent / 100);
  const unitOpportunity = uplift;
  const price = p3 + uplift;
  const cm = cm3 + uplift;
  const dollarOpportunity = anchorVolume > 0 ? unitOpportunity * anchorVolume : 0;

  return {
    lever: 4,
    price,
    cm,
    cmPercent: computeCmPercent(cm, price),
    unitOpportunity,
    dollarOpportunity,
    incomingPrice: p3,
    anchorMaterialCost,
    directBuyPercent,
    markupIncrease,
    perUnitUplift: uplift,
  };
}

export function sizeLever5Row(input: Lever5RowInput): BottomUpLeverResult {
  const { p4, cm4, anchorVolume, targetCmPercent } = input;

  const cm4Percent = computeCmPercent(cm4, p4);
  const contributionCost = p4 - cm4;
  const targetFactor = 1 - targetCmPercent / 100;
  const shouldPrice = targetFactor > 0 ? contributionCost / targetFactor : undefined;
  const shared = {
    lever: 5 as const,
    incomingPrice: p4,
    contributionCost,
    targetCmPercent,
  };

  if (cm4Percent === null || cm4Percent >= targetCmPercent) {
    return {
      ...shared,
      price: p4,
      cm: cm4,
      cmPercent: cm4Percent,
      unitOpportunity: 0,
      dollarOpportunity: 0,
      shouldPrice,
    };
  }

  if (targetFactor <= 0) {
    return {
      ...shared,
      price: p4,
      cm: cm4,
      cmPercent: cm4Percent,
      unitOpportunity: 0,
      dollarOpportunity: 0,
      skipped: true,
      skipReason: 'Invalid target CM%',
    };
  }

  const p5 = contributionCost / targetFactor;
  const unitOpportunity = Math.max(0, p5 - p4);
  const cm = cm4 + unitOpportunity;
  const dollarOpportunity = anchorVolume > 0 ? unitOpportunity * anchorVolume : 0;

  return {
    ...shared,
    price: p5,
    cm,
    cmPercent: computeCmPercent(cm, p5),
    unitOpportunity,
    dollarOpportunity,
    shouldPrice: p5,
  };
}

function groupKey(metadata: Record<string, string>, field: string): string {
  if (field === BOTTOM_UP_ALL_GROUPING_FIELD) {
    return BOTTOM_UP_ALL_GROUP_LABEL;
  }
  return metadata[field]?.trim() || '(blank)';
}

function resolveTargetCmPercent(
  settings: Lever5Settings,
  metadata: Record<string, string>,
): number {
  if (settings.useGlobalTarget) {
    return settings.globalTargetCmPercent;
  }
  const key = groupKey(metadata, settings.groupingField);
  return settings.targetCmPercentByGroup[key] ?? settings.globalTargetCmPercent;
}

function deriveAnchorCm(record: BottomUpRecord): number | null {
  if (record.anchor.cmPerUnit !== null) return record.anchor.cmPerUnit;
  const price = record.anchor.price;
  const material = record.anchor.materialCost;
  const labor = record.anchor.laborCost;
  const burden = record.anchor.burdenCost;
  if (price === null || material === null || labor === null || burden === null) return null;
  return price - (material + labor + burden);
}

function emptyLeverResult(lever: 1 | 2 | 3 | 4 | 5, price = 0): BottomUpLeverResult {
  return {
    lever,
    price,
    cm: 0,
    cmPercent: null,
    unitOpportunity: 0,
    dollarOpportunity: 0,
    skipped: true,
    skipReason: 'Missing anchor data',
  };
}

/**
 * Result for an excluded lever: price and CM pass through unchanged from the
 * prior lever, and the lever contributes $0 opportunity.
 */
function passThroughLeverResult(
  lever: 1 | 2 | 3 | 4 | 5,
  prevPrice: number,
  prevCm: number,
): BottomUpLeverResult {
  return {
    lever,
    price: prevPrice,
    cm: prevCm,
    cmPercent: computeCmPercent(prevCm, prevPrice),
    unitOpportunity: 0,
    dollarOpportunity: 0,
    excluded: true,
  };
}

export function sizeRowBottomUpOpportunity(
  record: BottomUpRecord,
  leverSettings: BottomUpLeverSettingsBundle,
  groupMaterialMargins: Record<string, number | null>,
  targetCmByGroupL3: Record<string, number | null>,
  settings: OpportunitySettings = DEFAULT_OPPORTUNITY_SETTINGS,
  excluded = false,
  longTailByRecord: Record<string, boolean> = {},
  volumeQuintileByRecord: Record<string, VolumeQuintile> = {},
): RowBottomUpOpportunityResult {
  const anchorPrice = record.anchor.price;
  const anchorVolume = record.anchor.volume;
  const anchorMaterial = record.anchor.materialCost;
  const anchorCm = deriveAnchorCm(record);

  const emptyRow = (): RowBottomUpOpportunityResult => ({
    recordId: record.id,
    metadata: record.metadata,
    currency: record.currency,
    beginningYear: record.beginningYear,
    anchorYear: record.anchorYear,
    anchorPrice,
    anchorVolume,
    levers: {
      lever1: emptyLeverResult(1, anchorPrice ?? 0),
      lever2: emptyLeverResult(2, anchorPrice ?? 0),
      lever3: emptyLeverResult(3, anchorPrice ?? 0),
      lever4: emptyLeverResult(4, anchorPrice ?? 0),
      lever5: emptyLeverResult(5, anchorPrice ?? 0),
    },
    finalPrice: anchorPrice ?? 0,
    finalCm: anchorCm ?? 0,
    finalCmPercent: computeCmPercent(anchorCm ?? 0, anchorPrice ?? 0),
    fullPotential: 0,
    commercialRecovery: 0,
    excluded,
  });

  if (
    anchorPrice === null ||
    anchorVolume === null ||
    anchorMaterial === null ||
    anchorCm === null ||
    record.beginning.price === null ||
    record.beginning.materialCost === null ||
    record.beginning.laborCost === null ||
    record.beginning.burdenCost === null
  ) {
    return emptyRow();
  }

  const l1Group = groupKey(record.metadata, leverSettings.lever1.groupingField);
  const breakdown = leverSettings.lever1.breakdownByGroup[l1Group] ?? {};
  const lever1 = leverSettings.lever1.included
    ? sizeLever1Row({
        recordId: record.id,
        groupKey: l1Group,
        begPrice: record.beginning.price,
        begMaterial: record.beginning.materialCost,
        begLabor: record.beginning.laborCost,
        begBurden: record.beginning.burdenCost,
        anchorPrice,
        anchorVolume,
        anchorCm,
        breakdownPercents: breakdown,
        inflation: leverSettings.lever1.inflation,
      })
    : passThroughLeverResult(1, anchorPrice, anchorCm);

  const l2Group = groupKey(record.metadata, leverSettings.lever2.groupingField);
  const avgMargin = groupMaterialMargins[l2Group] ?? null;
  const lever2 = !leverSettings.lever2.included
    ? passThroughLeverResult(2, lever1.price, lever1.cm)
    : avgMargin === null
      ? {
          ...emptyLeverResult(2, lever1.price),
          price: lever1.price,
          cm: lever1.cm,
          cmPercent: lever1.cmPercent,
        }
      : sizeLever2Row({
          recordId: record.id,
          groupKey: l2Group,
          p1: lever1.price,
          cm1: lever1.cm,
          anchorMaterialCost: anchorMaterial,
          anchorVolume,
          groupAvgMaterialMargin: avgMargin,
        });

  const l3Group = groupKey(record.metadata, leverSettings.lever3.groupingField);
  const targetL3 = targetCmByGroupL3[l3Group] ?? null;
  const lever3 = leverSettings.lever3.included
    ? sizeLever3Row({
        recordId: record.id,
        groupKey: l3Group,
        p2: lever2.price,
        cm2: lever2.cm,
        anchorVolume,
        targetCmPercent: targetL3,
        isLongTail: longTailByRecord[record.id] ?? false,
        volumeQuintile: volumeQuintileByRecord[record.id],
      })
    : passThroughLeverResult(3, lever2.price, lever2.cm);

  const directBuyGroup = groupKey(record.metadata, leverSettings.lever4.directBuyGroupingField);
  const markupGroup = groupKey(record.metadata, leverSettings.lever4.markupGroupingField);
  const directBuy = leverSettings.lever4.directBuyByGroup[directBuyGroup] ?? 0;
  const markup = leverSettings.lever4.markupIncreaseByGroup[markupGroup] ?? 0;
  const lever4 = leverSettings.lever4.included
    ? sizeLever4Row({
        recordId: record.id,
        directBuyGroupKey: directBuyGroup,
        markupGroupKey: markupGroup,
        p3: lever3.price,
        cm3: lever3.cm,
        anchorMaterialCost: anchorMaterial,
        anchorVolume,
        directBuyPercent: directBuy,
        markupIncrease: markup,
      })
    : passThroughLeverResult(4, lever3.price, lever3.cm);

  const l5Group = groupKey(record.metadata, leverSettings.lever5.groupingField);
  const targetL5 = resolveTargetCmPercent(leverSettings.lever5, record.metadata);
  const lever5 = leverSettings.lever5.included
    ? sizeLever5Row({
        recordId: record.id,
        groupKey: l5Group,
        p4: lever4.price,
        cm4: lever4.cm,
        anchorVolume,
        targetCmPercent: targetL5,
      })
    : passThroughLeverResult(5, lever4.price, lever4.cm);

  const fullPotential =
    lever1.dollarOpportunity +
    lever2.dollarOpportunity +
    lever3.dollarOpportunity +
    lever4.dollarOpportunity +
    lever5.dollarOpportunity;

  const commercialRecovery = excluded
    ? 0
    : fullPotential *
      (settings.externalFactorPercent / 100) *
      (settings.captureRatePercent / 100);

  return {
    recordId: record.id,
    metadata: record.metadata,
    currency: record.currency,
    beginningYear: record.beginningYear,
    anchorYear: record.anchorYear,
    anchorPrice,
    anchorVolume,
    levers: { lever1, lever2, lever3, lever4, lever5 },
    finalPrice: lever5.price,
    finalCm: lever5.cm,
    finalCmPercent: lever5.cmPercent,
    fullPotential,
    commercialRecovery,
    excluded,
  };
}

export function buildGroupMaterialMargins(
  records: BottomUpRecord[],
  groupingField: string,
): Record<string, number | null> {
  const byGroup = new Map<
    string,
    { anchorPrice: number; anchorMaterialCost: number; anchorVolume: number }[]
  >();

  for (const record of records) {
    const anchorPrice = record.anchor.price;
    const anchorMaterial = record.anchor.materialCost;
    const anchorVolume = record.anchor.volume;
    if (anchorPrice === null || anchorMaterial === null || anchorVolume === null) continue;

    const key = groupKey(record.metadata, groupingField);
    const list = byGroup.get(key) ?? [];
    list.push({ anchorPrice, anchorMaterialCost: anchorMaterial, anchorVolume });
    byGroup.set(key, list);
  }

  const result: Record<string, number | null> = {};
  for (const [key, rows] of byGroup) {
    result[key] = computeGroupMaterialMargin(rows);
  }
  return result;
}

export interface GroupMaterialMarginTableRow extends GroupMaterialMarginBreakdown {
  groupKey: string;
  /** Representative source currency (first contributing record in the group). */
  currency: string;
}

/**
 * Per-group material margin table for the Lever 2 panel. Uses anchor-year
 * actuals and the same dollar-weighted computation that drives the Lever 2
 * target, respecting the selected grouping field (incl. all-single-group).
 */
export function buildGroupMaterialMarginTable(
  records: BottomUpRecord[],
  groupingField: string,
): GroupMaterialMarginTableRow[] {
  const byGroup = new Map<
    string,
    {
      currency: string;
      rows: { anchorPrice: number; anchorMaterialCost: number; anchorVolume: number }[];
    }
  >();

  for (const record of records) {
    const anchorPrice = record.anchor.price;
    const anchorMaterial = record.anchor.materialCost;
    const anchorVolume = record.anchor.volume;
    if (anchorPrice === null || anchorMaterial === null || anchorVolume === null) continue;

    const key = groupKey(record.metadata, groupingField);
    const entry = byGroup.get(key) ?? { currency: record.currency, rows: [] };
    entry.rows.push({ anchorPrice, anchorMaterialCost: anchorMaterial, anchorVolume });
    byGroup.set(key, entry);
  }

  return [...byGroup.entries()]
    .map(([key, { currency, rows }]) => ({
      groupKey: key,
      currency,
      ...computeGroupMaterialMarginBreakdown(rows),
    }))
    .sort((a, b) => a.groupKey.localeCompare(b.groupKey));
}

export function buildTargetCmByGroupL3(
  records: BottomUpRecord[],
  lever2Results: Map<string, { price: number; cm: number }>,
  groupingField: string,
): Record<string, number | null> {
  const byGroup = new Map<string, RankedPart[]>();

  for (const record of records) {
    const l2 = lever2Results.get(record.id);
    const volume = record.anchor.volume;
    if (!l2 || volume === null) continue;

    const key = groupKey(record.metadata, groupingField);
    const list = byGroup.get(key) ?? [];
    list.push({ recordId: record.id, volume, p2: l2.price, cm2: l2.cm });
    byGroup.set(key, list);
  }

  const result: Record<string, number | null> = {};
  for (const [key, parts] of byGroup) {
    result[key] = computeLongTailTargetCm(parts);
  }
  return result;
}

/** Groups records into ranked parts per Lever 3 group for quintile calcs. */
function groupRankedParts(
  records: BottomUpRecord[],
  lever2Results: Map<string, { price: number; cm: number }>,
  groupingField: string,
): Map<string, RankedPart[]> {
  const byGroup = new Map<string, RankedPart[]>();

  for (const record of records) {
    const l2 = lever2Results.get(record.id);
    const volume = record.anchor.volume;
    if (!l2 || volume === null) continue;

    const key = groupKey(record.metadata, groupingField);
    const list = byGroup.get(key) ?? [];
    list.push({ recordId: record.id, volume, p2: l2.price, cm2: l2.cm });
    byGroup.set(key, list);
  }

  return byGroup;
}

/**
 * Volume quintile (1 = top 20% … 5 = bottom 20%) per record within its Lever 3
 * group, using the same descending-volume ranking as the target CM% split so
 * the detail table stays calc-consistent.
 */
export function buildVolumeQuintileByRecord(
  records: BottomUpRecord[],
  lever2Results: Map<string, { price: number; cm: number }>,
  groupingField: string,
): Record<string, VolumeQuintile> {
  const byGroup = groupRankedParts(records, lever2Results, groupingField);
  const result: Record<string, VolumeQuintile> = {};
  for (const parts of byGroup.values()) {
    Object.assign(result, assignVolumeQuintiles(parts));
  }
  return result;
}

/**
 * Flags each record that falls in the bottom 1/5 by anchor volume within its
 * Lever 3 group (the "long tail"). Derived from the volume quintiles so the
 * flag is exactly `quintile === 5`, keeping it aligned with the target CM% math.
 */
export function buildLongTailFlags(
  records: BottomUpRecord[],
  lever2Results: Map<string, { price: number; cm: number }>,
  groupingField: string,
): Record<string, boolean> {
  const quintiles = buildVolumeQuintileByRecord(records, lever2Results, groupingField);
  const flags: Record<string, boolean> = {};
  for (const [recordId, quintile] of Object.entries(quintiles)) {
    if (quintile === 5) flags[recordId] = true;
  }
  return flags;
}

export function sizePortfolioBottomUpOpportunity(
  records: BottomUpRecord[],
  beginningYear: number,
  anchorYear: number,
  leverSettings: BottomUpLeverSettingsBundle,
  settings: OpportunitySettings = DEFAULT_OPPORTUNITY_SETTINGS,
): PortfolioBottomUpOpportunityResult {
  const lever2ById = new Map<string, { price: number; cm: number }>();

  for (const record of records) {
    const anchorPrice = record.anchor.price;
    const anchorVolume = record.anchor.volume;
    const anchorCm = deriveAnchorCm(record);
    if (
      anchorPrice === null ||
      anchorVolume === null ||
      anchorCm === null ||
      record.beginning.price === null ||
      record.beginning.materialCost === null ||
      record.beginning.laborCost === null ||
      record.beginning.burdenCost === null
    ) {
      continue;
    }

    const l1Group = groupKey(record.metadata, leverSettings.lever1.groupingField);
    const breakdown = leverSettings.lever1.breakdownByGroup[l1Group] ?? {};
    const l1 = leverSettings.lever1.included
      ? sizeLever1Row({
          recordId: record.id,
          groupKey: l1Group,
          begPrice: record.beginning.price,
          begMaterial: record.beginning.materialCost,
          begLabor: record.beginning.laborCost,
          begBurden: record.beginning.burdenCost,
          anchorPrice,
          anchorVolume,
          anchorCm,
          breakdownPercents: breakdown,
          inflation: leverSettings.lever1.inflation,
        })
      : passThroughLeverResult(1, anchorPrice, anchorCm);
    const groupMargins = buildGroupMaterialMargins(records, leverSettings.lever2.groupingField);
    const l2Group = groupKey(record.metadata, leverSettings.lever2.groupingField);
    const avgMargin = groupMargins[l2Group] ?? null;
    if (!leverSettings.lever2.included) {
      lever2ById.set(record.id, { price: l1.price, cm: l1.cm });
    } else if (avgMargin !== null && record.anchor.materialCost !== null) {
      const l2 = sizeLever2Row({
        recordId: record.id,
        groupKey: l2Group,
        p1: l1.price,
        cm1: l1.cm,
        anchorMaterialCost: record.anchor.materialCost,
        anchorVolume,
        groupAvgMaterialMargin: avgMargin,
      });
      lever2ById.set(record.id, { price: l2.price, cm: l2.cm });
    }
  }

  const groupMaterialMargins = buildGroupMaterialMargins(
    records,
    leverSettings.lever2.groupingField,
  );
  const targetCmByGroupL3 = buildTargetCmByGroupL3(
    records,
    lever2ById,
    leverSettings.lever3.groupingField,
  );
  const volumeQuintileByRecord = buildVolumeQuintileByRecord(
    records,
    lever2ById,
    leverSettings.lever3.groupingField,
  );
  const longTailByRecord = buildLongTailFlags(
    records,
    lever2ById,
    leverSettings.lever3.groupingField,
  );

  const rows = records.map((record) =>
    sizeRowBottomUpOpportunity(
      record,
      leverSettings,
      groupMaterialMargins,
      targetCmByGroupL3,
      settings,
      false,
      longTailByRecord,
      volumeQuintileByRecord,
    ),
  );

  let totalFullPotential = 0;
  let totalCommercialRecovery = 0;
  let rowsWithOpportunity = 0;
  const compositionByLever: Record<string, number> = {};

  const leverLabels = ['Lever 1', 'Lever 2', 'Lever 3', 'Lever 4', 'Lever 5'] as const;

  for (const row of rows) {
    if (row.excluded) continue;
    totalFullPotential += row.fullPotential;
    totalCommercialRecovery += row.commercialRecovery;
    if (row.fullPotential > 0) rowsWithOpportunity += 1;

    if (row.commercialRecovery <= 0) continue;

    const leverAmounts = [
      row.levers.lever1.dollarOpportunity,
      row.levers.lever2.dollarOpportunity,
      row.levers.lever3.dollarOpportunity,
      row.levers.lever4.dollarOpportunity,
      row.levers.lever5.dollarOpportunity,
    ];
    const totalLever = leverAmounts.reduce((a, b) => a + b, 0);
    if (totalLever <= 0) continue;

    for (let i = 0; i < leverLabels.length; i++) {
      const share = (leverAmounts[i] / totalLever) * row.commercialRecovery;
      compositionByLever[leverLabels[i]] = (compositionByLever[leverLabels[i]] ?? 0) + share;
    }
  }

  return {
    settings,
    beginningYear,
    anchorYear,
    leverSettings,
    rows,
    totalFullPotential,
    totalCommercialRecovery,
    rowsWithOpportunity,
    compositionByLever,
    targetCmByGroupL3,
  };
}

export function getNextMaterialName(materials: string[]): string {
  const letterPattern = /^Material\s+([A-Z])$/i;
  let maxLetterCode = 64;
  for (const material of materials) {
    const match = material.match(letterPattern);
    if (match) {
      maxLetterCode = Math.max(maxLetterCode, match[1].toUpperCase().charCodeAt(0));
    }
  }

  const nextLetterCode = maxLetterCode >= 65 ? maxLetterCode + 1 : 65 + materials.length;
  if (nextLetterCode <= 90) {
    return `Material ${String.fromCharCode(nextLetterCode)}`;
  }

  const numberPattern = /^Material\s+(\d+)$/i;
  let maxNumber = materials.length;
  for (const material of materials) {
    const match = material.match(numberPattern);
    if (match) {
      maxNumber = Math.max(maxNumber, Number.parseInt(match[1], 10));
    }
  }
  return `Material ${maxNumber + 1}`;
}

export function renameMaterialInLever1Settings(
  settings: Lever1Settings,
  oldName: string,
  newName: string,
): Lever1Settings {
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName || settings.materials.includes(trimmed)) {
    return settings;
  }

  const materials = settings.materials.map((material) =>
    material === oldName ? trimmed : material,
  );

  const breakdownByGroup: Record<string, Record<string, number>> = {};
  for (const [group, breakdown] of Object.entries(settings.breakdownByGroup)) {
    const nextBreakdown: Record<string, number> = {};
    for (const [material, pct] of Object.entries(breakdown)) {
      nextBreakdown[material === oldName ? trimmed : material] = pct;
    }
    breakdownByGroup[group] = nextBreakdown;
  }

  const materialRates = { ...settings.inflation.materialRates };
  if (materialRates[oldName] !== undefined) {
    materialRates[trimmed] = materialRates[oldName];
    delete materialRates[oldName];
  } else if (materialRates[trimmed] === undefined) {
    materialRates[trimmed] = 1;
  }

  return {
    ...settings,
    materials,
    breakdownByGroup,
    inflation: { ...settings.inflation, materialRates },
  };
}

export function buildDefaultLeverSettings(
  _metadataFields: string[],
  materials: string[] = ['Material A', 'Material B'],
): BottomUpLeverSettingsBundle {
  const defaultBreakdown: Record<string, number> = {};
  const equalPct = materials.length > 0 ? 100 / materials.length : 100;
  for (const m of materials) {
    defaultBreakdown[m] = equalPct;
  }

  const defaultInflation: InflationRates = {
    materialRates: Object.fromEntries(materials.map((m) => [m, 1])),
    laborRate: 1,
    burdenRate: 1,
  };

  return {
    lever1: {
      included: true,
      groupingField: BOTTOM_UP_ALL_GROUPING_FIELD,
      materials,
      breakdownByGroup: { [BOTTOM_UP_ALL_GROUP_LABEL]: defaultBreakdown },
      inflation: defaultInflation,
    },
    lever2: { included: true, groupingField: BOTTOM_UP_ALL_GROUPING_FIELD },
    lever3: { included: true, groupingField: BOTTOM_UP_ALL_GROUPING_FIELD },
    lever4: {
      included: true,
      directBuyGroupingField: BOTTOM_UP_ALL_GROUPING_FIELD,
      markupGroupingField: BOTTOM_UP_ALL_GROUPING_FIELD,
      directBuyByGroup: { [BOTTOM_UP_ALL_GROUP_LABEL]: 0 },
      markupIncreaseByGroup: { [BOTTOM_UP_ALL_GROUP_LABEL]: 0 },
    },
    lever5: {
      included: true,
      useGlobalTarget: true,
      groupingField: BOTTOM_UP_ALL_GROUPING_FIELD,
      globalTargetCmPercent: 12,
      targetCmPercentByGroup: {},
    },
  };
}

/** After editing lever N settings, levers 1..N-1 stay calculated; N..5 need recalculation. */
export function completedThroughAfterLeverSettingsChange(
  currentCompletedThrough: number,
  changedLever: 1 | 2 | 3 | 4 | 5,
): number {
  return Math.min(currentCompletedThrough, changedLever - 1);
}

export function getBottomUpGroups(
  records: BottomUpRecord[],
  field: string,
): string[] {
  if (field === BOTTOM_UP_ALL_GROUPING_FIELD) {
    return [BOTTOM_UP_ALL_GROUP_LABEL];
  }
  const groups = new Set<string>();
  for (const record of records) {
    groups.add(groupKey(record.metadata, field));
  }
  return [...groups].sort();
}

export { groupKey as bottomUpGroupKey };
