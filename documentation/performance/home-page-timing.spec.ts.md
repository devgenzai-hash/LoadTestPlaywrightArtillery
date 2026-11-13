# home-page-timing.spec.ts

Source: [tests/performance/home-page-timing.spec.ts](../../tests/performance/home-page-timing.spec.ts)

## Purpose

This file is a custom dashboard profiler. It measures home-page load time, KPI timing, map toggle behavior, transport-tab behavior, global search timing, and then saves a rich text-and-JSON report into the dedicated home performance folder.

## Imported helpers worth following

- `seedLogin()` — login bootstrap in [tests/seed.spec.ts](../../tests/seed.spec.ts#L4)
- `createNetworkTracker()` — request tracker in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L337)
- `measureAction()` — generic action timer in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L399)
- `getMemoryMetrics()` — memory reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L316)
- `createConsoleTracker()` — console tracker in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L454)

## Story of the file

### 1. The top section defines a local reporting language for the dashboard

The file introduces interfaces for KPI results, map toggle results, transport tab results, widget timings, global search timings, and the full report object. This means the spec owns its report format instead of delegating to the shared report writer.

### 2. Several local helpers support statistics, ratings, and persistence

The helper section converts raw API timings into percentiles and summaries, creates timestamps and directories, identifies the slowest API call, and formats a large human-readable report.

### 3. Step 1 measures initial home-page load after login

The test logs in, opens the home route with network tracking active, records page-load duration and page-load API calls, and captures a baseline memory snapshot.

### 4. Step 2 times the three KPI cards

For each KPI label, the script measures when it becomes visible and then tries to extract the nearby numeric value so the report contains both performance and data context.

### 5. Step 3 times the map toggle

The script toggles the map view from its default state to the alternative view and records both the UI switch time and the related API activity.

### 6. Step 4 profiles the transport tabs

The file iterates through Ocean, Air, Rail, and Road. For each tab it captures the click response, API timing, network idle timing, and widget render timing.

### 7. Step 5 profiles global search from the home page

It returns to the top area, submits a broad search term, measures the route change and result display timing, and records the APIs that power that search workflow.

### 8. The final stage records memory, console state, and saved artifacts

After the main interactions are complete, the file stores final memory data, stops console tracking, assembles the report object, prints it, writes it to the home-page performance folder, and applies a few broad assertions.

## Reading tip

Use this file when you want a detailed home-page story without the extra scope of the master all-site audit.