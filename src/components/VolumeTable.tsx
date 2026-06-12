import type { AggregationResult } from '../types';
import { formatPeriodAxisLabel } from '../lib/aggregate';
import { formatMarginPercent, formatUnitValue, formatVolume } from '../lib/format';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { cn } from '../lib/utils';

interface VolumeTableProps {
  aggregation: AggregationResult;
  embedded?: boolean;
}

export function VolumeTable({ aggregation, embedded = false }: VolumeTableProps) {
  const { periods } = aggregation;

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2 text-right">Volume</th>
              <th className="px-3 py-2 text-right">Avg Price</th>
              <th className="px-3 py-2 text-right">Total Cost</th>
              <th className="px-3 py-2 text-right">EBIT Margin</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr
                key={period.periodId}
                className={cn(
                  'border-b border-slate-100',
                  period.isAnchorYear && period.periodId !== 'at_quote' && 'bg-amber-50/60',
                )}
              >
                <td className="px-3 py-2 font-medium">
                  {formatPeriodAxisLabel(period.periodId, period.label)}
                  {period.isAnchorYear && period.periodId !== 'at_quote' && (
                    <span className="ml-2 text-xs font-normal text-amber-700">(anchor)</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatVolume(period.volume)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatUnitValue(period.avgPrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatUnitValue(period.totalCost)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {formatMarginPercent(period.ebitMarginPercent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );

  if (embedded) {
    return (
      <div>
        <h3 className="mb-3 text-base font-semibold">Period Summary</h3>
        {table}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Period Summary</CardTitle>
      </CardHeader>
      <CardContent>{table}</CardContent>
    </Card>
  );
}

