# page-load-timing.spec.ts

Source: [tests/performance/page-load-timing.spec.ts](../../tests/performance/page-load-timing.spec.ts)

## Purpose

This file is the timing-focused companion to the broader performance suite. It breaks the experience into page-load phases, login flow segments, cold versus warm load behavior, and frame-rate smoothness.

## Imported helpers worth following

- `seedLogin()` — login bootstrap in [tests/seed.spec.ts](../../tests/seed.spec.ts#L4)
- `getNavigationTimingMetrics()` — navigation timing reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L97)
- `injectWebVitalsObservers()` — early vitals observer injection in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L144)
- `getCoreWebVitals()` — vitals reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L235)
- `getResourceSummary()` — resource aggregation in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L295)
- `getMemoryMetrics()` — memory capture in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L316)
- `getLongTasks()` — long-task reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L257)
- `createNetworkTracker()` — network tracker in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L337)
- `generatePerformanceReport()` — formatted report builder in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L481)
- `measureAction()` — generic duration wrapper in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L399)
- `waitForNetworkSettled()` — extra idle wait helper in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L610)
- `getFrameTimingData()` — FPS measurement helper in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L619)

## Story of the file

### 1. Shared constants define three contexts to measure

The file explicitly names the base app URL, the home route, and the hosted login URL. That tells you the suite wants to compare both app navigation and the login page itself.

### 2. The first test measures a full home-page waterfall

It injects vitals observers, tracks network traffic, performs login, opens the home route, and then pulls together navigation timing, vitals, resource totals, memory data, long tasks, and network summary. It prints both a high-level report and a manual phase-by-phase breakdown.

### 3. The second test isolates login page cold-load cost

This test skips the app after-login state and simply loads the hosted login page as a standalone target. It is useful when you want to separate auth-page slowness from application slowness.

### 4. The third test treats login as a business flow

Instead of one big number, it measures cookie injection, redirect handling, and home navigation separately. This makes it easier to identify whether auth delay comes from setup, redirect behavior, or final app loading.

### 5. The fourth test compares cold and warm navigation

It loads the home page once, then loads it again using the warmed browser cache. The file calculates percentage improvement so the reader can judge how much benefit caching gives.

### 6. The fifth test checks frame-rate quality

After the page is ready, it captures one idle FPS sample and one scroll-time FPS sample. This moves the file from loading speed into perceived smoothness.

## Reading tip

This file is best understood as a timing toolbox organized around five questions:

1. how long did the home page take,
2. how fast is the login page itself,
3. which login phase is slow,
4. how much does cache help,
5. how smooth does the page feel.