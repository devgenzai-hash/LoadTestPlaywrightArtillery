# home-tracking-list-filter-perf.spec.ts

Source: [tests/performance/home-tracking-list-filter-perf.spec.ts](../../tests/performance/home-tracking-list-filter-perf.spec.ts)

## Purpose

This file profiles a round-trip journey between home and Tracking List while a saved filter is applied. The main question is whether moving away from Tracking List and coming back keeps the filtered experience responsive.

## Imported helpers worth following

- `seedLogin()` — login bootstrap in [tests/seed.spec.ts](../../tests/seed.spec.ts#L4)
- `createNetworkTracker()` — request tracker in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L337)
- `getMemoryMetrics()` — memory reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L316)
- `getNavigationTimingMetrics()` — navigation timing reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L97)
- `createConsoleTracker()` — console tracker in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L454)

## Story of the file

### 1. The report model is organized around seven named steps

The interfaces at the top mirror the business flow directly: login to home, home to Tracking List, opening filter tools, applying the filter, returning home, and then revisiting Tracking List.

### 2. Local helpers handle statistics, ratings, directory creation, and text output

Just like the other custom report files, this one keeps its own percentile logic, API summarization, slowest-call detection, and text-report builder.

### 3. Step 1 records both login-to-home timing and home navigation timing

The file logs in, opens the home page, captures API traffic, stores detailed navigation timing, and saves a baseline memory snapshot.

### 4. Step 2 measures the first move into Tracking List

Rather than navigating by URL, it follows the real in-app path and records both navigation time and load completion time along with related API traffic.

### 5. Steps 3 and 4 open the filter tooling

The file measures how long it takes to open the filter drawer and then how long it takes to reveal saved filters through the settings icon.

### 6. Step 5 applies the saved filter and waits for filtered data

This block measures the first response after clicking the filter and the time until the filtered data is fully loaded. It also records the slowest supporting API call.

### 7. Steps 6 and 7 test the round trip after the filter is active

The script navigates back to home, records that load, then returns to Tracking List and records the return-trip load. This answers whether the filtered state remains efficient after context switching.

### 8. The report is then printed, saved, and lightly validated

Memory snapshots, API summaries, and console errors are combined into a saved artifact so the round-trip behavior can be compared across runs.

## Why it is different

Most performance specs end where the first page finishes loading. This one cares about what happens after the user leaves and comes back.