import { useMemo } from 'react';
import type {
  AppDisplaySettings,
  BottomUpRecord,
  Lever4Settings,
  PortfolioBottomUpOpportunityResult,
} from '../types';
import { bottomUpGroupKey, getBottomUpGroups } from '../lib/bottomUpSizing';
import { parseBottomUpInputsExcelFile } from '../lib/parseBottomUpInputsExcel';
import { formatMarginPercent, formatPercentInput, formatVolume } from '../lib/format';
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

interface BottomUpLever4PanelProps {
  records: BottomUpRecord[];
  metadataFields: string[];
  settings: Lever4Settings;
  anchorYear: number;
  displaySettings: AppDisplaySettings;
  preview?: PortfolioBottomUpOpportunityResult | null;
  calculated?: boolean;
  onSettingsChange: (settings: Lever4Settings) => void;
  onCalculate: () => void;
}

export function BottomUpLever4Panel({
  records,
  metadataFields,
  settings,
  anchorYear,
  displaySettings,
  preview,
  calculated,
  onSettingsChange,
  onCalculate,
}: BottomUpLever4PanelProps) {
  const directBuyGroups = getBottomUpGroups(records, settings.directBuyGroupingField);
  const markupGroups = getBottomUpGroups(records, settings.markupGroupingField);
  const { unitMoney, totalMoney } = makeDetailMoneyFormatters(displaySettings);

  const detailRows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.map((row) => {
      const l4 = row.levers.lever4;
      return {
        recordId: row.recordId,
        currency: row.currency,
        oem: row.metadata.OEM ?? '—',
        partNumber: getRecordPartNumber(row.metadata) ?? row.recordId,
        directBuyGroup: bottomUpGroupKey(row.metadata, settings.directBuyGroupingField),
        markupGroup: bottomUpGroupKey(row.metadata, settings.markupGroupingField),
        incomingPrice: l4.incomingPrice ?? row.levers.lever3.price,
        anchorMaterial: l4.anchorMaterialCost ?? null,
        directBuyPercent: l4.directBuyPercent ?? null,
        markupIncrease: l4.markupIncrease ?? null,
        perUnitUplift: l4.perUnitUplift ?? null,
        p4: l4.price,
        cm4: l4.cm,
        cm4Percent: l4.cmPercent,
        anchorVolume: row.anchorVolume,
        opportunity: l4.dollarOpportunity,
      };
    });
  }, [preview, settings.directBuyGroupingField, settings.markupGroupingField]);

  function updateDirectBuy(group: string, raw: string) {
    const value = Number(raw);
    onSettingsChange({
      ...settings,
      directBuyByGroup: {
        ...settings.directBuyByGroup,
        [group]: Number.isFinite(value) ? value : 0,
      },
    });
  }

  function updateMarkup(group: string, raw: string) {
    const value = Number(raw);
    onSettingsChange({
      ...settings,
      markupIncreaseByGroup: {
        ...settings.markupIncreaseByGroup,
        [group]: Number.isFinite(value) ? value : 0,
      },
    });
  }

  async function importInputs(file: File) {
    const buffer = await file.arrayBuffer();
    const inputs = await parseBottomUpInputsExcelFile(buffer);
    onSettingsChange({
      ...settings,
      directBuyByGroup: { ...settings.directBuyByGroup, ...inputs.lever4.directBuyByGroup },
      markupIncreaseByGroup: {
        ...settings.markupIncreaseByGroup,
        ...inputs.lever4.markupIncreaseByGroup,
      },
    });
  }

  return (
    <Card id="bottom-up-lever4" style={{ scrollMarginTop: PAGE_CHROME_OFFSET + 12 }}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Lever 4 — Handling fee markup</CardTitle>
            <CardDescription>
              Uplift = markup increase (pts) × material cost × direct buy %. Enter both as
              percentages (e.g. 3 and 40). Configure per group.
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Direct buy % grouping</Label>
            <BottomUpGroupingFieldSelect
              metadataFields={metadataFields}
              value={settings.directBuyGroupingField}
              onValueChange={(v) =>
                onSettingsChange({ ...settings, directBuyGroupingField: v })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Markup grouping</Label>
            <BottomUpGroupingFieldSelect
              metadataFields={metadataFields}
              value={settings.markupGroupingField}
              onValueChange={(v) =>
                onSettingsChange({ ...settings, markupGroupingField: v })
              }
            />
          </div>
        </div>

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

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <div className="overflow-x-auto rounded border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Group</th>
                    <th className="px-2 py-1.5 text-right">Direct buy %</th>
                  </tr>
                </thead>
                <tbody>
                  {directBuyGroups.map((group) => (
                    <tr key={group} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">{group}</td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          className="h-7 w-full rounded border border-slate-300 px-1 text-right text-xs"
                          value={settings.directBuyByGroup[group] ?? ''}
                          onChange={(e) => updateDirectBuy(group, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">
              Share of material bought directly, in percent (e.g. enter 40 for 40%).
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="overflow-x-auto rounded border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Group</th>
                    <th className="px-2 py-1.5 text-right">Markup increase</th>
                  </tr>
                </thead>
                <tbody>
                  {markupGroups.map((group) => (
                    <tr key={group} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">{group}</td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          className="h-7 w-full rounded border border-slate-300 px-1 text-right text-xs"
                          value={settings.markupIncreaseByGroup[group] ?? ''}
                          onChange={(e) => updateMarkup(group, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">
              Enter in percentage points. For example, to raise the handling-fee markup from 5% to
              8%, enter 3.
            </p>
          </div>
        </div>
        </div>

        <Button type="button" onClick={onCalculate}>
          {calculated ? 'Recalculate Lever 4' : 'Calculate Lever 4'}
        </Button>

        <BottomUpLeverDetailTable
          title="Lever 4 build-up detail — one row per part number"
          note={
            settings.included ? undefined : 'Lever 4 is excluded — opportunity shows as $0.'
          }
          rows={detailRows}
          columnCount={14}
          minWidthClass="min-w-[68rem]"
          filterColumns={[
            { key: 'oem', label: 'OEM', columnIndex: 0, accessor: (r) => r.oem },
            { key: 'partNumber', label: 'Part number', columnIndex: 1, accessor: (r) => r.partNumber },
            { key: 'directBuyGroup', label: 'Direct-buy group', columnIndex: 2, accessor: (r) => r.directBuyGroup },
            { key: 'markupGroup', label: 'Markup group', columnIndex: 3, accessor: (r) => r.markupGroup },
          ]}
          head={
            <tr>
              <DetailHeaderCell>OEM</DetailHeaderCell>
              <DetailHeaderCell>Part number</DetailHeaderCell>
              <DetailHeaderCell>Direct-buy group</DetailHeaderCell>
              <DetailHeaderCell>Markup group</DetailHeaderCell>
              <DetailHeaderCell align="right" className="border-l border-slate-200">
                Incoming price (P₃)
              </DetailHeaderCell>
              <DetailHeaderCell align="right">Material/unit ({anchorYear})</DetailHeaderCell>
              <DetailHeaderCell align="right">Direct buy %</DetailHeaderCell>
              <DetailHeaderCell align="right">Markup increase (pts)</DetailHeaderCell>
              <DetailHeaderCell align="right">Per-unit uplift</DetailHeaderCell>
              <DetailHeaderCell align="right" className="border-l border-slate-200">
                Lever 4 price (P₄)
              </DetailHeaderCell>
              <DetailHeaderCell align="right">CM₄</DetailHeaderCell>
              <DetailHeaderCell align="right">CM%₄</DetailHeaderCell>
              <DetailHeaderCell align="right">Anchor volume</DetailHeaderCell>
              <DetailHeaderCell align="right">Total opportunity</DetailHeaderCell>
            </tr>
          }
          renderRow={(r) => (
            <tr key={r.recordId} className="border-t border-slate-100 hover:bg-slate-50/80">
              <td className="px-2 py-2 text-xs">{r.oem}</td>
              <td className="px-2 py-2 text-xs">{r.partNumber}</td>
              <td className="px-2 py-2 text-xs">{r.directBuyGroup}</td>
              <td className="px-2 py-2 text-xs">{r.markupGroup}</td>
              <td className="border-l border-slate-100 px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.incomingPrice, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.anchorMaterial, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {formatPercentInput(r.directBuyPercent)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {r.markupIncrease === null
                  ? '—'
                  : `${r.markupIncrease.toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })} pts`}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.perUnitUplift, r.currency)}
              </td>
              <td className="border-l border-slate-100 px-2 py-2 text-right text-xs font-medium tabular-nums">
                {unitMoney(r.p4, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.cm4, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {formatMarginPercent(r.cm4Percent)}
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
