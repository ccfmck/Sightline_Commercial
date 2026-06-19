import type {
  BleederLeakerResult,
  MarginPercentBasisId,
  MarginPercentFrameDetail,
  MarginPercentGapResult,
  MarginPercentSettings,
  OpportunityFrameId,
  OpportunitySettings,
  PartProgramRecord,
  PortfolioMarginPercentOpportunityResult,
  RowMarginPercentOpportunityResult,
  RowMarginPercentOverride,
  RowMarginPercentOverrides,
  RowMarginPercentStatus,
  MarginPercentWinningMethod,
} from '../types';
import { DEFAULT_OPPORTUNITY_SETTINGS } from '../types';
import { normalizeCurrencyCode } from './currency';
import {
  computeEbitMarginPercent,
  computeMarginPercent,
  sumCostsForMarginLevel,
  sumPresentCosts,
} from './metrics';
import { optimizeForLabel } from './marginComponentDefaults';
import {
  buildOpportunityFrames,
  sizeBleederLeaker,
} from './opportunitySizing';
import { getRecordPeriodMetrics } from './recordMetrics';

function frameLabel(frameId: OpportunityFrameId): string {
  if (frameId === 'at_quote') return 'At Quote';
  return String(frameId);
}

function presentCosts(costs: Record<string, number | null>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(costs).filter((entry): entry is [string, number] => {
      const value = entry[1];
      return value !== null && value !== undefined;
    }),
  );
}

function getAnchorMetrics(record: PartProgramRecord, anchorYear: number) {
  return record.periods[String(anchorYear) as `${number}`] ?? null;
}

function getReferenceMetrics(
  record: PartProgramRecord,
  frameId: OpportunityFrameId,
  anchorYear: number,
) {
  return getRecordPeriodMetrics(record, frameId, anchorYear);
}

