import { Fragment, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type {
  AppDisplaySettings,
  MarginPercentBasisId,
  MarginPercentSettings,
  OpportunitySettings,
  PortfolioMarginPercentOpportunityResult,
  RowMarginPercentOpportunityResult,
  RowMarginPercentOverride,
  RowMarginPercentOverrides,
  RowMarginPercentStatus,
} from '../types';
import { convertToDisplayCurrency, getDisplayCurrencyCode } from '../lib/currency';
import { formatCurrency, formatMarginPercent, formatUnitValueWithCurrency } from '../lib/format';
import { getCostComponentColor } from '../lib/chartColors';
import {
  getMarginPercentWinningBasisLabel,
  marginGapStatusLabel,
  optimizeForLabel,
} from '../lib/marginPercentSizing';
import { anchorYearLabel } from '../lib/opportunitySizing';
import { MarginPercentDetailDrawer } from './MarginPercentDetailDrawer';
import { PAGE_CHROME_OFFSET } from './tabSections';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValueLeft,
} from './ui/select';
import { dataTableClassName, TableHeaderCell } from './ui/table-header-cell';
import { cn } from '../lib/utils';

type SortKey =
  | 'commercialRecovery'
  | 'fullPotential'
  | 'oem'
  | 'program'
  | 'part'
  | 'anchorPrice'
  | 'anchorMargin';
type SortDir = 'asc' | 'desc';

interface MarginPercentOpportunityPanelProps {
  portfolio: PortfolioMarginPercentOpportunityResult;
  settings: OpportunitySettings;
  marginPercentSettings: MarginPercentSettings;
  displaySettings: AppDisplaySettings;
  nonUsdCurrencies: string[];
  basisOptions: { id: MarginPercentBasisId; label: string }[];
  rowOverrides: RowMarginPercentOverrides;
  onRowOverrideChange: (recordId: string, override: RowMarginPercentOverride) => void;
  highlightedRecordIds?: Set<string>;
}

function statusBadgeVariant(status: RowMarginPercentStatus) {
  switch (status) {
    case 'bleeder':
      return 'default';
    case 'leaker':
      return 'accent';
    case 'margin_gap':
      return 'secondary';
    case 'healthy':
      return 'outline';
    default:
      return 'outline';
  }
}

function formatRowMoney(
  amount: number,
  row: RowMarginPercentOpportunityResult,
  displaySettings: AppDisplaySettings,
): string {
  const converted = convertToDisplayCurrency(amount, row.currency, displaySettings);
  const code = getDisplayCurrencyCode(row.currency, displaySettings);
  return formatCurrency(converted, code);
}

function formatRowUnit(
  amount: number | null | undefined,
  row: RowMarginPercentOpportunityResult,
  displaySettings: AppDisplaySettings,
): string {
  if (amount === null || amount === undefined) return '—';
  const converted = convertToDisplayCurrency(amount, row.currency, displaySettings);
  const code = getDisplayCurrencyCode(row.currency, displaySettings);
  return formatUnitValueWithCurrency(converted, code);
}

function getBasisSelectValue(
  override: RowMarginPercentOverride | undefined,
  row: RowMarginPercentOpportunityResult,
): MarginPercentBasisId {
  if (override?.basis === 'exclude' || override?.excluded || row.excluded) return 'exclude';
  return override?.basis ?? row.selectedBasis ?? 'auto';
}

function sortRows(
  rows: RowMarginPercentOpportunityResult[],
  sortKey: SortKey,
  sortDir: SortDir,
): RowMarginPercentOpportunityResult[] {
  const sorted = [...rows];
  const dir = sortDir === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (sortKey) {
      case 'commercialRecovery':
        return (a.commercialRecovery - b.commercialRecovery) * dir;
      case 'fullPotential':
        return (a.fullPotential - b.fullPotential) * dir;
      case 'anchorPrice':
        return ((a.anchorPrice ?? 0) - (b.anchorPrice ?? 0)) * dir;
      case 'anchorMargin':
        return (
          ((a.marginPercentGap.anchorMarginPercent ?? 0) -
            (b.marginPercentGap.anchorMarginPercent ?? 0)) *
          dir
        );
      case 'oem':
        return (a.metadata.OEM ?? '').localeCompare(b.metadata.OEM ?? '') * dir;
      case 'program':
        return (a.metadata['Program Name'] ?? '').localeCompare(b.metadata['Program Name'] ?? '') * dir;
      case 'part':
        return (
          (a.metadata['Part description'] ?? a.metadata['Part number'] ?? '')
            .localeCompare(b.metadata['Part description'] ?? b.metadata['Part number'] ?? '')
        ) * dir;
      default:
        return 0;
    }
  });

  return sorted;
}

