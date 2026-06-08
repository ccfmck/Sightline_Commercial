import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { excelCellToGridValue, getColumnClassificationReport, parseWorkbookGrid } from '../src/lib/parseExcel';

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplePath = join(__dirname, '..', 'data', 'Silver - Brazil test data.xlsx');

function sheetToGrid(sheet: XLSX.WorkSheet): string[][] {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  const grid: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) {
        row.push('');
        continue;
      }
      row.push(excelCellToGridValue(cell));
    }
    grid.push(row);
  }
  return grid;
}

const buf = readFileSync(samplePath);
const wb = XLSX.read(buf, { type: 'buffer', cellText: true, raw: false });
const sheetName = wb.SheetNames[0];
const grid = sheetToGrid(wb.Sheets[sheetName]);
const result = parseWorkbookGrid(grid, sheetName);

console.log(getColumnClassificationReport(result));
