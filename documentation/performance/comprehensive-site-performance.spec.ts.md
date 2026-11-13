# comprehensive-site-performance.spec.ts

Source: [tests/performance/comprehensive-site-performance.spec.ts](../../tests/performance/comprehensive-site-performance.spec.ts)

## Purpose

This is the master audit file. It tries to tell the whole performance story of the application in one run: login, home page, web vitals, component timing, Tracking List behavior, tab switching, navigation, resources, memory, DOM complexity, frame rate, cache effectiveness, API quality, and final scoring.

## Imported helpers worth following

### Shared login

- `seedLogin()` — login bootstrap in [tests/seed.spec.ts](../../tests/seed.spec.ts#L4)

### Performance helpers

- `injectWebVitalsObservers()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L144)
- `getCoreWebVitals()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L235)
- `getNavigationTimingMetrics()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L97)
- `getResourceSummary()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L295)
- `getResourceTimingEntries()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L277)
- `getMemoryMetrics()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L316)
- `getLongTasks()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L257)
- `getLayoutShifts()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L266)
- `generatePerformanceReport()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L481)
- `validatePerformanceBudget()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L571)
- `DEFAULT_BUDGETS` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L79)
- `createNetworkTracker()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L337)
- `createConsoleTracker()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L454)
- `measureAction()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L399)
- `getFrameTimingData()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L619)
- `waitForNetworkSettled()` — [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L610)

### Report writer helpers

- `createEmptyReport()` — [utils/report-writer.ts](../../utils/report-writer.ts#L470)
- `writeFullReport()` — [utils/report-writer.ts](../../utils/report-writer.ts#L462)
- `calculatePerformanceScore()` — [utils/report-writer.ts](../../utils/report-writer.ts#L505)
- `getScoreRating()` — [utils/report-writer.ts](../../utils/report-writer.ts#L550)
- `printReportSummary()` — [utils/report-writer.ts](../../utils/report-writer.ts#L558)
- `rateMetric()` — [utils/report-writer.ts](../../utils/report-writer.ts#L173)
- `calculatePercentiles()` — [utils/report-writer.ts](../../utils/report-writer.ts#L199)
- Report shapes such as `PerformanceTestReport`, `ComponentTiming`, `TableMetrics`, `TabSwitchMetrics`, and `APICallMetrics` begin in [utils/report-writer.ts](../../utils/report-writer.ts#L47)

## Story of the file

### 1. The file starts by creating a full report object and whole-session console tracking

This establishes the design of the file: every later action is meant to feed one central report rather than print isolated numbers only.

### 2. Phase 1 measures login as a timed workflow

Login is broken into cookie injection, redirect completion, and total flow duration. That makes it easy to separate slow authentication from slow application rendering.

### 3. Phase 2 measures the home page at the browser-metrics level

Before navigating, the file injects web-vitals observers. It then loads the home page, waits for network idle, and captures navigation timing, web vitals, resource totals, memory, long tasks, layout shifts, and network summary. A formatted performance report is printed and the page record is stored.

### 4. Phase 3 measures visible home components as a user would feel them

The file reopens the home page so component timings start from a fresh route load. It times key map and KPI widgets first, scrolls to trigger below-the-fold sections, and then times the lower sections.

### 5. Phase 4 turns to Tracking List and table behavior

It navigates from the app shell into Tracking List, measures how quickly the tab appears, how long the first row takes, how many rows and columns are visible, and whether pagination works.

### 6. Phase 5 compares tab switching inside Tracking List

For each major tab, the file times the switch, estimates data load time, counts rows, and records any API traffic generated during the change.

### 7. Later phases widen the audit beyond one page

The file continues into broader SPA navigation, resource inspection, cold-versus-warm load comparison, frame-rate sampling, memory snapshots across stages, DOM complexity checks, and budget validation.

### 8. The final stage turns raw metrics into a score and saved artifacts

After console and API errors are added, the file calculates percentiles and a final performance score, assigns a rating, writes the full report to disk, prints a summary, and finishes with lenient assertions.

## How to read it

Treat this file as the umbrella narrative for the project. If you want a single spec that touches almost every shared helper, this is the one.