import { useMemo } from 'react';
import type {
  AppDisplaySettings,
  BottomUpRecord,
  Lever2Settings,
  PortfolioBottomUpOpportunityResult,
} from '../types';
import { bottomUpGroupKey, buildGroupMaterialMarginTable } from '../lib/bottomUpSizing';
import { convertToDisplayCurrency, getDisplayCurrencyCode } from '../lib/currency';
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
import { dataTableClassName, TableHeaderCell } from './ui/table-header-cell';
import { formatCurrency, formatMarginPercent, formatVolume } from '../lib/format';
import { cn } from '../lib/utils';

interface BottomUpLever2PanelProps {
  records: BottomUpRecord[];
  metadataFields: string[];
  settings: Lever2Settings;
  anchorYear: number;
  displaySettings: AppDisplaySettings;
  preview?: PortfolioBottomUpOpportunityResult | null;
  calculated?: boolean;
  onSettingsChange: (settings: Lever2Settings) => void;
  onCalculate: () => void;
}

export function BottomUpLever2Panel({
  records,
  metadataFields,
  settings,
  anchorYear,
  displaySettings,
  preview,
  calculated,
  onSettingsChange,
  onCalculate,
}: BottomUpLever2PanelProps) {
  const { unitMoney, totalMoney } = makeDetailMoneyFormatters(displaySettings);

  const groupMarginRows = useMemo(
    () => buildGroupMaterialMarginTable(records, settings.groupingField),
    [records, settings.groupingField],
  );

  const detailRows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.map((row) => {
      const l2 = row.levers.lever2;
      return {
        recordId: row.recordId,
        currency: row.currency,
        oem: row.metadata.OEM ?? '—',
        partNumber: getRecordPartNumber(row.metadata) ?? row.recordId,
        group: bottomUpGroupKey(row.metadata, settings.groupingField),
        incomingPrice: l2.incomingPrice ?? row.levers.lever1.price,
        anchorMaterial: l2.anchorMaterialCost ?? null,
        partMargin: l2.partMaterialMarginPercent ?? null,
        groupMargin: l2.groupAvgMaterialMarginPercent ?? null,
        shouldPrice: l2.shouldPrice ?? null,
        p2: l2.price,
        unitOpportunity: l2.unitOpportunity,
        anchorVolume: row.anchorVolume,
        opportunity: l2.dollarOpportunity,
      };
    });
  }, [preview, settings.groupingField]);

  return (
    <Card id="bottom-up-lever2" style={{ scrollMarginTop: PAGE_CHROME_OFFSET + 12 }}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Lever 2 — Linear performance pricing</CardTitle>
            <CardDescription>
              Compare each part&apos;s material margin to the group average and size price uplift.
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

        {groupMarginRows.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-600">
              Group material margin (anchor-year actuals) — the group average each part is priced
              toward.
            </p>
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className={dataTableClassName}>
                <thead>
                  <tr>
                    <TableHeaderCell>Group</TableHeaderCell>
                    <TableHeaderCell align="right">Group sales</TableHeaderCell>
                    <TableHeaderCell align="right">Material margin $</TableHeaderCell>
                    <TableHeaderCell align="right">Material margin %</TableHeaderCell>
                  </tr>
                </thead>
                <tbody>
                  {groupMarginRows.map((groupRow) => {
                    const code = getDisplayCurrencyCode(groupRow.currency, displaySettings);
                    return (
                      <tr key={groupRow.groupKey} className="border-t border-slate-100">
                        <td className="px-2 py-2 text-xs">{groupRow.groupKey}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums">
                          {formatCurrency(
                            convertToDisplayCurrency(
                              groupRow.sales,
                              groupRow.currency,
                              displaySettings,
                            ),
                            code,
                          )}
                        </td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums">
                          {formatCurrency(
                            convertToDisplayCurrency(
                              groupRow.materialMarginDollars,
                              groupRow.currency,
                              displaySettings,
                            ),
                            code,
                          )}
                        </td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums">
                          {formatMarginPercent(groupRow.materialMarginPercent)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <Button type="button" onClick={onCalculate}>
          {calculated ? 'Recalculate Lever 2' : 'Calculate Lever 2'}
        </Button>

        <BottomUpLeverDetailTable
          title="Lever 2 build-up detail — one row per part number"
          note={
            settings.included ? undefined : 'Lever 2 is excluded — opportunity shows as $0.'
          }
          rows={detailRows}
          columnCount={12}
          minWidthClass="min-w-[64rem]"
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
                Incoming price (P₁)
              </DetailHeaderCell>
              <DetailHeaderCell align="right">Material/unit ({anchorYear})</DetailHeaderCell>
              <DetailHeaderCell align="right">Part material margin %</DetailHeaderCell>
              <DetailHeaderCell align="right">Group avg material margin %</DetailHeaderCell>
              <DetailHeaderCell align="right" className="border-l border-slate-200">
                Should price
              </DetailHeaderCell>
              <DetailHeaderCell align="right">Lever 2 price (P₂)</DetailHeaderCell>
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
                {unitMoney(r.anchorMaterial, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {formatMarginPercent(r.partMargin)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {formatMarginPercent(r.groupMargin)}
              </td>
              <td className="border-l border-slate-100 px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.shouldPrice, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs font-medium tabular-nums">
                {unitMoney(r.p2, r.currency)}
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
