import { useMemo } from 'react';
import type { PartProgramRecord } from '../types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { dataTableClassName, TableHeaderCell } from './ui/table-header-cell';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValueLeft,
} from './ui/select';

const FILTER_FIELDS = [
  { key: 'Division', label: 'Division / Plant' },
  { key: 'Program Name', label: 'Program' },
  { key: 'OEM', label: 'OEM' },
  { key: 'Part number', label: 'Part Number' },
  { key: 'Part description', label: 'Part Name' },
] as const;

interface FilterBarProps {
  records: PartProgramRecord[];
  filters: Record<string, string>;
  selectedIds: Set<string>;
  onFilterChange: (key: string, value: string) => void;
  onToggleRow: (id: string) => void;
  onSelectAllFiltered: () => void;
  onClearSelection: () => void;
  embedded?: boolean;
}

function getFieldValue(record: PartProgramRecord, key: string): string {
  return record.metadata[key] ?? '';
}

export function FilterBar({
  records,
  filters,
  selectedIds,
  onFilterChange,
  onToggleRow,
  onSelectAllFiltered,
  onClearSelection,
  embedded = false,
}: FilterBarProps) {
  const filterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const field of FILTER_FIELDS) {
      const values = new Set<string>();
      for (const record of records) {
        const value = getFieldValue(record, field.key);
        if (value) values.add(value);
      }
      options[field.key] = [...values].sort();
    }
    return options;
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) =>
      Object.entries(filters).every(([key, value]) => {
        if (!value || value === '__all__') return true;
        return getFieldValue(record, key) === value;
      }),
    );
  }, [records, filters]);

  const content = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!embedded && <h3 className="text-base font-semibold">Filters & Selection</h3>}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{filteredRecords.length} matching rows</Badge>
          <Badge variant="outline">{selectedIds.size} selected</Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {FILTER_FIELDS.map((field) => {
          const available = filterOptions[field.key] ?? [];
          if (!available.length) return null;
          return (
            <div key={field.key} className="space-y-1.5">
              <Label>{field.label}</Label>
              <Select
                value={filters[field.key] ?? '__all__'}
                onValueChange={(value) => onFilterChange(field.key, value)}
              >
                <SelectTrigger>
                  <SelectValueLeft placeholder={`All ${field.label}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {available.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onSelectAllFiltered}>
          Select all filtered
        </Button>
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          Clear selection
        </Button>
      </div>

      <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200">
        <table className={dataTableClassName}>
          <thead className="sticky top-0 z-10">
            <tr>
              <TableHeaderCell widthClass="w-10" />
              <TableHeaderCell widthClass="w-[5rem]">OEM</TableHeaderCell>
              <TableHeaderCell widthClass="w-[6rem]">Program</TableHeaderCell>
              <TableHeaderCell widthClass="w-[5rem]">Division</TableHeaderCell>
              <TableHeaderCell widthClass="w-[7rem]">Part</TableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((record) => (
              <tr key={record.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Checkbox
                    checked={selectedIds.has(record.id)}
                    onCheckedChange={() => onToggleRow(record.id)}
                  />
                </td>
                <td className="truncate px-3 py-2">{record.metadata['OEM'] ?? '—'}</td>
                <td className="truncate px-3 py-2">{record.metadata['Program Name'] ?? '—'}</td>
                <td className="truncate px-3 py-2">{record.metadata['Division'] ?? '—'}</td>
                <td className="truncate px-3 py-2">
                  {record.metadata['Part description'] ?? record.metadata['Part number'] ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (embedded) return content;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Filters & Selection</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
