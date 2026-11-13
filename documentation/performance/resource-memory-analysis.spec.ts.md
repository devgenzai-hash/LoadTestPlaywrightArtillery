# resource-memory-analysis.spec.ts

Source: [tests/performance/resource-memory-analysis.spec.ts](../../tests/performance/resource-memory-analysis.spec.ts)

## Purpose

This file analyzes the home page from a payload and browser-health perspective. It looks at bundle weight, slow resources, protocol usage, compression benefit, memory growth, and DOM complexity.

## Imported helpers worth following

- `seedLogin()` — login bootstrap in [tests/seed.spec.ts](../../tests/seed.spec.ts#L4)
- `getResourceTimingEntries()` — raw resource timing entries in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L277)
- `getResourceSummary()` — grouped resource totals in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L295)
- `getMemoryMetrics()` — JS heap reader in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L316)
- `measureAction()` — generic timing wrapper in [utils/performance-helpers.ts](../../utils/performance-helpers.ts#L399)

## Story of the file

### 1. The suite always measures the home page after authenticated setup

Every test logs in and opens the same route, so the only changing variable is the kind of analysis being performed.

### 2. The first test builds a by-type resource inventory

It gathers all resource timing entries, computes total size and total duration, groups resources by type, and then prints page-weight style totals for script, style, and image payloads.

### 3. The second test highlights the largest and slowest assets

This block sorts the same resource data in two ways: by transfer size and by load duration. That gives quick visibility into whether the biggest files are also the slowest ones.

### 4. The third test checks protocol usage and compression behavior

It counts which transport protocols are being used and estimates how many resources appear compressed by comparing transfer size with decoded body size. The point is to spot outdated delivery patterns or missed optimization opportunities.

### 5. The fourth test watches memory across multiple page stages

The file measures heap state after login, after the page loads, after a long scroll, and after returning to the top. It then estimates memory growth and classifies leak risk.

### 6. The fifth test studies DOM shape

This block runs an in-page analysis script that counts total elements, nesting depth, widest node, common tags, and several asset-related tag counts. It then compares the page to broad Lighthouse-style DOM recommendations.

## Why this file matters

If a page feels heavy even when the direct navigation timing is acceptable, this file is often where the underlying weight or complexity becomes obvious.