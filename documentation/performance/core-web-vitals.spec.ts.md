# core-web-vitals.spec.ts

Source: [tests/performance/core-web-vitals.spec.ts](../../tests/performance/core-web-vitals.spec.ts)

## Purpose

This file focuses on home-page performance through the lens of Google-style web-vitals metrics. It checks the initial experience, post-interaction responsiveness, long-task pressure, and console cleanliness.

## Imported helpers worth following

- `seedLogin()` — shared login bootstrap in [tests/seed.spec.ts](../../tests/seed.spec.ts#L4)
- `injectWebVitalsObservers()` — installs in-page observers in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L144)
- `getCoreWebVitals()` — reads captured vitals in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L235)
- `getNavigationTimingMetrics()` — reads navigation timing in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L97)
- `getResourceSummary()` — groups loaded resources in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L295)
- `getMemoryMetrics()` — captures JS heap data in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L316)
- `getLongTasks()` — returns long tasks in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L257)
- `getLayoutShifts()` — returns layout shift details in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L266)
- `generatePerformanceReport()` — formats the combined report in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L481)
- `validatePerformanceBudget()` — checks measurements against budgets in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L571)
- `DEFAULT_BUDGETS` — default thresholds in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L79)
- `createConsoleTracker()` — captures console output in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L454)

## Other imports

- `test` and `expect` from Playwright run the suite and enforce thresholds.

## Story of the file

### 1. Shared setup defines the page under test and extends the timeout

The file targets the home route and gives itself extra time because performance checks intentionally wait for late observers and post-load work.

### 2. The first test measures the full initial home-page experience

It installs web-vitals observers before navigation, logs in, opens the home route, waits for network idle, and pauses briefly so the buffered observers can finish collecting data. After that it gathers vitals, navigation timing, resource totals, memory usage, long tasks, and layout shifts.

### 3. The first test prints the report and validates budgets

Once data is collected, the file prints a consolidated report, then prints detailed layout-shift events if any were captured. It also compares actual values against the shared budget table and logs pass or fail for each metric.

### 4. The first test enforces the most important vitals thresholds

Assertions are applied only when a metric exists. The file checks that LCP, FCP, and CLS stay within acceptable ranges and also ensures the overall load duration is not extreme.

### 5. The second test asks whether interaction makes the page feel slow

After the same setup, the file performs representative user interactions such as clicking a KPI-related element and scrolling the page. It then re-reads the vitals to see how interaction impacts responsiveness and layout stability.

### 6. The third test isolates long tasks as a blocking-time signal

This test loads the page, waits longer for late tasks, sums the blocking time beyond the first fifty milliseconds of each long task, and prints a detailed breakdown. It is effectively using long tasks as a readable proxy for total blocking time.

### 7. The fourth test checks console health during normal load

It wraps the page load with a console tracker, then reports the total number of errors and warnings. The goal is not only speed but also runtime cleanliness.

## Mental model

Read this file as four layers of quality:

1. initial page experience,
2. interaction responsiveness,
3. main-thread blocking,
4. runtime console health.