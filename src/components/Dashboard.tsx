import { useEffect, useMemo, useState } from 'react';
import type { ParseResult } from '../types';
import { aggregateRecords } from '../lib/aggregate';
import { buildPeriods, getAvailableAnchorYears } from '../lib/periods';
import { ExcelUpload } from './ExcelUpload';
import { FilterBar } from './FilterBar';
import { MarginChart } from './MarginChart';
import { VolumeTable } from './VolumeTable';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface DashboardProps {
  parseResult: ParseResult | null;
  isLoading: boolean;
  onFileSelected: (file: File) => void;
}

export function Dashboard({ parseResult, isLoading, onFileSelected }: DashboardProps) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorYear, setAnchorYear] = useState<number | null>(null);

  const availableAnchorYears = useMemo(
    () => (parseResult ? getAvailableAnchorYears(parseResult) : []),
    [parseResult],
  );

  useEffect(() => {
    if (parseResult) {
      setAnchorYear(parseResult.defaultAnchorYear);
      setFilters({});
      setSelectedIds(new Set());
    }
  }, [parseResult]);

  const periods = useMemo(() => {
    if (!parseResult || anchorYear === null) return [];
    return buildPeriods(anchorYear, parseResult.hasAtQuote, parseResult.availableHistoricalYears);
  }, [parseResult, anchorYear]);

  const filteredRecords = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.records.filter((record) =>
      Object.entries(filters).every(([key, value]) => {
        if (!value || value === '__all__') return true;
        return (record.metadata[key] ?? '') === value;
      }),
    );
  }, [parseResult, filters]);

  const selectedRecords = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.records.filter((r) => selectedIds.has(r.id));
  }, [parseResult, selectedIds, selectedIds.size]);

  const aggregation = useMemo(() => {
    if (!parseResult || !selectedRecords.length || anchorYear === null) return null;
    return aggregateRecords(
      selectedRecords,
      periods,
      parseResult.costComponents,
      anchorYear,
    );
  }, [parseResult, selectedRecords, periods, anchorYear]);

  if (!parseResult) {
    return <ExcelUpload onFileSelected={onFileSelected} isLoading={isLoading} />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Margin Erosion Analysis
        </h1>
        <p className="text-sm text-slate-600">
          Size pricing and margin improvement opportunities across programs and parts.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Workbook Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Sheet: {parseResult.sheetName}</Badge>
            <Badge variant="secondary">{parseResult.rowCount} rows</Badge>
            {parseResult.warnings.map((warning) => (
              <Badge key={warning} variant="accent" className="max-w-full whitespace-normal">
                {warning}
              </Badge>
            ))}
          </div>

          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="anchor-year">Anchor year</Label>
            <Select
              value={anchorYear !== null ? String(anchorYear) : undefined}
              onValueChange={(value) => setAnchorYear(Number(value))}
            >
              <SelectTrigger id="anchor-year">
                <SelectValue placeholder="Select anchor year" />
              </SelectTrigger>
              <SelectContent>
                {availableAnchorYears.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                    {parseResult.availableQuoteYears.includes(year) ? ' (quote available)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              At Quote uses the {anchorYear} quote price, volume, and at-quote unit costs for comparison.
            </p>
          </div>
        </CardContent>
      </Card>

      <FilterBar
        records={parseResult.records}
        filters={filters}
        selectedIds={selectedIds}
        onFilterChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onToggleRow={(id) => {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        }}
        onSelectAllFiltered={() => setSelectedIds(new Set(filteredRecords.map((r) => r.id)))}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      {!selectedRecords.length ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            Select one or more programs/parts above to view margin and cost performance.
          </CardContent>
        </Card>
      ) : aggregation ? (
        <>
          <MarginChart aggregation={aggregation} />
          <VolumeTable aggregation={aggregation} />
        </>
      ) : null}

      <div className="text-center">
        <button
          type="button"
          className="text-sm text-slate-500 underline hover:text-slate-700"
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.xlsx,.xls';
            input.onchange = () => {
              const file = input.files?.[0];
              if (file) onFileSelected(file);
            };
            input.click();
          }}
        >
          Upload a different workbook
        </button>
      </div>
    </div>
  );
}
