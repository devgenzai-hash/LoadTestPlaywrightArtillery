# tracking-list-performance.spec.ts

Source: [tests/performance/tracking-list-performance.spec.ts](../../tests/performance/tracking-list-performance.spec.ts)

## Purpose

This file is the deep audit for Tracking List. It measures navigation milestones, column visibility, per-tab data loading, pagination behavior, rows-per-page behavior, memory impact, network quality, and final overall scoring.

## Imported helpers worth following

### Shared login and performance helpers

- `seedLogin()` — [tests/seed.spec.ts](../../tests/seed.spec.ts#L4)
- `createNetworkTracker()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L337)
- `measureAction()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L399)
- `getMemoryMetrics()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L316)
- `injectWebVitalsObservers()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L144)
- `getCoreWebVitals()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L235)
- `getNavigationTimingMetrics()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L97)
- `getResourceSummary()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L295)
- `getLongTasks()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L257)
- `generatePerformanceReport()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L481)
- `createConsoleTracker()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L454)

### Report writer helpers

- `createEmptyReport()` — [utils/report-writer.ts](../../utils/report-writer.ts#L470)
- `writeFullReport()` — [utils/report-writer.ts](../../utils/report-writer.ts#L462)
- `calculatePerformanceScore()` — [utils/report-writer.ts](../../utils/report-writer.ts#L505)
- `getScoreRating()` — [utils/report-writer.ts](../../utils/report-writer.ts#L550)
- `printReportSummary()` — [utils/report-writer.ts](../../utils/report-writer.ts#L558)
- `rateMetric()` — [utils/report-writer.ts](../../utils/report-writer.ts#L173)
- `calculatePercentiles()` — [utils/report-writer.ts](../../utils/report-writer.ts#L199)

## Story of the file

### 1. The test begins by creating a report object that will hold the full audit

This makes the file feel like a structured investigation rather than a loose script. Every later section contributes into one saved performance report.

### 2. Section 1 measures navigation into Tracking List in milestones

After login and a home-page landing step, the file clicks the Tracking List menu item and records milestones such as URL change, DOM readiness, tab visibility, first header visibility, first row visibility, network idle, and final data settle time.

### 3. Section 2 checks the table structure itself

The file reads the visible headers, compares them against an expected business-facing set of columns, and logs which expected columns were found. This confirms not just speed but also structural completeness.

### 4. Section 3 measures each main tab as its own table workload

For In Transit, Arrived, and Not Started, it times the switch, measures the first row, counts current and total rows, and captures related API calls.

### 5. Section 4 examines pagination performance

The file returns to a known tab and then times next-page, previous-page, and other pagination actions. This is important because large datasets often feel slow only after the first page.

### 6. Section 5 checks rows-per-page behavior and later sections examine memory and network quality

The file measures how responsive the table is when page size changes, then captures memory before and after tab work, summarizes API timings, and collects console and network issues.

### 7. The closing stage converts the audit into a score and written report

After all table and network evidence is gathered, the file calculates percentiles, computes a performance score, prints a summary, writes report files, and applies broad thresholds.

## Best use of this file

Choose this spec when you need the most complete understanding of how the Tracking List behaves under normal navigation and data-heavy interaction.