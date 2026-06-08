import { useCallback, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { cn } from '../lib/utils';

interface ExcelUploadProps {
  onFileSelected: (file: File) => void;
  isLoading?: boolean;
}

export function ExcelUpload({ onFileSelected, isLoading }: ExcelUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'xlsx' && ext !== 'xls') return;
      onFileSelected(file);
    },
    [onFileSelected],
  );

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-slate-700" />
          Margin Erosion Analysis
        </CardTitle>
        <CardDescription>
          Upload your commercial program workbook to visualize price, volume, and cost trends.
          Supported formats: .xlsx, .xls
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            'flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 transition-colors',
            isDragging ? 'border-slate-900 bg-slate-50' : 'border-slate-300 bg-slate-50/50',
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <Upload className="mb-4 h-10 w-10 text-slate-400" />
          <p className="mb-2 text-sm font-medium text-slate-700">
            Drag and drop your Excel workbook here
          </p>
          <p className="mb-4 text-xs text-slate-500">Expects a 4-row header layout (program info, at quote, annual years)</p>
          <label>
            <input
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button variant="outline" disabled={isLoading} asChild>
              <span>{isLoading ? 'Parsing…' : 'Browse files'}</span>
            </Button>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
