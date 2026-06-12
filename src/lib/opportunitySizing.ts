import type {
  BleederLeakerResult,
  MarginErosionFrameResult,
  OpportunityBasisId,
  OpportunityFrameId,
  OpportunitySettings,
  PartProgramRecord,
  PeriodMetrics,
  PortfolioOpportunityResult,
  RowOpportunityOverride,
  RowOpportunityOverrides,
  RowOpportunityResult,
  RowOpportunityStatus,
  WinningMethod,
} from '../types';
import { DEFAULT_OPPORTUNITY_SETTINGS } from '../types';
import { normalizeCurrencyCode } from './currency';
import { computeEbitMarginPercent, sumPresentCosts } from './metrics';
import { getRecordPeriodMetrics } from './recordMetrics';

export function buildOpportunityFrames(
  anchorYear: number,
  hasAtQuote: boolean,
  historicalYears: number[],
): OpportunityFrameId[] {
  const frames: OpportunityFrameId[] = [];
  if (hasAtQuote) {
    frames.push('at_quote');
  }
  for (const year of historicalYears) {
    if (year < anchorYear) {
      frames.push(String(year) as `${number}`);
    }
  }
  return frames;
}

export function buildBasisOptions(
  frames: OpportunityFrameId[],
): { id: OpportunityBasisId; label: string }[] {
  const options: { id: OpportunityBasisId; label: string }[] = [
    { id: 'auto', label: 'Auto (max opportunity)' },
  ];
  for (const frameId of frames) {
    options.push({
      id: frameId,
      label: frameId === 'at_quote' ? 'vs At Quote' : `vs ${frameId}`,
    });
  }
  options.push({ id: 'bleeder', label: 'Bleeder recovery' });
  options.push({ id: 'leaker', label: 'Leaker recovery' });
  options.push({ id: 'exclude', label: 'Exclude from sizing' });
  return options;
}

function frameLabel(frameId: OpportunityFrameId): string {
  if (frameId === 'at_quote') return 'At Quote';
  return String(frameId);
}

function getReferenceMetrics(
  record: PartProgramRecord,
  frameId: OpportunityFrameId,
  anchorYear: number,
): PeriodMetrics | null {
  if (frameId === 'at_quote') {
    return getRecordPeriodMetrics(record, 'at_quote', anchorYear);
  }
  return record.periods[frameId] ?? null;
}

function getAnchorMetrics(record: PartProgramRecord, anchorYear: number): PeriodMetrics | null {
  return record.periods[String(anchorYear) as `${number}`] ?? null;
}

function presentCosts(costs: Record<string, number | null>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(costs).filter((entry): entry is [string, number] => {
      const value = entry[1];
      return value !== null && value !== undefined;
    }),
  );
}

export function sizeMarginErosionFrame(
  anchorPrice: number,
  anchorVolume: number,
  anchorCosts: Record<string, number>,
  referencePrice: number | null,
  referenceCosts: Record<string, number>,
  frameId: OpportunityFrameId,
): MarginErosionFrameResult {
  const base: MarginErosionFrameResult = {
    frameId,
    frameLabel: frameLabel(frameId),
    increasedCostComponents: [],
    totalCostIncrease: 0,
    costIncreasePercent: 0,
    referenceTotalCost: 0,
    referencePrice: referencePrice ?? 0,
    referenceEbitMarginPercent: null,
    anchorPrice,
    priceIncreasePercent: 0,
    expectedPrice: 0,
    unitOpportunity: 0,
    targetPriceIncrease: 0,
    targetPrice: anchorPrice,
    dollarOpportunity: 0,
    skipped: false,
  };

  const refTotalCost = sumPresentCosts(referenceCosts);
  if (referencePrice === null || referencePrice <= 0 || refTotalCost === null || refTotalCost <= 0) {
    return {
      ...base,
      skipped: true,
      skipReason: 'Missing or invalid reference price or total cost',
    };
  }

  const increasedCostComponents: { component: string; increase: number }[] = [];
  let totalCostIncrease = 0;

  for (const [component, anchorCost] of Object.entries(anchorCosts)) {
    const refCost = referenceCosts[component];
    if (refCost === undefined) continue;
    if (anchorCost > refCost) {
      const increase = anchorCost - refCost;
      increasedCostComponents.push({ component, increase });
      totalCostIncrease += increase;
    }
  }

  const costIncreasePercent = totalCostIncrease / refTotalCost;
  const expectedPrice = referencePrice * (1 + costIncreasePercent);
  const priceIncreasePercent = (anchorPrice - referencePrice) / referencePrice;

  let unitOpportunity = 0;
  if (priceIncreasePercent < costIncreasePercent) {
    unitOpportunity = Math.max(0, expectedPrice - anchorPrice);
  }

  const dollarOpportunity = anchorVolume > 0 ? unitOpportunity * anchorVolume : 0;

  return {
    frameId,
    frameLabel: frameLabel(frameId),
    increasedCostComponents,
    totalCostIncrease,
    costIncreasePercent: costIncreasePercent * 100,
    referenceTotalCost: refTotalCost,
    referencePrice,
    referenceEbitMarginPercent: computeEbitMarginPercent(referencePrice, refTotalCost),
    anchorPrice,
    priceIncreasePercent: priceIncreasePercent * 100,
    expectedPrice,
    unitOpportunity,
    targetPriceIncrease: unitOpportunity,
    targetPrice: anchorPrice + unitOpportunity,
    dollarOpportunity,
    skipped: false,
  };
}

