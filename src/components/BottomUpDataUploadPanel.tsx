import { useCallback, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import type { BottomUpParseResult, CostComponentMapping, ParseResult } from '../types';
import { adaptExistingToBottomUp } from '../lib/adaptExistingToBottomUp';
import { parseBottomUpExcelFile } from '../lib/parseBottomUpExcel';
import { PAGE_CHROME_OFFSET } from './tabSections';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValueLeft,
} from './ui/select';
import { cn } from '../lib/utils';

type DataSourceMode = 'template' | 'existing';

interface BottomUpDataUploadPanelProps {
  parseResult: ParseResult | null;
  bottomUpData: BottomUpParseResult | null;
  beginningYear: number;
  anchorYear: number;
  costMapping: CostComponentMapping;
  onDataLoaded: (result: BottomUpParseResult) => void;
  onBeginningYearChange: (year: number) => void;
  onAnchorYearChange: (year: number) => void;
  onCostMappingChange: (mapping: CostComponentMapping) => void;
}

export function BottomUpDataUploadPanel({
  parseResult,
  bottomUpData,
  beginningYear,
  anchorYear,
  costMapping,
  onDataLoaded,
  onBeginningYearChange,
  onAnchorYearChange,
  onCostMappingChange,
}: BottomUpDataUploadPanelProps) {
  const [mode, setMode] = useState<DataSourceMode>(parseResult ? 'existing' : 'template');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localWarnings, setLocalWarnings] = useState<string[]>([]);

  const availableYears =
    bottomUpData?.availableYears ?? parseResult?.availableHistoricalYears ?? [];

  const handleTemplateFile = useCallback(
    async (file: File) => {
      setIsLoading(true);
      setError(null);
      try {
        const buffer = await file.arrayBuffer();
        const result = await parseBottomUpExcelFile(buffer);
        if (result.records.length === 0) {
          setError(
            'No data rows found in the template. Confirm the sheet has a Beginning/Anchor header ' +
              'row followed by part rows, then try again.',
          );
          setLocalWarnings(result.warnings);
          return;
        }
        onDataLoaded(result);
        setLocalWarnings(result.warnings);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse bottom-up template.');
      } finally {
        setIsLoading(false);
      }
    },
    [onDataLoaded],
  );

  const handleTemplateFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'xlsx' && ext !== 'xls') {
        setError('Unsupported file type. Please upload an .xlsx or .xls file.');
        return;
      }
      void handleTemplateFile(file);
    },
    [handleTemplateFile],
  );

  function applyExistingWorkbook() {
    if (!parseResult) return;
    setError(null);
    const result = adaptExistingToBottomUp(parseResult, beginningYear, anchorYear, costMapping);
    onDataLoaded(result);
    setLocalWarnings(result.warnings);
  }

  function toggleComponent(
    category: keyof CostComponentMapping,
    component: string,
    checked: boolean,
  ) {
    const current = costMapping[category];
    const next = checked ? [...current, component] : current.filter((c) => c !== component);
    onCostMappingChange({ ...costMapping, [category]: next });
  }

  const hasRecords = bottomUpData !== null && bottomUpData.records.length > 0;
  const warnings = bottomUpData?.warnings ?? localWarnings;

  return (
    <Card id="bottom-up-data" style={{ scrollMarginTop: PAGE_CHROME_OFFSET + 12 }}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-5 w-5 text-slate-700" />
          Bottom-up data upload
        </CardTitle>
        <CardDescription>
          Upload the simplified bottom-up template or map cost components from the main workbook.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === 'template' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('template')}
          >
            Dedicated template
          </Button>
          <Button
            type="button"
            variant={mode === 'existing' ? 'default' : 'outline'}
            size="sm"
            disabled={!parseResult}
            onClick={() => setMode('existing')}
          >
            Existing workbook
          </Button>
        </div>

        {mode === 'template' && (
          <div
            className={cn(
              'flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors',
              isDragging ? 'border-slate-900 bg-slate-50' : 'border-slate-300 bg-slate-50/50',
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (isLoading) return;
              handleTemplateFiles(e.dataTransfer.files);
            }}
          >
            <Upload className="mb-3 h-8 w-8 text-slate-400" />
            <p className="mb-2 text-sm font-medium text-slate-700">
              Drag and drop your bottom-up Excel template here
            </p>
            <p className="mb-3 text-xs text-slate-500">
              1–2 row header with Beginning and Anchor year columns
            </p>
            <label>
              <input
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                disabled={isLoading}
                onChange={(e) => {
                  handleTemplateFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <Button type="button" variant="outline" size="sm" disabled={isLoading} asChild>
                <span>{isLoading ? 'Parsing…' : 'Choose file'}</span>
              </Button>
            </label>
          </div>
        )}

        {mode === 'existing' && parseResult && (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <p className="text-sm text-slate-700">
              Map detected cost components to Material, Labor, and Burden, then load from the main
              workbook ({parseResult.rowCount} parts).
            </p>

            <div className="grid gap-4 lg:grid-cols-3">
              {(['material', 'labor', 'burden'] as const).map((category) => (
                <div key={category}>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {category}
                  </h4>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-slate-200 bg-white p-2">
                    {parseResult.costComponents.map((component) => (
                      <label
                        key={`${category}-${component}`}
                        className="flex items-center gap-2 text-xs text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={costMapping[category].includes(component)}
                          onChange={(e) =>
                            toggleComponent(category, component, e.target.checked)
                          }
                        />
                        <span className="truncate" title={component}>
                          {component}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Beginning year</Label>
                <Select
                  value={String(beginningYear)}
                  onValueChange={(v) => onBeginningYearChange(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValueLeft placeholder="Beginning year" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Anchor year</Label>
                <Select
                  value={String(anchorYear)}
                  onValueChange={(v) => onAnchorYearChange(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValueLeft placeholder="Anchor year" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="button" onClick={applyExistingWorkbook}>
              Load from existing workbook
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {hasRecords && bottomUpData && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Sheet: {bottomUpData.sheetName}</Badge>
            <Badge variant="secondary">{bottomUpData.rowCount} parts</Badge>
            <Badge variant="outline">
              Years: {bottomUpData.beginningYear} → {bottomUpData.anchorYear}
            </Badge>
            {warnings.slice(0, 3).map((w) => (
              <Badge key={w} variant="accent" className="max-w-full whitespace-normal">
                {w}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
