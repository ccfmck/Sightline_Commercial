import { useCallback, useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { parseExcelFile } from './lib/parseExcel';
import type { ParseResult } from './types';

function App() {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const result = await parseExcelFile(buffer);
      setParseResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse workbook.');
      setParseResult(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:px-6 lg:px-8">
          {error}
        </div>
      )}
      <Dashboard
        parseResult={parseResult}
        isLoading={isLoading}
        onFileSelected={handleFileSelected}
      />
    </div>
  );
}

export default App;
