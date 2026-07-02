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

The left sidebar switches between four views. Each tab has a horizontal **Jump to** bar for its sections.

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

### Tab 4 — Bottom-up erosion sizing (multi-lever)

Sequential wizard: **Data → Lever 1 → Lever 2 → Lever 3 → Lever 4 → Lever 5 → Summary**

1. **Data upload** — drag-and-drop or browse a simplified bottom-up Excel template (per-unit **or** total-dollar values with volume) **or** map an existing workbook's Material / Labor / Burden cost components; beginning + anchor year selection
2. **Lever 1** — material breakdown by group, inflation multipliers; inflation pass-through sizing
3. **Lever 2** — grouping for linear performance pricing (group avg material margin)
4. **Lever 3** — long-tail repricing (top 4/5 by volume set target CM%)
5. **Lever 4** — direct buy % and markup increase per group
6. **Lever 5** — target CM% (global or per group) leaker uplift
7. **Summary** — stacked lever composition chart, per-part table with all lever columns, expandable waterfall drawer

**Excel templates (bottom-up inputs workbook):**

| Sheet | Contents |
|-------|----------|
| Material list | Material type names |
| Breakdown matrix | Group × material → % (must sum to 100% per group) |
| Inflation | Material / labor / burden cumulative multipliers (beginning → anchor) |
| Lever 4 | Direct buy % and markup increase per group |
| Lever 5 | Target CM% per group (or global row) |

**Simplified data template columns:** metadata (OEM, Product Group, …), Beginning-year and Anchor-year metrics (price, material, labor, burden, volume, CM/unit), optional currency.

Each priced metric may be supplied **either** as a per-unit value **or** as a total dollar amount alongside that year's volume — the parser detects which and derives per-unit automatically:

| Metric | Per-unit headers | Total headers (÷ volume) |
|--------|------------------|--------------------------|
| Price | `Price/unit`, `Unit price` | `Total sales`, `Sales $`, `Revenue` |
| Material | `Material/unit` | `Total material cost`, `Material cost $` |
| Labor | `Labor/unit` | `Total labor` |
| Burden | `Burden/unit` | `Total burden` |
| Contribution margin | `CM/unit` | `Total contribution margin $` |
| Volume | `Volume`, `Quantity`, `Units` | — |

- Totals are divided by the **same year's** volume (beginning totals ÷ beginning volume, anchor totals ÷ anchor volume). Zero/blank volume yields a null per-unit value.
- If both a per-unit and a total column are present for a metric, the per-unit value is used.
- CM/unit is derived as `price − (material + labor + burden)` per unit when no CM column (per-unit or total) is provided.

**Sizing:** Total opportunity = sum of all 5 lever dollar opportunities (additive). Commercial recovery = total × external factor × capture rate.

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

### Bottom-up multi-lever (Tab 4)

- **Lever 1** — inflate beginning-year cost buckets; size when `should_price > anchor_price`
- **Lever 2** — `should_price = material / (1 − group_avg_material_margin)` when above P₁
- **Lever 3** — top 80% by volume set dollar-weighted target CM%; `P₃ = C / (1 − Target_CM%/100)` when below target
- **Lever 4** — `uplift = markup × material_cost × direct_buy%`
- **Lever 5** — same price solve as Lever 3 using user target CM%
- **Full potential** — sum of all lever dollar opportunities
- **Recovery target** — same haircut formula as Tabs 2–3

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
    bottomUpSizing.ts        — five-lever bottom-up erosion sizing
    parseBottomUpExcel.ts    — simplified bottom-up template parser
    adaptExistingToBottomUp.ts — map existing workbook to BottomUpRecord
    parseBottomUpInputsExcel.ts — supplemental lever inputs (breakdown, inflation, L4/L5)
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
    BottomUpSizingTab.tsx
    BottomUpDataUploadPanel.tsx
    BottomUpLever1Panel.tsx … BottomUpLever5Panel.tsx
    BottomUpOpportunityPanel.tsx
    BottomUpDetailDrawer.tsx
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
6. **Bottom-up tab** — load data, configure levers 1–5 in sequence, review portfolio summary and per-part waterfall
7. Double-click a row in any sizing table for part-level detail

## Not yet implemented

- Export to PowerPoint/PDF
- Authentication / backend API
- Multi-currency aggregation in charts when parts with mixed currencies are selected together
