# home-page-performance.spec.ts

Source: [tests/home/home-page-performance.spec.ts](../../tests/home/home-page-performance.spec.ts)

## Purpose

This file measures how quickly the home page becomes useful after login. It treats the page as a story of progressive rendering: first the route is ready, then the map appears, then KPI cards appear, then lower sections render after scrolling.

## Imported helpers worth following

- `seedLogin()` — login bootstrap in [tests/seed.spec.ts](../../tests/seed.spec.ts#L4)

## Other imports

- `test` and `expect` from Playwright run the scenario and enforce the final timing threshold.

## Story of the file

### 1. The suite focuses only on the home page

The suite title makes it clear that this spec is about dashboard navigation and rendering speed rather than broad site coverage.

### 2. The test begins with authenticated setup

It calls `seedLogin()` and then waits for the post-login redirect to finish. That wait is important because the file wants its later timings to reflect home-page work, not leftover login redirect time.

### 3. Navigation timing starts only when the home route is requested

The file records a timestamp, opens the home route directly, confirms the URL, and calculates the first ready duration. This gives a clean baseline for all later measurements.

### 4. Above-the-fold components are timed in business priority order

The map heading is checked first, followed by the three KPI cards. After each visible check, the file records the elapsed time from the original navigation start. This means every number represents cumulative time from page request, not isolated per-widget timing.

### 5. The page is scrolled to trigger lower content

Because some dashboard sections sit below the fold, the script forces a scroll to make sure lazy-rendered or deferred content has a chance to appear.

### 6. Below-the-fold sections are measured next

The test waits for the Recently Viewed Shipments, Favourite Shipments, and Top Trade Lanes sections. Each is timed from the same original navigation start, so the file tells a full story of how long it takes the entire dashboard to become complete.

### 7. A human-readable console summary is printed

The last large block formats the collected timings into a console report. This helps the reader compare major dashboard regions without opening a JSON artifact.

### 8. One broad assertion protects against extreme slowness

The file only asserts that the total render time stays under one minute. That makes it tolerant of noisy environments while still catching severe regressions.

## Why this file is useful

This is one of the clearest examples in the suite of measuring user-visible milestones instead of only network or API timing.