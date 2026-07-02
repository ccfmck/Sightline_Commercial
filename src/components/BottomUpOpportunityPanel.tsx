import { Fragment, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AppDisplaySettings, OpportunitySettings, PortfolioBottomUpOpportunityResult } from '../types';
import { convertToDisplayCurrency, getDisplayCurrencyCode } from '../lib/currency';
import { formatCurrency, formatMarginPercent, formatUnitValueWithCurrency } from '../lib/format';
import { getLeverColor } from '../lib/chartColors';
import { getRecordPartNumber } from '../lib/partNumber';
import { BottomUpDetailDrawer } from './BottomUpDetailDrawer';
import { PAGE_CHROME_OFFSET } from './tabSections';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { dataTableClassName, TableHeaderCell } from './ui/table-header-cell';
import { cn } from '../lib/utils';

type SortKey = 'commercialRecovery' | 'fullPotential' | 'oem' | 'part';
type SortDir = 'asc' | 'desc';

interface BottomUpOpportunityPanelProps {
  portfolio: PortfolioBottomUpOpportunityResult;
  settings: OpportunitySettings;
  displaySettings: AppDisplaySettings;
  nonUsdCurrencies: string[];
}

function formatPercentInput(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function formatRowMoney(
  amount: number,
  currency: string,
  displaySettings: AppDisplaySettings,
): string {
  const converted = convertToDisplayCurrency(amount, currency, displaySettings);
  const code = getDisplayCurrencyCode(currency, displaySettings);
  return formatCurrency(converted, code);
}

export function BottomUpOpportunityPanel({
  portfolio,
  settings,
  displaySettings,
  nonUsdCurrencies,
}: BottomUpOpportunityPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('commercialRecovery');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [rowOrder, setRowOrder] = useState<string[]>([]);

  const rowOrderKey = portfolio.rows.map((r) => r.recordId).join('|');

  useEffect(() => {
    const sorted = [...portfolio.rows].sort(
      (a, b) => b.commercialRecovery - a.commercialRecovery,
    );
    setRowOrder(sorted.map((r) => r.recordId));
    setSortKey('commercialRecovery');
    setSortDir('desc');
  }, [rowOrderKey]);

  const displayRows = useMemo(() => {
    const byId = new Map(portfolio.rows.map((r) => [r.recordId, r]));
    return rowOrder
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined);
  }, [portfolio.rows, rowOrder]);

  const effectiveRecoveryPct =
    (settings.externalFactorPercent * settings.captureRatePercent) / 100;

  const leverIncluded: Record<number, boolean> = {
    1: portfolio.leverSettings.lever1.included,
    2: portfolio.leverSettings.lever2.included,
    3: portfolio.leverSettings.lever3.included,
    4: portfolio.leverSettings.lever4.included,
    5: portfolio.leverSettings.lever5.included,
  };

  const displayTotals = useMemo(() => {
    let totalFullPotential = 0;
    let totalCommercialRecovery = 0;
    let rowsWithOpportunity = 0;
    const compositionByLever: Record<string, number> = {};

    for (const row of portfolio.rows) {
      if (row.excluded) continue;
      const fp = convertToDisplayCurrency(row.fullPotential, row.currency, displaySettings);
      const cr = convertToDisplayCurrency(row.commercialRecovery, row.currency, displaySettings);
      totalFullPotential += fp;
      totalCommercialRecovery += cr;
      if (row.fullPotential > 0) rowsWithOpportunity += 1;

      if (cr <= 0) continue;
      const leverAmounts = [
        row.levers.lever1.dollarOpportunity,
        row.levers.lever2.dollarOpportunity,
        row.levers.lever3.dollarOpportunity,
        row.levers.lever4.dollarOpportunity,
        row.levers.lever5.dollarOpportunity,
      ];
      const total = leverAmounts.reduce((a, b) => a + b, 0);
      if (total <= 0) continue;
      const labels = ['Lever 1', 'Lever 2', 'Lever 3', 'Lever 4', 'Lever 5'];
      for (let i = 0; i < labels.length; i++) {
        const share = (leverAmounts[i] / total) * cr;
        compositionByLever[labels[i]] = (compositionByLever[labels[i]] ?? 0) + share;
      }
    }

    return { totalFullPotential, totalCommercialRecovery, rowsWithOpportunity, compositionByLever };
  }, [portfolio.rows, displaySettings]);

  const compositionData = useMemo(
    () =>
      Object.entries(displayTotals.compositionByLever)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    [displayTotals.compositionByLever],
  );

  const compositionChartRow = useMemo(() => {
    const row: Record<string, number | string> = { label: 'Portfolio' };
    for (const entry of compositionData) row[entry.name] = entry.value;
    return row;
  }, [compositionData]);

  // Always list all five levers in the legend so excluded levers stay visible as $0.
  const legendData = useMemo(
    () =>
      ([1, 2, 3, 4, 5] as const).map((n) => {
        const name = `Lever ${n}`;
        return {
          name,
          value: displayTotals.compositionByLever[name] ?? 0,
          excluded: !leverIncluded[n],
        };
      }),
    [displayTotals.compositionByLever, leverIncluded],
  );

  const portfolioCurrencyCode =
    displaySettings.displayCurrency === 'USD' ? 'USD' : (nonUsdCurrencies[0] ?? 'USD');

  function applySort() {
    const sorted = [...portfolio.rows].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'commercialRecovery':
          return (a.commercialRecovery - b.commercialRecovery) * dir;
        case 'fullPotential':
          return (a.fullPotential - b.fullPotential) * dir;
        case 'oem':
          return (a.metadata.OEM ?? '').localeCompare(b.metadata.OEM ?? '') * dir;
        case 'part':
          return (
            (getRecordPartNumber(a.metadata) ?? a.recordId).localeCompare(
              getRecordPartNumber(b.metadata) ?? b.recordId,
            ) * dir
          );
        default:
          return 0;
      }
    });
    setRowOrder(sorted.map((r) => r.recordId));
  }

  function setSortPreference(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'commercialRecovery' || key === 'fullPotential' ? 'desc' : 'asc');
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  return (
    <Card id="bottom-up-summary" style={{ scrollMarginTop: PAGE_CHROME_OFFSET + 12 }}>
      <CardHeader>
        <CardTitle className="text-base">Bottom-up opportunity summary</CardTitle>
        <CardDescription>
          Portfolio totals across all five levers ({portfolio.beginningYear} → {portfolio.anchorYear}
          ). Total opportunity is the sum of lever dollar opportunities; commercial recovery applies
          external factor and capture rate haircuts.
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
              <span className="text-base font-normal text-slate-500">
                {' '}
                / {portfolio.rows.length}
              </span>
            </p>
          </div>
        </div>

        {compositionData.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-900">Recovery by lever</h3>
            <div className="h-12 w-full" aria-hidden>
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
                      formatCurrency(
                        typeof value === 'number' ? value : Number(value),
                        portfolioCurrencyCode,
                      )
                    }
                    contentStyle={{ fontSize: 12 }}
                  />
                  {compositionData.map((entry) => (
                    <Bar
                      key={entry.name}
                      dataKey={entry.name}
                      stackId="portfolio"
                      fill={getLeverColor(entry.name)}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {legendData.map((entry) => (
                <span
                  key={entry.name}
                  className={cn(
                    'inline-flex items-center gap-1.5',
                    entry.excluded ? 'text-slate-400 line-through' : 'text-slate-600',
                  )}
                  title={entry.excluded ? `${entry.name} excluded from sizing` : undefined}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{
                      backgroundColor: getLeverColor(entry.name),
                      opacity: entry.excluded ? 0.35 : 1,
                    }}
                  />
                  {entry.name}: {formatCurrency(entry.value, portfolioCurrencyCode)}
                  {entry.excluded && ' (excluded)'}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Double-click a row for lever-by-lever waterfall detail.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={applySort}>
              Sort table ({sortDir === 'desc' ? 'high → low' : 'low → high'})
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className={dataTableClassName}>
              <thead>
                <tr>
                  <TableHeaderCell widthClass="w-8" sticky stickyLeft="left-0" />
                  <TableHeaderCell widthClass="w-[5rem]" onClick={() => setSortPreference('oem')}>
                    OEM{sortIndicator('oem')}
                  </TableHeaderCell>
                  <TableHeaderCell widthClass="w-[6rem]" onClick={() => setSortPreference('part')}>
                    Part{sortIndicator('part')}
                  </TableHeaderCell>
                  <TableHeaderCell widthClass="w-[4rem]" align="right">
                    Anchor price
                  </TableHeaderCell>
                  {([1, 2, 3, 4, 5] as const).map((n) => (
                    <TableHeaderCell
                      key={n}
                      widthClass="w-[4rem]"
                      align="right"
                      className={cn(!leverIncluded[n] && 'text-slate-300')}
                    >
                      L{n} ${leverIncluded[n] ? '' : ' (excl.)'}
                    </TableHeaderCell>
                  ))}
                  <TableHeaderCell widthClass="w-[4.5rem]" align="right">
                    Final CM%
                  </TableHeaderCell>
                  <TableHeaderCell widthClass="w-[5rem]" align="right">
                    Final price
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
                    Recovery{sortIndicator('commercialRecovery')}
                  </TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => {
                  const isExpanded = expandedId === row.recordId;
                  return (
                    <Fragment key={row.recordId}>
                      <tr
                        className={cn('border-t border-slate-100 hover:bg-slate-50/80')}
                        onDoubleClick={() =>
                          setExpandedId((prev) => (prev === row.recordId ? null : row.recordId))
                        }
                      >
                        <td className="sticky left-0 z-10 bg-white px-2 py-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId((prev) =>
                                prev === row.recordId ? null : row.recordId,
                              )
                            }
                            className="text-slate-500 hover:text-slate-800"
                          >
                            {isExpanded ? '−' : '+'}
                          </button>
                        </td>
                        <td className="px-2 py-2 text-xs">{row.metadata.OEM ?? '—'}</td>
                        <td className="px-2 py-2 text-xs">
                          {getRecordPartNumber(row.metadata) ?? row.recordId}
                        </td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums">
                          {row.anchorPrice !== null
                            ? formatUnitValueWithCurrency(
                                convertToDisplayCurrency(
                                  row.anchorPrice,
                                  row.currency,
                                  displaySettings,
                                ),
                                getDisplayCurrencyCode(row.currency, displaySettings),
                              )
                            : '—'}
                        </td>
                        {([1, 2, 3, 4, 5] as const).map((n) => (
                          <td
                            key={n}
                            className={cn(
                              'px-2 py-2 text-right text-xs tabular-nums',
                              !leverIncluded[n] && 'text-slate-300',
                            )}
                          >
                            {formatRowMoney(
                              row.levers[`lever${n}`].dollarOpportunity,
                              row.currency,
                              displaySettings,
                            )}
                          </td>
                        ))}
                        <td className="px-2 py-2 text-right text-xs tabular-nums">
                          {row.finalCmPercent !== null
                            ? formatMarginPercent(row.finalCmPercent)
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums">
                          {formatUnitValueWithCurrency(
                            convertToDisplayCurrency(
                              row.finalPrice,
                              row.currency,
                              displaySettings,
                            ),
                            getDisplayCurrencyCode(row.currency, displaySettings),
                          )}
                        </td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums">
                          {formatRowMoney(row.fullPotential, row.currency, displaySettings)}
                        </td>
                        <td className="px-2 py-2 text-right text-xs font-medium tabular-nums text-amber-900">
                          {formatRowMoney(row.commercialRecovery, row.currency, displaySettings)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={13} className="p-0">
                            <BottomUpDetailDrawer
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
