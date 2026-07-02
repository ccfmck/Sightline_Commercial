import { useMemo, useState } from 'react';
import type {
  AppDisplaySettings,
  BottomUpRecord,
  Lever1Settings,
  PortfolioBottomUpOpportunityResult,
} from '../types';
import {
  bottomUpGroupKey,
  getBottomUpGroups,
  getNextMaterialName,
  renameMaterialInLever1Settings,
} from '../lib/bottomUpSizing';
import {
  mergeInflationIntoLever1,
  mergeInputsIntoLever1,
  parseBottomUpInputsExcelFile,
  parseInflationAssumptionsExcelFile,
} from '../lib/parseBottomUpInputsExcel';
import { formatVolume } from '../lib/format';
import { getRecordPartNumber } from '../lib/partNumber';
import { BottomUpGroupingFieldSelect } from './BottomUpGroupingFieldSelect';
import { BottomUpLeverIncludeToggle } from './BottomUpLeverIncludeToggle';
import {
  BottomUpLeverDetailTable,
  DetailGroupHeaderCell,
  DetailHeaderCell,
  makeDetailMoneyFormatters,
} from './BottomUpLeverDetailTable';
import { PAGE_CHROME_OFFSET } from './tabSections';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { cn } from '../lib/utils';

interface BottomUpLever1PanelProps {
  records: BottomUpRecord[];
  metadataFields: string[];
  settings: Lever1Settings;
  beginningYear: number;
  anchorYear: number;
  displaySettings: AppDisplaySettings;
  preview?: PortfolioBottomUpOpportunityResult | null;
  calculated?: boolean;
  onSettingsChange: (settings: Lever1Settings) => void;
  onCalculate: () => void;
}

