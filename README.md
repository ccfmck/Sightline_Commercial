# Sightline Commercial

A client-side web tool for tier-one automotive supplier commercial teams. Upload an Excel workbook to size **margin erosion** and **bleeder/leaker** commercial recovery opportunities at the **cost-component** or **margin-%** level, visualize **price**, **volume**, and **cost** evolution over time, and compare each period to a configurable **anchor year**.

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

## Application tabs

The left sidebar switches between three views. Each tab has a horizontal **Jump to** bar for its sections.

### Tab 1 — Data & assumptions

1. **Upload** — upload or replace the workbook
2. **Data summary** — detected sheet, part count, currencies, parse warnings
3. **Inputs & assumptions** — anchor year, target EBIT margin, external factor, capture rate, currency display, FX rates

### Tab 2 — Margin erosion sizing (at cost level)

1. **Commercial opportunity sizing** — portfolio KPIs, per-part sizing table with basis override, detail drawer with chart
2. **Price, cost, and margin evolution** — filter/select parts, combo chart, period summary table

### Tab 3 — Margin erosion sizing (at margin % level)

1. **Margin configuration** — choose material, contribution, or EBIT margin to optimize; map cost components to margin levels (cumulative buckets)
2. **Commercial opportunity sizing** — portfolio KPIs and per-part table sized to close the gap between anchor-year margin and the best reference-frame margin

## Sizing logic (summary)

### At cost level (Tab 2)

- **Margin erosion** — compares anchor-year costs to reference frames (`At Quote` and years before anchor); sizes when price pass-through lags cost build
- **Bleeder / leaker** — compares anchor-year EBIT margin to a target margin
- **Full potential** — max of erosion and bleeder/leaker sizing
- **Recovery target** — full potential × external factor × capture rate

Per-part **sizing basis** can be overridden (auto, specific frame, bleeder, leaker, or exclude from totals).

### At margin % level (Tab 3)

- **Margin gap** — for each part, compares anchor-year margin % (material, contribution, or EBIT per user config) to all reference frames and sizes price uplift to reach the **highest** reference margin
- **Bleeder / leaker** — same EBIT-based logic as Tab 2, regardless of which margin type is selected for optimization
- **Full potential** — max of margin-gap and bleeder/leaker sizing
- **Recovery target** — same haircut formula as Tab 2

Per-part **sizing basis** can be overridden (auto, bleeder, leaker, or exclude from totals).

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
    opportunitySizing.ts     — margin erosion & bleeder/leaker sizing (cost level)
    marginPercentSizing.ts   — margin-% gap sizing & bleeder/leaker (margin % level)
    marginComponentDefaults.ts — default cost-component → margin level mapping
    currency.ts          — FX conversion for display
    format.ts            — number/currency formatting
  types/
    index.ts
  components/
    AppBanner.tsx
    AppTabNav.tsx
    TabSectionNav.tsx
    DataAssumptionsTab.tsx
    CostLevelSizingTab.tsx
    MarginPercentSizingTab.tsx
    MarginComponentMappingPanel.tsx
    MarginPercentOpportunityPanel.tsx
    MarginPercentDetailDrawer.tsx
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

1. Upload an Excel workbook (Tab 1)
2. Review detected sheet, periods, cost components, and any parse warnings
3. Set anchor year, margin targets, haircuts, and currency/FX assumptions
4. **Cost level tab** — review portfolio sizing totals and per-part table; override sizing basis as needed; filter parts for price/cost/margin charts
5. **Margin % tab** — configure margin type and cost-component mapping; review margin-gap sizing and override basis as needed
6. Double-click a row in either sizing table for part-level detail

## Not yet implemented

- Export to PowerPoint/PDF
- Authentication / backend API
- Multi-currency aggregation in charts when parts with mixed currencies are selected together