function sortKeyLabel(key: SortKey): string {
  switch (key) {
    case 'commercialRecovery':
      return 'Recovery target';
    case 'fullPotential':
      return 'Full potential';
    case 'anchorPrice':
      return 'Anchor price';
    case 'anchorMargin':
      return 'Anchor margin %';
    case 'oem':
      return 'OEM';
    case 'program':
      return 'Program';
    case 'part':
      return 'Part';
    default:
      return key;
  }
}

function formatPercentInput(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

export function MarginPercentOpportunityPanel({
  portfolio,
  settings,
  marginPercentSettings,
  displaySettings,
  nonUsdCurrencies,
  basisOptions,
  rowOverrides,
  onRowOverrideChange,
  highlightedRecordIds,
}: MarginPercentOpportunityPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('commercialRecovery');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [rowOrder, setRowOrder] = useState<string[]>([]);

  const rowOrderKey = portfolio.rows.map((row) => row.recordId).join('|');

  useEffect(() => {
    const sorted = sortRows(portfolio.rows, 'commercialRecovery', 'desc');
    setRowOrder(sorted.map((row) => row.recordId));
    setSortKey('commercialRecovery');
    setSortDir('desc');
  }, [rowOrderKey]);

  const displayRows = useMemo(() => {
    const byId = new Map(portfolio.rows.map((row) => [row.recordId, row]));
    const ordered = rowOrder
      .map((id) => byId.get(id))
      .filter((row): row is RowMarginPercentOpportunityResult => row !== undefined);

    for (const row of portfolio.rows) {
      if (!rowOrder.includes(row.recordId)) {
        ordered.push(row);
      }
    }

    return ordered;
  }, [portfolio.rows, rowOrder]);

  const anchorLabel = anchorYearLabel(portfolio.anchorYear);
  const effectiveRecoveryPct =
    (settings.externalFactorPercent * settings.captureRatePercent) / 100;
  const optimizeLabel = optimizeForLabel(marginPercentSettings.optimizeFor);

  const displayTotals = useMemo(() => {
    let totalFullPotential = 0;
    let totalCommercialRecovery = 0;
    let rowsWithOpportunity = 0;
    const compositionByWinner: Record<string, number> = {};

    for (const row of portfolio.rows) {
      if (row.excluded) continue;

      const fullPotential = convertToDisplayCurrency(row.fullPotential, row.currency, displaySettings);
      const commercialRecovery = convertToDisplayCurrency(
        row.commercialRecovery,
        row.currency,
        displaySettings,
      );

      totalFullPotential += fullPotential;
      totalCommercialRecovery += commercialRecovery;
      if (row.fullPotential > 0) rowsWithOpportunity += 1;

      if (commercialRecovery <= 0) continue;

      const winnerKey =
        row.winningMethod === 'margin_percent_gap' && row.winningFrameLabel
          ? row.winningFrameLabel
          : row.winningMethod === 'bleeder_leaker'
            ? row.bleederLeaker.classification === 'bleeder'
              ? 'Bleeder'
              : 'Leaker'
            : 'Other';

      compositionByWinner[winnerKey] = (compositionByWinner[winnerKey] ?? 0) + commercialRecovery;
    }

    return { totalFullPotential, totalCommercialRecovery, rowsWithOpportunity, compositionByWinner };
  }, [portfolio.rows, displaySettings]);

  const compositionData = useMemo(() => {
    return Object.entries(displayTotals.compositionByWinner)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [displayTotals.compositionByWinner]);

  const compositionChartRow = useMemo(() => {
    const row: Record<string, number | string> = { label: 'Portfolio' };
    for (const entry of compositionData) {
      row[entry.name] = entry.value;
    }
    return row;
  }, [compositionData]);

  const portfolioCurrencyCode =
    displaySettings.displayCurrency === 'USD' ? 'USD' : (nonUsdCurrencies[0] ?? 'USD');

  function setSortPreference(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'commercialRecovery' || key === 'fullPotential' ? 'desc' : 'asc');
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  function toggleExpand(recordId: string) {
    setExpandedId((prev) => (prev === recordId ? null : recordId));
  }

  function applySort() {
    const sorted = sortRows(portfolio.rows, sortKey, sortDir);
    setRowOrder(sorted.map((row) => row.recordId));
  }

  return (
    <Card id="margin-percent-opportunity-sizing" style={{ scrollMarginTop: PAGE_CHROME_OFFSET + 12 }}>
      <CardHeader>
        <CardTitle className="text-base">Commercial Opportunity Sizing</CardTitle>
        <CardDescription>
          Portfolio-wide sizing for all {portfolio.rows.length} parts using{' '}
          {optimizeLabel.toLowerCase()}. Compares anchor-year margin to reference frames and sizes
          price uplift to close the gap. Override the sizing basis per part to true up against a
          specific frame, or choose bleeder/leaker recovery. Bleeder/leaker uses EBIT margin
          regardless of optimize-for selection.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Full potential opportunity
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
              {formatCurrency(displayTotals.totalFullPotential, portfolioCurrencyCode)}
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
              Commercial recovery target
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-950">
              {formatCurrency(displayTotals.totalCommercialRecovery, portfolioCurrencyCode)}
            </p>
            <p className="mt-1 text-xs text-amber-800/80">
              Full potential × {formatPercentInput(settings.externalFactorPercent)} external ×{' '}
              {formatPercentInput(settings.captureRatePercent)} capture ={' '}
              {formatPercentInput(effectiveRecoveryPct)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Parts with opportunity
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
              {displayTotals.rowsWithOpportunity}
              <span className="text-base font-normal text-slate-500"> / {portfolio.rows.length}</span>
            </p>
          </div>
        </div>

        {compositionData.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-900">Recovery by winning basis</h3>
            <div className="h-12 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[compositionChartRow]}
                  layout="vertical"
                  margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="label" hide />
                  <Tooltip
                    formatter={(value) =>
                      formatCurrency(typeof value === 'number' ? value : Number(value), portfolioCurrencyCode)
                    }
                    contentStyle={{ fontSize: 12 }}
                  />
                  {compositionData.map((entry, index) => (
                    <Bar
                      key={entry.name}
                      dataKey={entry.name}
                      stackId="portfolio"
                      fill={getCostComponentColor(index)}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
              {compositionData.map((entry, index) => (
                <span key={entry.name} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: getCostComponentColor(index) }}
                  />
                  {entry.name}: {formatCurrency(entry.value, portfolioCurrencyCode)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Row order stays fixed while you adjust sizing. Click column headers to choose a sort,
              then apply when ready.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={applySort}>
              Sort table by {sortKeyLabel(sortKey)} ({sortDir === 'desc' ? 'high → low' : 'low → high'})
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className={dataTableClassName}>
              <thead>
                <tr>
                  <TableHeaderCell widthClass="w-8" sticky stickyLeft="left-0" />
                  <TableHeaderCell widthClass="w-40" sticky stickyLeft="left-8">
                    Sizing basis
                  </TableHeaderCell>
                  <TableHeaderCell widthClass="w-[4.5rem]" onClick={() => setSortPreference('oem')}>
                    OEM{sortIndicator('oem')}
                  </TableHeaderCell>
                  <TableHeaderCell widthClass="w-[5.5rem]" onClick={() => setSortPreference('program')}>
                    Program{sortIndicator('program')}
                  </TableHeaderCell>
                  <TableHeaderCell widthClass="w-[6.5rem]" onClick={() => setSortPreference('part')}>
                    Part{sortIndicator('part')}
                  </TableHeaderCell>
                  <TableHeaderCell widthClass="w-[4.5rem]">Status</TableHeaderCell>
                  <TableHeaderCell
                    widthClass="w-[5rem]"
                    align="right"
                    onClick={() => setSortPreference('anchorPrice')}
                  >
                    {anchorLabel} price{sortIndicator('anchorPrice')}
                  </TableHeaderCell>
                  <TableHeaderCell
                    widthClass="w-[5rem]"
                    align="right"
                    onClick={() => setSortPreference('anchorMargin')}
                  >
                    {anchorLabel} {optimizeLabel} %{sortIndicator('anchorMargin')}
                  </TableHeaderCell>
                  <TableHeaderCell widthClass="w-[4.5rem]" align="right">
                    Best ref. margin %
                  </TableHeaderCell>
                  <TableHeaderCell widthClass="w-[4.5rem]">Best frame</TableHeaderCell>
                  <TableHeaderCell widthClass="w-[4.5rem]" align="right">
                    {anchorLabel} EBIT %
                  </TableHeaderCell>
                  <TableHeaderCell widthClass="w-[5.5rem]">Winning basis</TableHeaderCell>
                  <TableHeaderCell widthClass="w-[5rem]" align="right">
                    Target price increase
                  </TableHeaderCell>
                  <TableHeaderCell
                    widthClass="w-[5rem]"
                    align="right"
                    onClick={() => setSortPreference('fullPotential')}
                  >
                    Full potential{sortIndicator('fullPotential')}
                  </TableHeaderCell>
                  <TableHeaderCell
                    widthClass="w-[5rem]"
                    align="right"
                    onClick={() => setSortPreference('commercialRecovery')}
                  >
                    Recovery target{sortIndicator('commercialRecovery')}
                  </TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => {
                  const isExpanded = expandedId === row.recordId;
                  const isHighlighted = highlightedRecordIds?.has(row.recordId);
                  const override = rowOverrides[row.recordId];
                  const selectedBasis = getBasisSelectValue(override, row);
                  const excluded = selectedBasis === 'exclude';
                  const gap = row.marginPercentGap;

                  return (
                    <Fragment key={row.recordId}>
                      <tr
                        className={cn(
                          'border-t border-slate-100 hover:bg-slate-50/80',
                          isHighlighted && 'bg-sky-50/60',
                          excluded && 'opacity-50',
                        )}
                        onDoubleClick={() => toggleExpand(row.recordId)}
                      >
                        <td className="sticky left-0 z-10 bg-white px-2 py-2">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() => toggleExpand(row.recordId)}
                            className="text-slate-500 hover:text-slate-800"
                            title="Expand detail (or double-click row)"
                          >
                            {isExpanded ? '−' : '+'}
                          </button>
                        </td>
                        <td className="sticky left-8 z-10 bg-white px-2 py-2">
                          <Select
                            value={selectedBasis}
                            onValueChange={(value: MarginPercentBasisId) =>
                              onRowOverrideChange(row.recordId, {
                                ...override,
                                basis: value,
                                excluded: value === 'exclude',
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-full text-xs">
                              <SelectValueLeft />
                            </SelectTrigger>
                            <SelectContent>
                              {basisOptions.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="truncate px-2 py-2">{row.metadata.OEM ?? '—'}</td>
                        <td className="truncate px-2 py-2">
                          {row.metadata['Program Name'] ?? '—'}
                        </td>
                        <td className="truncate px-2 py-2">
                          {row.metadata['Part description'] ?? row.metadata['Part number'] ?? '—'}
                        </td>
                        <td className="px-2 py-2">
                          <Badge variant={statusBadgeVariant(row.status)}>
                            {marginGapStatusLabel(row.status)}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatRowUnit(row.anchorPrice, row, displaySettings)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatMarginPercent(gap.anchorMarginPercent)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatMarginPercent(gap.bestReferenceMarginPercent)}
                        </td>
                        <td className="truncate px-2 py-2">
                          {gap.bestReferenceFrameLabel ?? '—'}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatMarginPercent(row.anchorEbitMarginPercent)}
                        </td>
                        <td className="truncate px-2 py-2">
                          {getMarginPercentWinningBasisLabel(row)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatRowUnit(row.targetPriceIncrease, row, displaySettings)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatRowMoney(row.fullPotential, row, displaySettings)}
                        </td>
                        <td className="px-2 py-2 text-right font-medium tabular-nums">
                          {formatRowMoney(row.commercialRecovery, row, displaySettings)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={15} className="p-0">
                            <MarginPercentDetailDrawer
                              row={row}
                              settings={settings}
                              displaySettings={displaySettings}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