export function sizeBleederLeaker(
  anchorPrice: number | null,
  anchorVolume: number,
  anchorTotalCost: number | null,
  targetMarginPercent: number,
  forceBasis?: 'bleeder' | 'leaker',
): BleederLeakerResult {
  const noData: BleederLeakerResult = {
    classification: 'no_data',
    anchorMarginPercent: null,
    targetMarginPercent,
    unitOpportunity: 0,
    targetPriceIncrease: 0,
    targetPrice: null,
    dollarOpportunity: 0,
  };

  if (anchorPrice === null || anchorTotalCost === null) {
    return noData;
  }

  const anchorMarginPercent = computeEbitMarginPercent(anchorPrice, anchorTotalCost);
  if (anchorMarginPercent === null) {
    return noData;
  }

  let unitOpportunity = 0;
  let targetPrice: number | null = anchorPrice;
  let classification: BleederLeakerResult['classification'] = 'healthy';

  if (forceBasis === 'bleeder') {
    classification = 'bleeder';
    unitOpportunity = Math.max(0, anchorTotalCost - anchorPrice);
    targetPrice = anchorTotalCost;
  } else if (forceBasis === 'leaker') {
    classification = 'leaker';
    const targetFactor = 1 - targetMarginPercent / 100;
    if (targetFactor <= 0) {
      return noData;
    }
    targetPrice = anchorTotalCost / targetFactor;
    unitOpportunity = Math.max(0, targetPrice - anchorPrice);
  } else if (anchorMarginPercent < 0) {
    classification = 'bleeder';
    unitOpportunity = Math.max(0, anchorTotalCost - anchorPrice);
    targetPrice = anchorTotalCost;
  } else if (anchorMarginPercent < targetMarginPercent) {
    classification = 'leaker';
    const targetFactor = 1 - targetMarginPercent / 100;
    if (targetFactor <= 0) {
      return noData;
    }
    targetPrice = anchorTotalCost / targetFactor;
    unitOpportunity = Math.max(0, targetPrice - anchorPrice);
  } else {
    classification = 'healthy';
    unitOpportunity = 0;
    targetPrice = anchorPrice;
  }

  const dollarOpportunity = anchorVolume > 0 ? unitOpportunity * anchorVolume : 0;

  return {
    classification,
    anchorMarginPercent,
    targetMarginPercent,
    unitOpportunity,
    targetPriceIncrease: unitOpportunity,
    targetPrice,
    dollarOpportunity,
  };
}

function deriveRowStatus(
  winningMethod: WinningMethod | null,
  bleederLeaker: BleederLeakerResult,
): RowOpportunityStatus {
  if (bleederLeaker.classification === 'no_data' && winningMethod === null) {
    return 'no_data';
  }
  if (winningMethod === 'margin_erosion') {
    return 'erosion';
  }
  if (bleederLeaker.classification === 'bleeder') return 'bleeder';
  if (bleederLeaker.classification === 'leaker') return 'leaker';
  return 'healthy';
}