export function BottomUpLever1Panel({
  records,
  metadataFields,
  settings,
  beginningYear,
  anchorYear,
  displaySettings,
  preview,
  calculated,
  onSettingsChange,
  onCalculate,
}: BottomUpLever1PanelProps) {
  const groups = getBottomUpGroups(records, settings.groupingField);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [inflationWarnings, setInflationWarnings] = useState<string[]>([]);
  const [inflationError, setInflationError] = useState<string | null>(null);

  const { unitMoney, totalMoney } = makeDetailMoneyFormatters(displaySettings);

  const recordsById = useMemo(
    () => new Map(records.map((r) => [r.id, r])),
    [records],
  );

  // One detail row per part number, joining the calc-derived Lever 1 result
  // (should-cost intermediates, P1, opportunity) with the record's beginning/
  // anchor actual cost build-up.
  const detailRows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.map((row) => {
      const record = recordsById.get(row.recordId);
      const beg = record?.beginning ?? null;
      const anc = record?.anchor ?? null;
      const l1 = row.levers.lever1;
      const sum = (
        a: number | null | undefined,
        b: number | null | undefined,
        c: number | null | undefined,
      ) => (a == null || b == null || c == null ? null : a + b + c);
      return {
        recordId: row.recordId,
        currency: row.currency,
        oem: row.metadata.OEM ?? '—',
        partNumber: getRecordPartNumber(row.metadata) ?? row.recordId,
        group: bottomUpGroupKey(row.metadata, settings.groupingField),
        begPrice: beg?.price ?? null,
        begMaterial: beg?.materialCost ?? null,
        begLabor: beg?.laborCost ?? null,
        begBurden: beg?.burdenCost ?? null,
        begTotal: sum(beg?.materialCost, beg?.laborCost, beg?.burdenCost),
        anchorPrice: anc?.price ?? row.anchorPrice,
        anchorMaterial: anc?.materialCost ?? null,
        anchorLabor: anc?.laborCost ?? null,
        anchorBurden: anc?.burdenCost ?? null,
        anchorTotal: sum(anc?.materialCost, anc?.laborCost, anc?.burdenCost),
        shouldMaterial: l1.shouldMaterial ?? null,
        shouldLabor: l1.shouldLabor ?? null,
        shouldBurden: l1.shouldBurden ?? null,
        shouldTotal: l1.shouldTotalCost ?? null,
        p1: l1.price,
        anchorVolume: row.anchorVolume,
        opportunity: l1.dollarOpportunity,
      };
    });
  }, [preview, recordsById, settings.groupingField]);

  function updateGroupingField(field: string) {
    onSettingsChange({ ...settings, groupingField: field });
  }

  function addMaterial() {
    const name = getNextMaterialName(settings.materials);
    onSettingsChange({
      ...settings,
      materials: [...settings.materials, name],
      inflation: {
        ...settings.inflation,
        materialRates: { ...settings.inflation.materialRates, [name]: 1 },
      },
    });
  }

  function renameMaterial(oldName: string, newName: string) {
    onSettingsChange(renameMaterialInLever1Settings(settings, oldName, newName));
  }

  function updateBreakdown(group: string, material: string, raw: string) {
    const value = Number(raw);
    const breakdown = { ...(settings.breakdownByGroup[group] ?? {}) };
    breakdown[material] = Number.isFinite(value) ? value : 0;
    onSettingsChange({
      ...settings,
      breakdownByGroup: { ...settings.breakdownByGroup, [group]: breakdown },
    });
  }

  function updateInflation(
    key: 'laborRate' | 'burdenRate' | string,
    raw: string,
    isMaterial: boolean,
  ) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;
    if (isMaterial) {
      onSettingsChange({
        ...settings,
        inflation: {
          ...settings.inflation,
          materialRates: { ...settings.inflation.materialRates, [key]: value },
        },
      });
    } else {
      onSettingsChange({
        ...settings,
        inflation: { ...settings.inflation, [key]: value },
      });
    }
  }

  async function importInputs(file: File) {
    setImportError(null);
    try {
      const buffer = await file.arrayBuffer();
      const inputs = await parseBottomUpInputsExcelFile(buffer, {
        groupingFields: metadataFields,
      });

      const warnings = [...inputs.warnings];
      const resolvedGroupingField = inputs.detectedGroupingField ?? settings.groupingField;

      if (inputs.groupColumnHeader && !inputs.detectedGroupingField) {
        warnings.push(
          `Could not match the file's grouping column "${inputs.groupColumnHeader}" to a ` +
            `loaded field; keeping the current grouping field.`,
        );
      }

      // Surface any file groups that won't line up with the (resolved) grouping
      // field's values in the loaded data so mismatches are never silent.
      if (Object.keys(inputs.breakdownByGroup).length > 0) {
        const dataGroups = new Set(getBottomUpGroups(records, resolvedGroupingField));
        const unmatched = Object.keys(inputs.breakdownByGroup).filter(
          (g) => !dataGroups.has(g),
        );
        if (unmatched.length > 0) {
          warnings.push(
            `${unmatched.length} group(s) from the file are not present in the loaded data ` +
              `under "${resolvedGroupingField}": ${unmatched.join(', ')}.`,
          );
        }
      }

      onSettingsChange(mergeInputsIntoLever1(settings, inputs));
      setImportWarnings(warnings);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Failed to parse the material composition file.',
      );
    }
  }

  async function importInflation(file: File) {
    setInflationError(null);
    try {
      const buffer = await file.arrayBuffer();
      const result = await parseInflationAssumptionsExcelFile(buffer, {
        materials: settings.materials,
      });
      onSettingsChange(mergeInflationIntoLever1(settings, result));

      const warnings = [...result.warnings];
      if (result.matchedMaterials.length > 0) {
        warnings.unshift(
          `Applied inflation to ${result.matchedMaterials.length} material(s): ` +
            `${result.matchedMaterials.join(', ')}` +
            `${result.laborRate !== null ? ', labor' : ''}` +
            `${result.burdenRate !== null ? ', burden' : ''}.`,
        );
      }
      setInflationWarnings(warnings);
    } catch (err) {
      setInflationError(
        err instanceof Error ? err.message : 'Failed to parse the inflation file.',
      );
    }
  }

  function pickFile(onFile: (file: File) => void) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) onFile(file);
    };
    input.click();
  }

  return (
    <Card id="bottom-up-lever1" style={{ scrollMarginTop: PAGE_CHROME_OFFSET + 12 }}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Lever 1 — Inflation pass-through</CardTitle>
            <CardDescription>
              Split material cost by type, apply cumulative inflation rates from beginning to anchor
              year, and size price pass-through.
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
              onValueChange={updateGroupingField}
            />
          </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => pickFile((file) => void importInputs(file))}
            >
              Import material composition
            </Button>
          <Button type="button" size="sm" variant="outline" onClick={addMaterial}>
            Add material
          </Button>
        </div>

        {importError && <p className="text-xs text-red-600">Material composition: {importError}</p>}
        {importWarnings.length > 0 && (
          <ul className="space-y-1 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <li className="font-medium">Material composition import</li>
            {importWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Material % allocation</h3>
            <p className="text-xs text-slate-500">
              Click a material name to rename it. Within each group, the material percentages must
              add up to 100%.
            </p>
          </div>
          <div className="overflow-x-auto rounded border border-slate-200">
          <table className="w-full min-w-[480px] text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium text-slate-600">Group</th>
                {settings.materials.map((m) => (
                  <th key={m} className="px-2 py-1.5 text-right font-medium text-slate-600">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="text"
                        key={m}
                        defaultValue={m}
                        aria-label={`Material name for ${m}`}
                        className="h-7 min-w-[5rem] flex-1 rounded border border-slate-300 px-1 text-right text-xs font-medium text-slate-700"
                        onBlur={(e) => renameMaterial(m, e.target.value)}
                      />
                      <span>%</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 text-slate-800">{group}</td>
                  {settings.materials.map((material) => (
                    <td key={material} className="px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        className="h-7 w-full rounded border border-slate-300 px-1 text-right text-xs"
                        value={settings.breakdownByGroup[group]?.[material] ?? ''}
                        onChange={(e) => updateBreakdown(group, material, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Inflation assumptions</h3>
              <p className="text-xs text-slate-500">
                Each multiplier represents the cumulative inflation from the beginning year (
                {beginningYear}) to the anchor year ({anchorYear}). Use 1.0 for no change — for
                example, 1.12 means costs rose 12% over that period.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => pickFile((file) => void importInflation(file))}
            >
              Import inflation
            </Button>
          </div>

          {inflationError && (
            <p className="text-xs text-red-600">Inflation: {inflationError}</p>
          )}
          {inflationWarnings.length > 0 && (
            <ul className="space-y-1 rounded border border-sky-200 bg-sky-50 p-2 text-xs text-sky-800">
              <li className="font-medium">Inflation import</li>
              {inflationWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {settings.materials.map((material) => (
            <div key={material} className="space-y-1">
              <Label>{material} inflation (multiplier)</Label>
              <input
                type="number"
                min={0}
                step={0.01}
                className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                value={settings.inflation.materialRates[material] ?? 1}
                onChange={(e) => updateInflation(material, e.target.value, true)}
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label>Labor inflation</Label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
              value={settings.inflation.laborRate}
              onChange={(e) => updateInflation('laborRate', e.target.value, false)}
            />
          </div>
          <div className="space-y-1">
            <Label>Burden inflation</Label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
              value={settings.inflation.burdenRate}
              onChange={(e) => updateInflation('burdenRate', e.target.value, false)}
            />
          </div>
        </div>
        </div>
        </div>

        <Button type="button" onClick={onCalculate}>
          {calculated ? 'Recalculate Lever 1' : 'Calculate Lever 1'}
        </Button>

        <BottomUpLeverDetailTable
          title="Cost build-up detail — one row per part number"
          note={
            settings.included
              ? undefined
              : 'Lever 1 is excluded — opportunity shows as $0.'
          }
          rows={detailRows}
          columnCount={20}
          filterColumns={[
            { key: 'oem', label: 'OEM', columnIndex: 0, accessor: (r) => r.oem },
            { key: 'partNumber', label: 'Part number', columnIndex: 1, accessor: (r) => r.partNumber },
            { key: 'group', label: 'Group', columnIndex: 2, accessor: (r) => r.group },
          ]}
          head={
            <>
              <tr>
                <DetailHeaderCell>OEM</DetailHeaderCell>
                <DetailHeaderCell>Part number</DetailHeaderCell>
                <DetailHeaderCell>Group</DetailHeaderCell>
                <DetailGroupHeaderCell colSpan={5}>{beginningYear} actual</DetailGroupHeaderCell>
                <DetailGroupHeaderCell colSpan={5}>{anchorYear} actual</DetailGroupHeaderCell>
                <DetailGroupHeaderCell colSpan={4}>
                  {anchorYear} should-cost
                </DetailGroupHeaderCell>
                <DetailHeaderCell align="right" className="border-l border-slate-200">
                  Lever 1 price (P₁)
                </DetailHeaderCell>
                <DetailHeaderCell align="right">Anchor volume</DetailHeaderCell>
                <DetailHeaderCell align="right">Total opportunity</DetailHeaderCell>
              </tr>
              <tr>
                <th className="bg-slate-50 px-2 py-1" />
                <th className="bg-slate-50 px-2 py-1" />
                <th className="bg-slate-50 px-2 py-1" />
                <DetailHeaderCell align="right" className="border-l border-slate-200">
                  Actual price
                </DetailHeaderCell>
                <DetailHeaderCell align="right">Material/unit</DetailHeaderCell>
                <DetailHeaderCell align="right">Labor/unit</DetailHeaderCell>
                <DetailHeaderCell align="right">Burden/unit</DetailHeaderCell>
                <DetailHeaderCell align="right">Total cost</DetailHeaderCell>
                <DetailHeaderCell align="right" className="border-l border-slate-200">
                  Actual price
                </DetailHeaderCell>
                <DetailHeaderCell align="right">Material/unit</DetailHeaderCell>
                <DetailHeaderCell align="right">Labor/unit</DetailHeaderCell>
                <DetailHeaderCell align="right">Burden/unit</DetailHeaderCell>
                <DetailHeaderCell align="right">Total cost</DetailHeaderCell>
                <DetailHeaderCell align="right" className="border-l border-slate-200">
                  Material
                </DetailHeaderCell>
                <DetailHeaderCell align="right">Labor</DetailHeaderCell>
                <DetailHeaderCell align="right">Burden</DetailHeaderCell>
                <DetailHeaderCell align="right">Total cost</DetailHeaderCell>
                <th className="border-l border-slate-200 bg-slate-50 px-2 py-1" />
                <th className="bg-slate-50 px-2 py-1" />
                <th className="bg-slate-50 px-2 py-1" />
              </tr>
            </>
          }
          renderRow={(r) => (
            <tr key={r.recordId} className="border-t border-slate-100 hover:bg-slate-50/80">
              <td className="px-2 py-2 text-xs">{r.oem}</td>
              <td className="px-2 py-2 text-xs">{r.partNumber}</td>
              <td className="px-2 py-2 text-xs">{r.group}</td>
              <td className="border-l border-slate-100 px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.begPrice, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.begMaterial, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.begLabor, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.begBurden, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs font-medium tabular-nums">
                {unitMoney(r.begTotal, r.currency)}
              </td>
              <td className="border-l border-slate-100 px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.anchorPrice, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.anchorMaterial, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.anchorLabor, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.anchorBurden, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs font-medium tabular-nums">
                {unitMoney(r.anchorTotal, r.currency)}
              </td>
              <td className="border-l border-slate-100 px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.shouldMaterial, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.shouldLabor, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.shouldBurden, r.currency)}
              </td>
              <td className="px-2 py-2 text-right text-xs font-medium tabular-nums">
                {unitMoney(r.shouldTotal, r.currency)}
              </td>
              <td className="border-l border-slate-100 px-2 py-2 text-right text-xs tabular-nums">
                {unitMoney(r.p1, r.currency)}
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
