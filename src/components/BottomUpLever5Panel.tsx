import { useMemo } from 'react';
import type {
  AppDisplaySettings,
  BottomUpRecord,
  Lever5Settings,
  PortfolioBottomUpOpportunityResult,
} from '../types';
import { bottomUpGroupKey, getBottomUpGroups } from '../lib/bottomUpSizing';
import { parseBottomUpInputsExcelFile } from '../lib/parseBottomUpInputsExcel';
import { formatMarginPercent, formatVolume } from '../lib/format';
import { getRecordPartNumber } from '../lib/partNumber';
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
import { cn } from '../lib/utils';

interface BottomUpLever5PanelProps {
  records: BottomUpRecord[];
  metadataFields: string[];
  settings: Lever5Settings;
  displaySettings: AppDisplaySettings;
  preview?: PortfolioBottomUpOpportunityResult | null;
  calculated?: boolean;
  onSettingsChange: (settings: Lever5Settings) => void;
  onCalculate: () => void;
}

export function BottomUpLever5Panel({
  records,
  metadataFields,
  settings,
  displaySettings,
  preview,
  calculated,
  onSettingsChange,
  onCalculate,
}: BottomUpLever5PanelProps) {
  const groups = getBottomUpGroups(records, settings.groupingField);
  const { unitMoney, totalMoney } = makeDetailMoneyFormatters(displaySettings);

  const detailRows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.map((row) => {
      const l5 = row.levers.lever5;
      return {
        recordId: row.recordId,
        currency: row.currency,
        oem: row.metadata.OEM ?? '—',
        partNumber: getRecordPartNumber(row.metadata) ?? row.recordId,
        group: bottomUpGroupKey(row.metadata, settings.groupingField),
        incomingPrice: l5.incomingPrice ?? row.levers.lever4.price,
        cm4Percent: row.levers.lever4.cmPercent,
        targetCmPercent: l5.targetCmPercent ?? null,
        contributionCost: l5.contributionCost ?? null,
        shouldPrice: l5.shouldPrice ?? null,
        p5: l5.price,
        cm5Percent: l5.cmPercent,
        unitOpportunity: l5.unitOpportunity,
        anchorVolume: row.anchorVolume,
        opportunity: l5.dollarOpportunity,
      };
    });
  }, [preview, settings.groupingField]);

  async function importInputs(file: File) {
    const buffer = await file.arrayBuffer();
    const inputs = await parseBottomUpInputsExcelFile(buffer);
    onSettingsChange({
      ...settings,
      globalTargetCmPercent: inputs.lever5.globalTargetCmPercent,
      targetCmPercentByGroup: {
        ...settings.targetCmPercentByGroup,
        ...inputs.lever5.targetCmPercentByGroup,
      },
    });
  }

  return (
    <Card id="bottom-up-lever5" style={{ scrollMarginTop: PAGE_CHROME_OFFSET + 12 }}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Lever 5 — Leaker uplift</CardTitle>
            <CardDescription>
              Size price uplift for parts below target contribution margin % (per group or global).
            </CardDescription>
          </div>
          <BottomUpLeverIncludeToggle
            included={settings.included}
            onChange={(included) => onSettingsChange({ ...settings, included })}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn('space-y-4', !settings.included && 'pointer-events-none opacity-50')}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="max-w-xs space-y-1.5">
            <Label>Grouping field</Label>
            <BottomUpGroupingFieldSelect
              metadataFields={metadataFields}
              value={settings.groupingField}
              onValueChange={(v) => onSettingsChange({ ...settings, groupingField: v })}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.useGlobalTarget}
              onChange={(e) =>
                onSettingsChange({ ...settings, useGlobalTarget: e.target.checked })
              }
            />
            Use global target CM%
          </label>
        </div>

        <div className="max-w-xs space-y-1.5">
          <Label>Global target CM%</Label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
            value={settings.globalTargetCmPercent}
            onChange={(e) =>
              onSettingsChange({
                ...settings,
                globalTargetCmPercent: Number(e.target.value) || 0,
              })
            }
          />
        </div>

        {!settings.useGlobalTarget && (
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-1.5 text-left">Group</th>
                  <th className="px-2 py-1.5 text-right">Target CM%</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">{group}</td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        className="h-7 w-full rounded border border-slate-300 px-1 text-right text-xs"
                        value={
                          settings.targetCmPercentByGroup[group] ??
                          settings.globalTargetCmPercent
                        }
                        onChange={(e) =>
                          onSettingsChange({
                            ...settings,
                            targetCmPercentByGroup: {
                              ...settings.targetCmPercentByGroup,
                              [group]: Number(e.target.value) || 0,
                            },
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Button type="button" variant="outline" size="sm" onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.xlsx,.xls';
          input.onchange = () => {
            const file = input.files?.[0];
            if (file) void importInputs(file);
          };
          input.click();
        }}>
          Import inputs Excel
        </Button>
        </div>

        <Button type="button" onClick={onCalculate}>
          {calculated ? 'Recalculate Lever 5' : 'Calculate Lever 5'}
        </Button>

        <BottomUpLeverDetailTable
          title="Lever 5 build-up detail — one row per part number"
          note={
            settings.included ? undefined : 'Lever 5 is excluded — opportunity shows as $0.'
          }
          rows={detailRows}
          columnCount={13}
          minWidthClass="min-w-[66rem]"
          filterColumns={[
            { key: 'oem', label: 'OEM', columnIndex: 0, accessor: (r) => r.oem },
            { key: 'partNumber', label: 'Part number', columnIndex: 1, accessor: (r) => r.partNumber },
            { key: 'group', label: 'Group', columnIndex: 2, accessor: (r) => r.group },
          ]}
          head={
            <tr>
              <DetailHeaderCell>OEM</DetailHeaderCell>
              <DetailHeaderCell>Part number</DetailHeaderCell>
              <DetailHeaderCell>Group</DetailHeaderCell>
              <DetailHeaderCell align="right" className="border-l border-slate-200">
                Incoming price (P₄)
              </DetailHeaderCell>
              <DetailHeaderCell align="right">CM%₄</DetailHeaderCell>
              <DetailHeaderCell align="right">Target CM%</DetailHeaderCell>
              <DetailHeaderCell align="right">Contribution cost (C)</DetailHeaderCell>
              <DetailHeaderCell align="right" className="border-l border-slate-200">
                Should price (P₅)
              </DetailHeaderCell>
              <DetailHeaderCell align="right">Lever 5 price (P₅)</DetailHeaderCell>
              <DetailHeaderCell align="right">CM%₅</DetailHeaderCell>
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
              <td className="border-l border-slate-100 px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.incomingPrice, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {formatMarginPercent(r.cm4Percent)}
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
                {unitMoney(r.p5, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {formatMarginPercent(r.cm5Percent)}
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
