# filter-performance.spec.ts

Source: [tests/performance/filter-performance.spec.ts](../../tests/performance/filter-performance.spec.ts)

## Purpose

This file profiles the saved-filter workflow on the home page. It measures initial dashboard readiness, the time to open and apply a saved filter, the impact on KPI cards, the map toggle after filtering, and mode-of-transport behavior after the filtered state is active.

## Imported helpers worth following

- `seedLogin()` — login bootstrap in [tests/seed.spec.ts](../../tests/seed.spec.ts#L4)
- `createNetworkTracker()` — request tracker in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L337)
- `getMemoryMetrics()` — memory reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L316)
- `createConsoleTracker()` — console tracker in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L454)

## Other imports

- `fs` and `path` from Node are used to persist JSON and text reports.
- `test` and `expect` from Playwright run the scenario and protect broad thresholds.

## Story of the file

### 1. The top of the file defines a rich local reporting model

Several interfaces describe KPI timing, filter timing, map toggle timing, transport tab timing, API statistics, memory snapshots, and overall report structure. This means the file is designed to save a detailed standalone artifact instead of depending on the shared report writer.

### 2. A block of local helpers supports statistics and persistence

The helper section calculates percentiles, summarizes API timings, normalizes raw tracked requests into report records, creates rating labels, builds timestamps, ensures output folders exist, and writes a human-readable report.

### 3. The test starts with full-session console tracking and shared accumulators

It prepares arrays for API calls and memory snapshots so each later step can add evidence to the final report.

### 4. Step 1 logs in and measures the first home-page load

The file tracks network activity while opening the home route, stores both login-to-home timing and page-load timing, captures initial API traffic, and records a baseline memory snapshot.

### 5. Step 2 measures the initial KPI cards before any filter is applied

It waits for each KPI label, measures when it becomes visible, and tries to read the displayed numeric value so the report records not only speed but also what the widget showed.

### 6. Step 3 applies the saved filter workflow

The script opens the filter drawer, opens the saved-filter panel with the settings icon, clicks the named saved filter, waits for reload behavior to finish, tracks the filter-related API calls, and then re-measures KPI cards in the filtered state.

### 7. Step 4 checks filtered interactions after the reload

With the filtered state active, the file toggles the map view and captures the API cost of that change.

### 8. Step 5 measures transport-specific tabs and widgets

The file iterates through Ocean, Air, Rail, and Road. For each one it times the switch, the network response phase, the visible data-display phase, and the rendering of related widgets.

### 9. The file finishes by saving a custom report and applying soft guardrails

It captures final memory and console state, prints the assembled report, writes JSON and text files into the dedicated results folder, and checks a few loose expectations so serious regressions still stand out.

## Why this file stands out

It is one of the most business-flow-oriented specs in the suite because it follows a real user action sequence instead of only measuring initial page load.