function pickAutoWinner(
  marginErosionByFrame: MarginErosionFrameResult[],
  bleederLeaker: BleederLeakerResult,
): {
  winningMethod: WinningMethod | null;
  winningFrameId: OpportunityFrameId | null;
  winningFrameLabel: string | null;
  fullPotential: number;
  targetPrice: number | null;
  targetPriceIncrease: number | null;
} {
  let bestErosion: MarginErosionFrameResult | null = null;
  for (const frame of marginErosionByFrame) {
    if (!bestErosion || frame.dollarOpportunity > bestErosion.dollarOpportunity) {
      bestErosion = frame;
    }
  }

  const bestErosionAmount = bestErosion?.dollarOpportunity ?? 0;
  const bleederAmount = bleederLeaker.dollarOpportunity;

  if (bestErosionAmount >= bleederAmount && bestErosionAmount > 0) {
    return {
      winningMethod: 'margin_erosion',
      winningFrameId: bestErosion!.frameId,
      winningFrameLabel: bestErosion!.frameLabel,
      fullPotential: bestErosionAmount,
      targetPrice: bestErosion!.targetPrice,
      targetPriceIncrease: bestErosion!.targetPriceIncrease,
    };
  }

  if (bleederAmount > 0) {
    return {
      winningMethod: 'bleeder_leaker',
      winningFrameId: null,
      winningFrameLabel: null,
      fullPotential: bleederAmount,
      targetPrice: bleederLeaker.targetPrice,
      targetPriceIncrease: bleederLeaker.targetPriceIncrease,
    };
  }

  return {
    winningMethod: null,
    winningFrameId: null,
    winningFrameLabel: null,
    fullPotential: 0,
    targetPrice: null,
    targetPriceIncrease: null,
  };
}

function applySelectedBasis(
  basis: OpportunityBasisId,
  marginErosionByFrame: MarginErosionFrameResult[],
  bleederLeaker: BleederLeakerResult,
  anchorPrice: number,
  anchorVolume: number,
  anchorTotalCost: number,
  settings: OpportunitySettings,
): {
  winningMethod: WinningMethod | null;
  winningFrameId: OpportunityFrameId | null;
  winningFrameLabel: string | null;
  fullPotential: number;
  targetPrice: number | null;
  targetPriceIncrease: number | null;
  bleederLeaker: BleederLeakerResult;
} {
  if (basis === 'auto') {
    const auto = pickAutoWinner(marginErosionByFrame, bleederLeaker);
    return { ...auto, bleederLeaker };
  }

  if (basis === 'exclude') {
    const auto = pickAutoWinner(marginErosionByFrame, bleederLeaker);
    return {
      ...auto,
      fullPotential: 0,
      targetPrice: null,
      targetPriceIncrease: null,
      winningMethod: null,
      winningFrameId: null,
      winningFrameLabel: null,
      bleederLeaker,
    };
  }

  if (basis === 'bleeder') {
    const forced = sizeBleederLeaker(anchorPrice, anchorVolume, anchorTotalCost, settings.targetEbitMarginPercent, 'bleeder');
    return {
      winningMethod: 'bleeder_leaker',
      winningFrameId: null,
      winningFrameLabel: null,
      fullPotential: forced.dollarOpportunity,
      targetPrice: forced.targetPrice,
      targetPriceIncrease: forced.targetPriceIncrease,
      bleederLeaker: forced,
    };
  }

  if (basis === 'leaker') {
    const forced = sizeBleederLeaker(anchorPrice, anchorVolume, anchorTotalCost, settings.targetEbitMarginPercent, 'leaker');
    return {
      winningMethod: 'bleeder_leaker',
      winningFrameId: null,
      winningFrameLabel: null,
      fullPotential: forced.dollarOpportunity,
      targetPrice: forced.targetPrice,
      targetPriceIncrease: forced.targetPriceIncrease,
      bleederLeaker: forced,
    };
  }

  const frame = marginErosionByFrame.find((f) => f.frameId === basis);
  return {
    winningMethod: 'margin_erosion',
    winningFrameId: basis,
    winningFrameLabel: frame?.frameLabel ?? frameLabel(basis),
    fullPotential: frame?.dollarOpportunity ?? 0,
    targetPrice: frame?.targetPrice ?? null,
    targetPriceIncrease: frame?.targetPriceIncrease ?? null,
    bleederLeaker,
  };
}

