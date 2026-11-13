# tracking-list-filter-performance.spec.ts

Source: [tests/performance/tracking-list-filter-performance.spec.ts](../../tests/performance/tracking-list-filter-performance.spec.ts)

## Purpose

This file focuses on the Tracking List page when a saved filter is applied. It measures initial table readiness, the speed of opening filter controls, the cost of applying the filter, and the behavior of every major tab after the filter is active.

## Imported helpers worth following

- `seedLogin()` — login bootstrap in [tests/seed.spec.ts](../../tests/seed.spec.ts#L4)
- `createNetworkTracker()` — request tracker in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L337)
- `getMemoryMetrics()` — memory reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L316)
- `createConsoleTracker()` — console tracker in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L454)

## Story of the file

### 1. The file introduces a Tracking-List-specific report shape

The top interfaces capture initial load state, filter application state, post-filter tab results, memory snapshots, API summaries, and console health.

### 2. Two local helpers are especially important for table understanding

One helper reads the visible table row count using several possible row selectors. Another helper extracts pagination text using multiple fallback patterns. These functions make the spec resilient to table markup variation.

### 3. The main test starts by getting the user to Tracking List

After login, the flow reaches the page, measures the initial load, stores the first row count and pagination message, and records a baseline memory snapshot.

### 4. The filter drawer and saved-filter panel are timed separately

Opening the drawer and opening the saved-filter list are treated as their own measurable interactions before the filter itself is even applied.

### 5. Applying the filter is measured as a full data refresh

The script clicks the named saved filter, waits for network and spinner behavior, then records the new row count, new pagination state, API traffic, and slowest call during the filter application.

### 6. Every Tracking List tab is then tested in the filtered state

For each configured tab, the file captures switch time, time to first row, full settle time, row count, pagination text, and API activity. That creates a side-by-side filtered comparison across the entire page.

### 7. The run ends with memory capture, saved output, and soft assertions

The final stage records memory again, stops console tracking, prints the report, writes JSON and text files into the dedicated folder, and performs a few loose timing checks.

## Why this file matters

If filters feel slow specifically on Tracking List, this is the spec that tells the clearest before-and-after story.