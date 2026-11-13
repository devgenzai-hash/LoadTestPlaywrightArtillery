# spa-navigation-performance.spec.ts

Source: [tests/performance/spa-navigation-performance.spec.ts](../../tests/performance/spa-navigation-performance.spec.ts)

## Purpose

This file measures how the application behaves as a single-page app. It cares about route-change speed, tab-switch speed, repeated navigation memory growth, and an overall performance score for the home page.

## Imported helpers worth following

- `seedLogin()` — login bootstrap in [tests/seed.spec.ts](../../tests/seed.spec.ts#L4)
- `measureAction()` — generic action timer in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L399)
- `createNetworkTracker()` — request tracker in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L337)
- `getMemoryMetrics()` — memory reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L316)
- `injectWebVitalsObservers()` — observer bootstrap in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L144)
- `getCoreWebVitals()` — vitals reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L235)
- `getNavigationTimingMetrics()` — navigation timing reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L97)
- `getResourceSummary()` — resource summary helper in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L295)
- `getLongTasks()` — long-task reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L257)
- `generatePerformanceReport()` — formatted report builder in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L481)

## Story of the file

### 1. The file uses one suite to answer several SPA-specific questions

Instead of focusing on one widget or one table, it asks how fast route changes feel, how consistent those changes are, and whether moving around the app causes memory to drift upward.

### 2. The first test compares main page navigation times

It logs in, measures the home page, moves to Tracking List through the UI, then returns home. The result is a small table showing how long the main page transitions take.

### 3. The second test isolates client-side route change behavior

This test defines a small inner helper that wraps a route change with a network tracker and a timer. It uses that helper to time the move from home to Tracking List and then back again while also counting API calls fired by each transition.

### 4. The third test narrows focus to Tracking List tabs

After opening Tracking List, it clicks the major tabs and records how long each switch takes until the page is quiet and data has had a chance to render.

### 5. The fourth test looks for memory leak patterns over repeated navigation

The file cycles between home and Tracking List several times, capturing heap usage after each step. It then compares early and late readings to see whether navigation appears to leave old memory behind.

### 6. The fifth test builds a scorecard instead of only raw timings

It combines vitals, navigation timing, resource data, long tasks, and network summary into a simplified Lighthouse-style score. The score penalizes poor LCP, FCP, CLS, blocking time, and slow content readiness.

## Best interpretation

This file is the best choice when the question is not just whether a page loads, but whether moving around the app still feels light after several transitions.