export function sizeRowOpportunity(
  record: PartProgramRecord,
  anchorYear: number,
  frames: OpportunityFrameId[],
  settings: OpportunitySettings = DEFAULT_OPPORTUNITY_SETTINGS,
  override?: RowOpportunityOverride,
): RowOpportunityResult {
  const currency = normalizeCurrencyCode(record.metadata.Currency);
  const anchorMetrics = getAnchorMetrics(record, anchorYear);
  const anchorPrice = anchorMetrics?.avgPrice ?? null;
  const anchorVolume = anchorMetrics?.volume ?? null;
  const anchorCostsRaw = anchorMetrics?.costs ?? {};
  const anchorCosts = presentCosts(anchorCostsRaw);
  const anchorTotalCost = sumPresentCosts(anchorCosts);

  const emptyBleeder: BleederLeakerResult = {
    classification: 'no_data',
    anchorMarginPercent: null,
    targetMarginPercent: settings.targetEbitMarginPercent,
    unitOpportunity: 0,
    targetPriceIncrease: 0,
    targetPrice: null,
    dollarOpportunity: 0,
  };

  const emptyRow = (status: RowOpportunityStatus): RowOpportunityResult => ({
    recordId: record.id,
    metadata: record.metadata,
    currency,
    anchorYear,
    anchorPrice,
    anchorVolume,
    anchorTotalCost,
    anchorEbitMarginPercent: computeEbitMarginPercent(anchorPrice, anchorTotalCost),
    status,
    marginErosionByFrame: [],
    bleederLeaker: emptyBleeder,
    autoWinningMethod: null,
    autoWinningFrameId: null,
    autoWinningFrameLabel: null,
    autoFullPotential: 0,
    winningMethod: null,
    winningFrameId: null,
    winningFrameLabel: null,
    selectedBasis: override?.basis ?? 'auto',
    targetPrice: null,
    targetPriceIncrease: null,
    fullPotential: 0,
    commercialRecovery: 0,
    excluded: override?.excluded ?? false,
  });

  if (anchorPrice === null || anchorVolume === null || anchorTotalCost === null) {
    return emptyRow('no_data');
  }

  const marginErosionByFrame = frames.map((frameId) => {
    const reference = getReferenceMetrics(record, frameId, anchorYear);
    const referencePrice = reference?.avgPrice ?? null;
    const referenceCosts = presentCosts(reference?.costs ?? {});
    return sizeMarginErosionFrame(
      anchorPrice,
      anchorVolume,
      anchorCosts,
      referencePrice,
      referenceCosts,
      frameId,
    );
  });

  const bleederLeaker = sizeBleederLeaker(
    anchorPrice,
    anchorVolume,
    anchorTotalCost,
    settings.targetEbitMarginPercent,
  );

  const auto = pickAutoWinner(marginErosionByFrame, bleederLeaker);
  const excluded = override?.excluded === true || override?.basis === 'exclude';
  const selectedBasis: OpportunityBasisId = excluded
    ? 'exclude'
    : (override?.basis ?? 'auto');
  const effective = applySelectedBasis(
    selectedBasis,
    marginErosionByFrame,
    bleederLeaker,
    anchorPrice,
    anchorVolume,
    anchorTotalCost,
    settings,
  );

  const fullPotential = effective.fullPotential;
  const commercialRecovery = override?.excluded
    ? 0
    : fullPotential * (settings.externalFactorPercent / 100) * (settings.captureRatePercent / 100);

  const effectiveBleeder =
    selectedBasis === 'bleeder' || selectedBasis === 'leaker'
      ? effective.bleederLeaker
      : bleederLeaker;

  const winningMethod = effective.winningMethod;
  let status: RowOpportunityStatus;
  if (selectedBasis === 'bleeder') {
    status = fullPotential > 0 ? 'bleeder' : 'healthy';
  } else if (selectedBasis === 'leaker') {
    status = fullPotential > 0 ? 'leaker' : 'healthy';
  } else if (winningMethod === 'margin_erosion') {
    status = fullPotential > 0 ? 'erosion' : 'healthy';
  } else {
    status = deriveRowStatus(winningMethod, effectiveBleeder);
  }

  return {
    recordId: record.id,
    metadata: record.metadata,
    currency,
    anchorYear,
    anchorPrice,
    anchorVolume,
    anchorTotalCost,
    anchorEbitMarginPercent: computeEbitMarginPercent(anchorPrice, anchorTotalCost),
    status,
    marginErosionByFrame,
    bleederLeaker: effectiveBleeder,
    autoWinningMethod: auto.winningMethod,
    autoWinningFrameId: auto.winningFrameId,
    autoWinningFrameLabel: auto.winningFrameLabel,
    autoFullPotential: auto.fullPotential,
    winningMethod,
    winningFrameId: effective.winningFrameId,
    winningFrameLabel: effective.winningFrameLabel,
    selectedBasis,
    targetPrice: effective.targetPrice,
    targetPriceIncrease: effective.targetPriceIncrease,
    fullPotential,
    commercialRecovery,
    excluded: override?.excluded ?? false,
  };
}

