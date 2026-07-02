import { useMemo } from 'react';
import type {
  AppDisplaySettings,
  Lever3Settings,
  PortfolioBottomUpOpportunityResult,
} from '../types';
import { bottomUpGroupKey } from '../lib/bottomUpSizing';
import { BottomUpGroupingFieldSelect } from './BottomUpGroupingFieldSelect';
import { BottomUpLeverIncludeToggle } from './BottomUpLeverIncludeToggle';
import {
  BottomUpLeverDetailTable,
  DetailHeaderCell,
  makeDetailMoneyFormatters,
} from './BottomUpLeverDetailTable';
import { PAGE_CHROME_OFFSET } from './tabSections';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { formatMarginPercent, formatVolume } from '../lib/format';
import { getRecordPartNumber } from '../lib/partNumber';
import { cn } from '../lib/utils';

/**
 * Human label for a volume quintile (1 = top 20% … 5 = bottom 20%). Returns the
 * em-dash for excluded / no-data rows so they group together in the filter.
 */
function quintileLabel(quintile: number | null): string {
  if (quintile === null) return '—';
  if (quintile === 1) return 'Q1 (top 20%)';
  if (quintile === 5) return 'Q5 (bottom 20%)';
  return `Q${quintile}`;
}

interface BottomUpLever3PanelProps {
  metadataFields: string[];
  settings: Lever3Settings;
  displaySettings: AppDisplaySettings;
  preview?: PortfolioBottomUpOpportunityResult | null;
  calculated?: boolean;
  onSettingsChange: (settings: Lever3Settings) => void;
  onCalculate: () => void;
}

export function BottomUpLever3Panel({
  metadataFields,
  settings,
  displaySettings,
  preview,
  calculated,
  onSettingsChange,
  onCalculate,
}: BottomUpLever3PanelProps) {
  const targetCm = preview?.targetCmByGroupL3 ?? {};
  const { unitMoney, totalMoney } = makeDetailMoneyFormatters(displaySettings);

  const detailRows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.map((row) => {
      const l3 = row.levers.lever3;
      return {
        recordId: row.recordId,
        currency: row.currency,
        oem: row.metadata.OEM ?? '—',
        partNumber: getRecordPartNumber(row.metadata) ?? row.recordId,
        group: bottomUpGroupKey(row.metadata, settings.groupingField),
        volumeQuintile: l3.excluded ? null : l3.volumeQuintile ?? null,
        incomingPrice: l3.incomingPrice ?? row.levers.lever2.price,
        cm2Percent: row.levers.lever2.cmPercent,
        targetCmPercent: l3.targetCmPercent ?? null,
        contributionCost: l3.contributionCost ?? null,
        shouldPrice: l3.shouldPrice ?? null,
        p3: l3.price,
        cm3Percent: l3.cmPercent,
        unitOpportunity: l3.unitOpportunity,
        anchorVolume: row.anchorVolume,
        opportunity: l3.dollarOpportunity,
      };
    });
  }, [preview, settings.groupingField]);

  return (
    <Card id="bottom-up-lever3" style={{ scrollMarginTop: PAGE_CHROME_OFFSET + 12 }}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Lever 3 — Long tail repricing</CardTitle>
            <CardDescription>
              Target CM% from top 4/5 parts by volume (dollar-weighted). Reprice bottom quintile
              parts below target.
            </CardDescription>
          </div>
          <BottomUpLeverIncludeToggle
            included={settings.included}
            onChange={(included) => onSettingsChange({ ...settings, included })}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={cn(
            'max-w-xs space-y-1.5',
            !settings.included && 'pointer-events-none opacity-50',
          )}
        >
          <Label>Grouping field</Label>
          <BottomUpGroupingFieldSelect
            metadataFields={metadataFields}
            value={settings.groupingField}
            onValueChange={(v) => onSettingsChange({ ...settings, groupingField: v })}
          />
        </div>

        {Object.keys(targetCm).length > 0 && (
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-1.5 text-left">Group</th>
                  <th className="px-2 py-1.5 text-right">Target CM%</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(targetCm).map(([group, pct]) => (
                  <tr key={group} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">{group}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {pct !== null ? formatMarginPercent(pct) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Button type="button" onClick={onCalculate}>
          {calculated ? 'Recalculate Lever 3' : 'Calculate Lever 3'}
        </Button>

        <BottomUpLeverDetailTable
          title="Lever 3 build-up detail — one row per part number"
          note={
            settings.included ? undefined : 'Lever 3 is excluded — opportunity shows as $0.'
          }
          rows={detailRows}
          columnCount={14}
          minWidthClass="min-w-[68rem]"
          filterColumns={[
            { key: 'oem', label: 'OEM', columnIndex: 0, accessor: (r) => r.oem },
            { key: 'partNumber', label: 'Part number', columnIndex: 1, accessor: (r) => r.partNumber },
            { key: 'group', label: 'Group', columnIndex: 2, accessor: (r) => r.group },
            {
              key: 'volumeQuintile',
              label: 'Volume quintile',
              columnIndex: 3,
              accessor: (r) => quintileLabel(r.volumeQuintile),
            },
          ]}
          head={
            <tr>
              <DetailHeaderCell>OEM</DetailHeaderCell>
              <DetailHeaderCell>Part number</DetailHeaderCell>
              <DetailHeaderCell>Group</DetailHeaderCell>
              <DetailHeaderCell align="center">Volume quintile</DetailHeaderCell>
              <DetailHeaderCell align="right" className="border-l border-slate-200">
                Incoming price (P₂)
              </DetailHeaderCell>
              <DetailHeaderCell align="right">CM%₂</DetailHeaderCell>
              <DetailHeaderCell align="right">Group target CM%</DetailHeaderCell>
              <DetailHeaderCell align="right">Contribution cost (C)</DetailHeaderCell>
              <DetailHeaderCell align="right" className="border-l border-slate-200">
                Should price (P₃)
              </DetailHeaderCell>
              <DetailHeaderCell align="right">Lever 3 price (P₃)</DetailHeaderCell>
              <DetailHeaderCell align="right">CM%₃</DetailHeaderCell>
              <DetailHeaderCell align="right">Unit opportunity</DetailHeaderCell>
              <DetailHeaderCell align="right">Anchor volume</DetailHeaderCell>
              <DetailHeaderCell align="right">Total opportunity</DetailHeaderCell>
            </tr>
          }
          renderRow={(r) => (
            <tr key={r.recordId} className="border-t border-slate-100 hover:bg-slate-50/80">
              <td className="px-2 py-2 text-xs">{r.oem}</td>
              <td className="px-2 py-2 text-xs">{r.partNumber}</td>
              <td className="px-2 py-2 text-xs">{r.group}</td>
              <td className="px-2 py-2 text-center text-xs">
                {quintileLabel(r.volumeQuintile)}
              </td>
              <td className="border-l border-slate-100 px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.incomingPrice, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {formatMarginPercent(r.cm2Percent)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {formatMarginPercent(r.targetCmPercent)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.contributionCost, r.currency)}
              </td>
              <td className="border-l border-slate-100 px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.shouldPrice, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs font-medium tabular-nums">
                {unitMoney(r.p3, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {formatMarginPercent(r.cm3Percent)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.unitOpportunity, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {formatVolume(r.anchorVolume)}
              </td>
              <td className="px-2 py-2 text-right text-xs font-medium tabular-nums text-amber-900">
                {totalMoney(r.opportunity, r.currency)}
              </td>
            </tr>
          )}
        />
      </CardContent>
    </Card>
  );
}
