# global-search-to-details-perf.spec.ts

Source: [tests/performance/global-search-to-details-perf.spec.ts](../../tests/performance/global-search-to-details-perf.spec.ts)

## Purpose

This file profiles a realistic search-to-detail journey. It starts on the home page, performs a precise global search, opens shipment details, measures detail tabs and expandable sections, returns home, and then performs a broader search.

## Imported helpers worth following

- `seedLogin()` — login bootstrap in [tests/seed.spec.ts](../../tests/seed.spec.ts#L4)
- `createNetworkTracker()` — request tracker in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L337)
- `measureAction()` — generic action timer in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L399)
- `getMemoryMetrics()` — memory reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L316)
- `getNavigationTimingMetrics()` — navigation timing reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L97)
- `createConsoleTracker()` — console tracker in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L454)

## Story of the file

### 1. The file defines report types for every stage of the journey

There are dedicated interfaces for the first search, detail-page navigation, detail-tab switching, accordion expansion, back-to-home travel, and the second broader search. This tells you the author wants fine-grained evidence for each leg of the trip.

### 2. Shared helper blocks handle API summaries and report output

Before the main test begins, the file defines percentile logic, API summarization, request normalization, rating helpers, output-folder creation, and text-report generation.

### 3. Step 1 loads the home page and captures baseline state

After login, it opens home, collects initial API traffic, and stores a first memory snapshot so later navigation can be compared against a known starting point.

### 4. Step 2 performs a precise global search

The test finds the global search box, enters a full shipment number, submits it, waits for resulting traffic and navigation behavior, and stores the resulting page URL and API timing profile.

### 5. Step 3 makes sure the shipment detail page is reached and timed

If the search does not land directly on the detail page, the script clicks a search result row. It then measures when the detail page becomes visible and records the navigation API calls.

### 6. Step 4 measures detail-page tabs

The file clicks Shipment Information, Location, Event, Alerts, and Documents, timing each switch and tracking the APIs associated with the new content.

### 7. Step 5 measures expandable sections inside Shipment Information

After returning to the main information tab, it expands sections like General Information, Transport Information, Current Location, and CO2 information to see whether these details appear instantly or trigger additional work.

### 8. Step 6 goes back home and Step 7 performs a broader search

The script measures the cost of returning to home, then searches with a shorter term so the workflow ends on a result-heavy page rather than a single detail page.

### 9. The final stage assembles, prints, and saves the journey report

Console errors, API summaries, memory snapshots, and all timing objects are combined into one report file for later inspection.

## Best use of this file

When you want to understand how search-driven navigation behaves across multiple page types, this file is the clearest example in the suite.