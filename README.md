# Margin Erosion Sizing (at cost level)

A client-side web tool for tier-one automotive supplier commercial teams. Upload an Excel workbook to size **margin erosion** and **bleeder/leaker** commercial recovery opportunities, visualize **price**, **volume**, and **cost** evolution over time, and compare each period to a configurable **anchor year**.

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

All parsing and calculations run in the browser. No backend or database is required.

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

- **At Time of Quote** — quote baseline (quote price/volume + at-quote unit costs)
- **Annual years** — detected from section titles (e.g. `2024 Historical Actual`, `2026 Latest Estimate`)
- **Anchor year** — user-selectable; emphasized in charts and used for sizing comparisons

### Cost components

Cost buckets are **auto-detected** from headers (not hard-coded). Blank spacer rows without OEM/program/part identity are filtered out. Blank cost cells are omitted from stacked bars; only explicit zeros are treated as zero.

### Currency

Workbooks may include a `Currency` metadata column. The app supports display in **source currency** or **USD** with configurable FX rates.

## Application sections

1. **Data summary** — detected sheet, part count, cost components, currencies, parse warnings
2. **Inputs & assumptions** — anchor year, target EBIT margin, external factor, capture rate, currency display, FX rates
3. **Commercial opportunity sizing** — portfolio KPIs, per-part sizing table with basis override, detail drawer with chart
4. **Price, cost, and margin evolution** — filter/select parts, combo chart, period summary table

## Sizing logic (summary)

- **Margin erosion** — compares anchor-year costs to reference frames (`At Quote` and years before anchor); sizes when price pass-through lags cost build
- **Bleeder / leaker** — compares anchor-year EBIT margin to a target margin
- **Full potential** — max of erosion and bleeder/leaker sizing
- **Recovery target** — full potential × external factor × capture rate

Per-part **sizing basis** can be overridden (auto, specific frame, bleeder, leaker, or exclude from totals).

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
    parseExcel.ts        — workbook ingestion & 4-row header parsing
    detectMetrics.ts     — column classification (price, volume, cost, metadata)
    normalize.ts         — rows → typed PartProgramRecord
    rowFilter.ts         — blank/spacer row filtering
    aggregate.ts         — single-row & volume-weighted multi-row aggregation
    opportunitySizing.ts — margin erosion & bleeder/leaker sizing engine
    currency.ts          — FX conversion for display
    format.ts            — number/currency formatting
  types/
    index.ts
  components/
    AppBanner.tsx
    SectionNav.tsx
    ExcelUpload.tsx
    InputsAssumptionsPanel.tsx
    OpportunityPanel.tsx
    OpportunityDetailDrawer.tsx
    FilterBar.tsx
    MarginChart.tsx
    MarginPerformanceChart.tsx
    VolumeTable.tsx
    Dashboard.tsx
  App.tsx
scripts/
  parse-sample.ts        — CLI helper for debugging Excel parsing
data/
  Silver - Brazil test data.xlsx
```

## Workflow

1. Upload an Excel workbook
2. Review detected sheet, periods, cost components, and any parse warnings
3. Set anchor year, margin targets, haircuts, and currency/FX assumptions
4. Review portfolio sizing totals and per-part table; override sizing basis as needed
5. Double-click a row for part-level chart and sizing detail
6. Filter and select parts to view aggregated price/cost/margin evolution

## Not yet implemented

- Export to PowerPoint/PDF
- Authentication / backend API
- Multi-currency aggregation in charts when parts with mixed currencies are selected together
