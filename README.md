# Margin Erosion Analysis

A client-side web tool for tier-one automotive supplier commercial teams. Upload an Excel workbook to visualize how **average price**, **volume**, and **cost components** evolve from **At Time of Quote** through annual years — with **2025** as the anchor year for commercial discussions.

## Live demo

**https://ccfmck.github.io/Sightline_Commercial/**

Open the link, upload an Excel workbook (`.xlsx` or `.xls`), and explore. All parsing runs in your browser — nothing is uploaded to a server.

> **First-time setup:** After the deploy workflow runs, go to **Settings → Pages**, set **Source** to **Deploy from a branch**, choose branch **`gh-pages`**, folder **`/ (root)`**, and click **Save**. The site is public automatically because this repository is public.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal (typically `http://localhost:5173`).

## Supported file types

- `.xlsx` (preferred)
- `.xls`

All parsing and calculations run in the browser. No backend or database is required for the MVP.

## Excel layout expectations

The primary data sheet uses a **4-row header** before data rows:

| Row | Purpose |
|-----|---------|
| 1 | Section titles (e.g. Program Information, At Time of Quote, 2022, 2023…) |
| 2 | Optional sub-section labels (Price, Volume, Cost) |
| 3 | Optional units |
| 4 | Granular column names |

Data begins on **row 5**.

### Periods

- **At Time of Quote** — treated as the **2025 quote baseline** (2025 quote price/volume + at-quote unit costs)
- **Annual years** — detected from section titles (e.g. `2024 Historical Actual`, `2026 Latest Estimate`)
- **2025** is visually emphasized as the anchor comparison year

### Cost components

Cost buckets are **auto-detected** from headers (not hard-coded). Blank cells are omitted from stacked bars; only explicit zeros are treated as zero.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run test` | Run Vitest unit tests |
| `npm run parse:sample` | Parse the bundled Brazil sample workbook and print classification report |

## Project structure

```
src/
  lib/
    parseExcel.ts      — workbook ingestion & 4-row header parsing
    detectMetrics.ts   — column classification (price, volume, cost, metadata)
    normalize.ts       — rows → typed PartProgramRecord
    aggregate.ts       — single-row & volume-weighted multi-row aggregation
  types/
    index.ts
  components/
    ExcelUpload.tsx
    FilterBar.tsx
    MarginChart.tsx
    VolumeTable.tsx
    Dashboard.tsx
  App.tsx
```

## MVP workflow

1. Upload an Excel workbook
2. Review detected sheet, periods, cost components, and any parse warnings
3. Filter by Division, Program, OEM, Part
4. Select one or more rows
5. View the combo chart (stacked costs + average price line) and period summary table

## Out of scope (MVP)

- Base price toggle
- Export to PowerPoint/PDF
- Authentication / backend API
- Automated opportunity scoring