export function sizePortfolioOpportunity(
  records: PartProgramRecord[],
  anchorYear: number,
  hasAtQuote: boolean,
  historicalYears: number[],
  settings: OpportunitySettings = DEFAULT_OPPORTUNITY_SETTINGS,
  overrides: RowOpportunityOverrides = {},
): PortfolioOpportunityResult {
  const frames = buildOpportunityFrames(anchorYear, hasAtQuote, historicalYears);
  const rows = records.map((record) =>
    sizeRowOpportunity(record, anchorYear, frames, settings, overrides[record.id]),
  );

  let totalFullPotential = 0;
  let totalCommercialRecovery = 0;
  let rowsWithOpportunity = 0;
  const compositionByWinner: Record<string, number> = {};

  for (const row of rows) {
    if (row.excluded) continue;

    totalFullPotential += row.fullPotential;
    totalCommercialRecovery += row.commercialRecovery;
    if (row.fullPotential > 0) {
      rowsWithOpportunity += 1;
    }

    if (row.commercialRecovery <= 0) continue;

    const winnerKey =
      row.winningMethod === 'margin_erosion' && row.winningFrameLabel
        ? row.winningFrameLabel
        : row.winningMethod === 'bleeder_leaker'
          ? row.bleederLeaker.classification === 'bleeder'
            ? 'Bleeder'
            : 'Leaker'
          : 'Other';

    compositionByWinner[winnerKey] = (compositionByWinner[winnerKey] ?? 0) + row.commercialRecovery;
  }

  return {
    settings,
    anchorYear,
    rows,
    totalFullPotential,
    totalCommercialRecovery,
    rowsWithOpportunity,
    compositionByWinner,
  };
}

export function getWinningBasisLabel(row: RowOpportunityResult): string {
  if (row.selectedBasis === 'exclude' || row.excluded) return 'Excluded';
  if (row.selectedBasis !== 'auto') {
    if (row.selectedBasis === 'bleeder') return 'Bleeder recovery';
    if (row.selectedBasis === 'leaker') return 'Leaker recovery';
    if (row.winningFrameLabel) return `vs ${row.winningFrameLabel}`;
  }
  if (row.autoWinningMethod === 'margin_erosion' && row.autoWinningFrameLabel) {
    return `vs ${row.autoWinningFrameLabel} (auto)`;
  }
  if (row.autoWinningMethod === 'bleeder_leaker') {
    if (row.bleederLeaker.classification === 'bleeder') return 'Bleeder recovery (auto)';
    if (row.bleederLeaker.classification === 'leaker') return 'Leaker recovery (auto)';
  }
  if (row.winningMethod === 'margin_erosion' && row.winningFrameLabel) {
    return `vs ${row.winningFrameLabel}`;
  }
  if (row.status === 'no_data') return 'No data';
  return '—';
}

export function anchorYearLabel(year: number, suffix = 'actual'): string {
  return `${year} ${suffix}`;
}
