# tracking-list-tab-perf.spec.ts

Source: [tests/performance/tracking-list-tab-perf.spec.ts](../../tests/performance/tracking-list-tab-perf.spec.ts)

## Purpose

This file compares first-visit and revisit performance across the Tracking List tabs. It then adds search timing and shipment-detail navigation so the report tells a full story of how a user explores the list after arriving there.

## Imported helpers worth following

- `seedLogin()` — login bootstrap in [tests/seed.spec.ts](../../tests/seed.spec.ts#L4)
- `createNetworkTracker()` — request tracker in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L337)
- `measureAction()` — generic action timer in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L399)
- `getMemoryMetrics()` — memory reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L316)
- `createConsoleTracker()` — console tracker in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L454)

## Story of the file

### 1. The file defines a report shape built around comparison

Its interfaces separate first-visit timings, revisit timings, cache comparison, search profiling, shipment-detail profiling, memory snapshots, API summaries, and console errors.

### 2. Local helpers support API normalization, ratings, and persistence

The helper area calculates percentiles, converts tracked requests into report-ready records, creates timestamps and folders, and builds the long text report used for saved output.

### 3. The test starts by reaching Tracking List and capturing baseline state

After login and home-page readiness, it navigates to Tracking List, records the initial navigation API activity, and stores a first memory snapshot.

### 4. The first pass through tabs records cold or early-visit behavior

The file visits each configured tab in order and records switch time, data-load time, network idle time, visible row count, API count, and slowest API call.

### 5. The second pass repeats the same tabs to expose warm-cache behavior

The revisit loop is structurally similar to the first loop, but its purpose is comparison. This is what lets the report show whether the app benefits from repeat access.

### 6. The cache comparison section turns the two passes into percentage change

For each tab, the file compares first-visit and revisit durations and calculates improvement or regression.

### 7. The scenario then broadens into search and detail navigation

It returns to the all-shipments view, searches for a shipment-related term, measures that search, and then attempts to click a shipment link to profile navigation to the detail page.

### 8. The run ends with memory, console, and saved report output

Final memory snapshots and console results are added, then the file prints and saves the complete report without relying on very strict hard assertions.

## Why this file is valuable

It is the best place to inspect whether Tracking List benefits from warm data and whether exploring from the list into detail pages stays efficient.