export function buildMarginPercentBasisOptions(
  frames: OpportunityFrameId[],
): { id: MarginPercentBasisId; label: string }[] {
  const options: { id: MarginPercentBasisId; label: string }[] = [
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

function computeFrameOpportunity(
  anchorPrice: number,
  anchorVolume: number,
  anchorMarginPercent: number,
  anchorMarginCost: number,
  targetMarginPercent: number | null,
): { unitOpportunity: number; targetPrice: number; dollarOpportunity: number } {
  if (targetMarginPercent === null || anchorMarginPercent >= targetMarginPercent) {
    return { unitOpportunity: 0, targetPrice: anchorPrice, dollarOpportunity: 0 };
  }

  const targetFactor = 1 - targetMarginPercent / 100;
  if (targetFactor <= 0) {
    return { unitOpportunity: 0, targetPrice: anchorPrice, dollarOpportunity: 0 };
  }

  const targetPrice = anchorMarginCost / targetFactor;
  const unitOpportunity = Math.max(0, targetPrice - anchorPrice);
  const dollarOpportunity = anchorVolume > 0 ? unitOpportunity * anchorVolume : 0;
  return { unitOpportunity, targetPrice, dollarOpportunity };
}

export function sizeMarginPercentGap(
  anchorPrice: number,
  anchorVolume: number,
  anchorCosts: Record<string, number>,
  frames: { frameId: OpportunityFrameId; price: number | null; costs: Record<string, number> }[],
  settings: MarginPercentSettings,
): MarginPercentGapResult {
  const base: MarginPercentGapResult = {
    optimizeFor: settings.optimizeFor,
    anchorMarginCost: null,
    anchorMarginPercent: null,
    marginPercentByFrame: [],
    bestReferenceFrameId: null,
    bestReferenceFrameLabel: null,
    bestReferenceMarginPercent: null,
    unitOpportunity: 0,
    targetPriceIncrease: 0,
    targetPrice: anchorPrice,
    dollarOpportunity: 0,
    skipped: false,
  };

  const anchorMarginCost = sumCostsForMarginLevel(
    anchorCosts,
    settings.componentLevels,
    settings.optimizeFor,
  );

  if (anchorMarginCost === null) {
    return {
      ...base,
      skipped: true,
      skipReason: 'Missing anchor margin cost components',
    };
  }

  const anchorMarginPercent = computeMarginPercent(anchorPrice, anchorMarginCost);
  if (anchorMarginPercent === null) {
    return {
      ...base,
      anchorMarginCost,
      skipped: true,
      skipReason: 'Missing or invalid anchor price',
    };
  }

  const marginPercentByFrame: MarginPercentFrameDetail[] = [];
  let bestReferenceFrameId: OpportunityFrameId | null = null;
  let bestReferenceFrameLabel: string | null = null;
  let bestReferenceMarginPercent: number | null = null;

  for (const frame of frames) {
    const referenceMarginCost = sumCostsForMarginLevel(
      frame.costs,
      settings.componentLevels,
      settings.optimizeFor,
    );

    if (frame.price === null || frame.price <= 0 || referenceMarginCost === null) {
      marginPercentByFrame.push({
        frameId: frame.frameId,
        frameLabel: frameLabel(frame.frameId),
        referencePrice: frame.price,
        referenceMarginCost,
        referenceMarginPercent: null,
        unitOpportunity: 0,
        targetPrice: anchorPrice,
        dollarOpportunity: 0,
        skipped: true,
        skipReason: 'Missing or invalid reference price or margin cost',
      });
      continue;
    }

    const referenceMarginPercent = computeMarginPercent(frame.price, referenceMarginCost);
    const frameOpportunity = computeFrameOpportunity(
      anchorPrice,
      anchorVolume,
      anchorMarginPercent,
      anchorMarginCost,
      referenceMarginPercent,
    );

    marginPercentByFrame.push({
      frameId: frame.frameId,
      frameLabel: frameLabel(frame.frameId),
      referencePrice: frame.price,
      referenceMarginCost,
      referenceMarginPercent,
      unitOpportunity: frameOpportunity.unitOpportunity,
      targetPrice: frameOpportunity.targetPrice,
      dollarOpportunity: frameOpportunity.dollarOpportunity,
      skipped: false,
    });

    if (
      referenceMarginPercent !== null &&
      (bestReferenceMarginPercent === null || referenceMarginPercent > bestReferenceMarginPercent)
    ) {
      bestReferenceMarginPercent = referenceMarginPercent;
      bestReferenceFrameId = frame.frameId;
      bestReferenceFrameLabel = frameLabel(frame.frameId);
    }
  }

  if (bestReferenceMarginPercent === null) {
    return {
      ...base,
      anchorMarginCost,
      anchorMarginPercent,
      marginPercentByFrame,
      skipped: true,
      skipReason: 'No valid reference frames for margin comparison',
    };
  }

  let bestFrameOpportunity = marginPercentByFrame.reduce<MarginPercentFrameDetail | null>(
    (best, frame) => {
      if (frame.skipped) return best;
      if (!best || frame.dollarOpportunity > best.dollarOpportunity) return frame;
      return best;
    },
    null,
  );

  if (!bestFrameOpportunity || bestFrameOpportunity.dollarOpportunity <= 0) {
    bestFrameOpportunity =
      marginPercentByFrame.find((f) => f.frameId === bestReferenceFrameId && !f.skipped) ??
      bestFrameOpportunity;
  }

  const unitOpportunity = bestFrameOpportunity?.unitOpportunity ?? 0;
  const targetPrice = bestFrameOpportunity?.targetPrice ?? anchorPrice;
  const dollarOpportunity = bestFrameOpportunity?.dollarOpportunity ?? 0;

  return {
    optimizeFor: settings.optimizeFor,
    anchorMarginCost,
    anchorMarginPercent,
    marginPercentByFrame,
    bestReferenceFrameId,
    bestReferenceFrameLabel,
    bestReferenceMarginPercent,
    unitOpportunity,
    targetPriceIncrease: unitOpportunity,
    targetPrice,
    dollarOpportunity,
    skipped: false,
  };
}

function pickAutoWinner(
  marginPercentGap: MarginPercentGapResult,
  bleederLeaker: BleederLeakerResult,
): {
  winningMethod: MarginPercentWinningMethod | null;
  winningFrameLabel: string | null;
  fullPotential: number;
  targetPrice: number | null;
  targetPriceIncrease: number | null;
} {
  const gapAmount = marginPercentGap.dollarOpportunity;
  const bleederAmount = bleederLeaker.dollarOpportunity;

  if (gapAmount >= bleederAmount && gapAmount > 0) {
    return {
      winningMethod: 'margin_percent_gap',
      winningFrameLabel: marginPercentGap.bestReferenceFrameLabel,
      fullPotential: gapAmount,
      targetPrice: marginPercentGap.targetPrice,
      targetPriceIncrease: marginPercentGap.targetPriceIncrease,
    };
  }

  if (bleederAmount > 0) {
    return {
      winningMethod: 'bleeder_leaker',
      winningFrameLabel: null,
      fullPotential: bleederAmount,
      targetPrice: bleederLeaker.targetPrice,
      targetPriceIncrease: bleederLeaker.targetPriceIncrease,
    };
  }

  return {
    winningMethod: null,
    winningFrameLabel: null,
    fullPotential: 0,
    targetPrice: null,
    targetPriceIncrease: null,
  };
}

function isFrameBasis(basis: MarginPercentBasisId): basis is OpportunityFrameId {
  return basis !== 'auto' && basis !== 'exclude' && basis !== 'bleeder' && basis !== 'leaker';
}

function applySelectedBasis(
  basis: MarginPercentBasisId,
  marginPercentGap: MarginPercentGapResult,
  bleederLeaker: BleederLeakerResult,
  anchorPrice: number,
  anchorVolume: number,
  anchorTotalCost: number,
  settings: OpportunitySettings,
): {
  winningMethod: MarginPercentWinningMethod | null;
  winningFrameLabel: string | null;
  fullPotential: number;
  targetPrice: number | null;
  targetPriceIncrease: number | null;
  bleederLeaker: BleederLeakerResult;
} {
  if (basis === 'auto') {
    const auto = pickAutoWinner(marginPercentGap, bleederLeaker);
    return { ...auto, bleederLeaker };
  }

  if (basis === 'exclude') {
    const auto = pickAutoWinner(marginPercentGap, bleederLeaker);
    return {
      ...auto,
      fullPotential: 0,
      targetPrice: null,
      targetPriceIncrease: null,
      winningMethod: null,
      winningFrameLabel: null,
      bleederLeaker,
    };
  }

  if (basis === 'bleeder') {
    const forced = sizeBleederLeaker(
      anchorPrice,
      anchorVolume,
      anchorTotalCost,
      settings.targetEbitMarginPercent,
      'bleeder',
    );
    return {
      winningMethod: 'bleeder_leaker',
      winningFrameLabel: null,
      fullPotential: forced.dollarOpportunity,
      targetPrice: forced.targetPrice,
      targetPriceIncrease: forced.targetPriceIncrease,
      bleederLeaker: forced,
    };
  }

  if (basis === 'leaker') {
    const forced = sizeBleederLeaker(
      anchorPrice,
      anchorVolume,
      anchorTotalCost,
      settings.targetEbitMarginPercent,
      'leaker',
    );
    return {
      winningMethod: 'bleeder_leaker',
      winningFrameLabel: null,
      fullPotential: forced.dollarOpportunity,
      targetPrice: forced.targetPrice,
      targetPriceIncrease: forced.targetPriceIncrease,
      bleederLeaker: forced,
    };
  }

  if (isFrameBasis(basis)) {
    const frame = marginPercentGap.marginPercentByFrame.find((f) => f.frameId === basis);
    return {
      winningMethod: 'margin_percent_gap',
      winningFrameLabel: frame?.frameLabel ?? frameLabel(basis),
      fullPotential: frame?.dollarOpportunity ?? 0,
      targetPrice: frame?.targetPrice ?? null,
      targetPriceIncrease: frame?.unitOpportunity ?? null,
      bleederLeaker,
    };
  }

  const auto = pickAutoWinner(marginPercentGap, bleederLeaker);
  return { ...auto, bleederLeaker };
}

function deriveRowStatus(
  winningMethod: MarginPercentWinningMethod | null,
  bleederLeaker: BleederLeakerResult,
): RowMarginPercentStatus {
  if (bleederLeaker.classification === 'no_data' && winningMethod === null) {
    return 'no_data';
  }
  if (winningMethod === 'margin_percent_gap') {
    return 'margin_gap';
  }
  if (bleederLeaker.classification === 'bleeder') return 'bleeder';
  if (bleederLeaker.classification === 'leaker') return 'leaker';
  return 'healthy';
}

export function sizeRowMarginPercentOpportunity(
  record: PartProgramRecord,
  anchorYear: number,
  frames: OpportunityFrameId[],
  opportunitySettings: OpportunitySettings = DEFAULT_OPPORTUNITY_SETTINGS,
  marginPercentSettings: MarginPercentSettings,
  override?: RowMarginPercentOverride,
): RowMarginPercentOpportunityResult {
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
    targetMarginPercent: opportunitySettings.targetEbitMarginPercent,
    unitOpportunity: 0,
    targetPriceIncrease: 0,
    targetPrice: null,
    dollarOpportunity: 0,
  };

  const emptyGap: MarginPercentGapResult = {
    optimizeFor: marginPercentSettings.optimizeFor,
    anchorMarginCost: null,
    anchorMarginPercent: null,
    marginPercentByFrame: [],
    bestReferenceFrameId: null,
    bestReferenceFrameLabel: null,
    bestReferenceMarginPercent: null,
    unitOpportunity: 0,
    targetPriceIncrease: 0,
    targetPrice: 0,
    dollarOpportunity: 0,
    skipped: true,
    skipReason: 'No anchor data',
  };

  const emptyRow = (status: RowMarginPercentStatus): RowMarginPercentOpportunityResult => ({
    recordId: record.id,
    metadata: record.metadata,
    currency,
    anchorYear,
    anchorPrice,
    anchorVolume,
    anchorTotalCost,
    anchorEbitMarginPercent: computeEbitMarginPercent(anchorPrice, anchorTotalCost),
    status,
    marginPercentGap: emptyGap,
    bleederLeaker: emptyBleeder,
    autoWinningMethod: null,
    autoWinningFrameLabel: null,
    autoFullPotential: 0,
    winningMethod: null,
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

  const frameInputs = frames.map((frameId) => {
    const reference = getReferenceMetrics(record, frameId, anchorYear);
    return {
      frameId,
      price: reference?.avgPrice ?? null,
      costs: presentCosts(reference?.costs ?? {}),
    };
  });

  const marginPercentGap = sizeMarginPercentGap(
    anchorPrice,
    anchorVolume,
    anchorCosts,
    frameInputs,
    marginPercentSettings,
  );

  const bleederLeaker = sizeBleederLeaker(
    anchorPrice,
    anchorVolume,
    anchorTotalCost,
    opportunitySettings.targetEbitMarginPercent,
  );

  const auto = pickAutoWinner(marginPercentGap, bleederLeaker);
  const excluded = override?.excluded === true || override?.basis === 'exclude';
  const selectedBasis: MarginPercentBasisId = excluded ? 'exclude' : (override?.basis ?? 'auto');
  const effective = applySelectedBasis(
    selectedBasis,
    marginPercentGap,
    bleederLeaker,
    anchorPrice,
    anchorVolume,
    anchorTotalCost,
    opportunitySettings,
  );

  const fullPotential = effective.fullPotential;
  const commercialRecovery = override?.excluded
    ? 0
    : fullPotential *
      (opportunitySettings.externalFactorPercent / 100) *
      (opportunitySettings.captureRatePercent / 100);

  const effectiveBleeder =
    selectedBasis === 'bleeder' || selectedBasis === 'leaker'
      ? effective.bleederLeaker
      : bleederLeaker;

  const winningMethod = effective.winningMethod;
  let status: RowMarginPercentStatus;
  if (selectedBasis === 'bleeder') {
    status = fullPotential > 0 ? 'bleeder' : 'healthy';
  } else if (selectedBasis === 'leaker') {
    status = fullPotential > 0 ? 'leaker' : 'healthy';
  } else if (winningMethod === 'margin_percent_gap') {
    status = fullPotential > 0 ? 'margin_gap' : 'healthy';
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
    marginPercentGap,
    bleederLeaker: effectiveBleeder,
    autoWinningMethod: auto.winningMethod,
    autoWinningFrameLabel: auto.winningFrameLabel,
    autoFullPotential: auto.fullPotential,
    winningMethod,
    winningFrameLabel: effective.winningFrameLabel,
    selectedBasis,
    targetPrice: effective.targetPrice,
    targetPriceIncrease: effective.targetPriceIncrease,
    fullPotential,
    commercialRecovery,
    excluded: override?.excluded ?? false,
  };
}

export function sizePortfolioMarginPercentOpportunity(
  records: PartProgramRecord[],
  anchorYear: number,
  hasAtQuote: boolean,
  historicalYears: number[],
  opportunitySettings: OpportunitySettings = DEFAULT_OPPORTUNITY_SETTINGS,
  marginPercentSettings: MarginPercentSettings,
  overrides: RowMarginPercentOverrides = {},
): PortfolioMarginPercentOpportunityResult {
  const frames = buildOpportunityFrames(anchorYear, hasAtQuote, historicalYears);
  const rows = records.map((record) =>
    sizeRowMarginPercentOpportunity(
      record,
      anchorYear,
      frames,
      opportunitySettings,
      marginPercentSettings,
      overrides[record.id],
    ),
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
      row.winningMethod === 'margin_percent_gap' && row.winningFrameLabel
        ? `vs ${row.winningFrameLabel}`
        : row.winningMethod === 'bleeder_leaker'
          ? row.bleederLeaker.classification === 'bleeder'
            ? 'Bleeder'
            : 'Leaker'
          : 'Other';

    compositionByWinner[winnerKey] = (compositionByWinner[winnerKey] ?? 0) + row.commercialRecovery;
  }

  return {
    settings: opportunitySettings,
    marginPercentSettings,
    anchorYear,
    rows,
    totalFullPotential,
    totalCommercialRecovery,
    rowsWithOpportunity,
    compositionByWinner,
  };
}

export function getMarginPercentWinningBasisLabel(row: RowMarginPercentOpportunityResult): string {
  if (row.selectedBasis === 'exclude' || row.excluded) return 'Excluded';
  if (row.selectedBasis !== 'auto') {
    if (row.selectedBasis === 'bleeder') return 'Bleeder recovery';
    if (row.selectedBasis === 'leaker') return 'Leaker recovery';
    if (row.winningFrameLabel) return `vs ${row.winningFrameLabel}`;
  }
  if (row.autoWinningMethod === 'margin_percent_gap' && row.autoWinningFrameLabel) {
    return `vs ${row.autoWinningFrameLabel} (auto)`;
  }
  if (row.autoWinningMethod === 'bleeder_leaker') {
    if (row.bleederLeaker.classification === 'bleeder') return 'Bleeder recovery (auto)';
    if (row.bleederLeaker.classification === 'leaker') return 'Leaker recovery (auto)';
  }
  if (row.winningMethod === 'margin_percent_gap' && row.winningFrameLabel) {
    return `vs ${row.winningFrameLabel}`;
  }
  if (row.status === 'no_data') return 'No data';
  return '—';
}

export function marginGapStatusLabel(status: RowMarginPercentStatus): string {
  switch (status) {
    case 'margin_gap':
      return 'Margin gap';
    case 'bleeder':
      return 'Bleeder';
    case 'leaker':
      return 'Leaker';
    case 'healthy':
      return 'Healthy';
    default:
      return 'No data';
  }
}

export { optimizeForLabel };
