# network-api-performance.spec.ts

Source: [tests/performance/network-api-performance.spec.ts](../../tests/performance/network-api-performance.spec.ts)

## Purpose

This file studies home-page loading from a network point of view. It does not try to explain business widgets. Instead, it answers questions like how many requests are made, which APIs are slow, how requests overlap, and whether any status codes are unhealthy.

## Imported helpers worth following

- `seedLogin()` — login bootstrap in [tests/seed.spec.ts](../../tests/seed.spec.ts#L4)
- `createNetworkTracker()` — request recorder in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L337)
- `measureAction()` — generic action timer in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L399)

## Other imports

- `test` and `expect` from Playwright run the suite and check the final counts.

## Story of the file

### 1. The file defines one home URL and one suite with four focused tests

Every test hits the same home page, but each one looks at the traffic from a different angle.

### 2. The first test captures a broad request inventory

It starts the network tracker before login and navigation so it can see the full page story. After the page settles, it splits traffic into API-style requests and static resources, prints totals, groups by resource type, highlights the slowest requests, and computes simple API statistics such as average, minimum, maximum, and near-tail latency.

### 3. The second test inspects XHR and fetch responses more directly

Instead of only using the shared tracker, it listens to Playwright response events. For every XHR or fetch response it records URL, method, status, timing, and content length. The result is a more API-focused ranked list.

### 4. The third test builds a waterfall view of navigation traffic

It collects requests, normalizes their start time relative to the moment navigation began, sorts them chronologically, and prints an early-request waterfall. The local helper at the bottom then estimates the maximum number of overlapping requests.

### 5. The fourth test looks at HTTP status-code distribution

This block groups all collected requests by status code, prints a visual distribution, and explicitly checks that there are no server-side failures.

### 6. A local helper computes peak request concurrency

The final helper converts each request into a start event and an end event, sorts them, and walks the event stream to find the highest simultaneous request count. That gives a simple view of how bursty the page load is.

## Best way to read this file

Think of it as four layers of network analysis:

1. broad totals,
2. API-only detail,
3. timeline shape,
4. status-code health.