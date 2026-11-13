# Performance Testing Suite

## Overview

Industry-standard performance testing for the ITT Smart Navigator application using Playwright. This suite measures all key web performance metrics following **Google Lighthouse**, **Core Web Vitals**, and **W3C Navigation Timing** standards.

---

## Test Files

| File | What It Measures |
|------|------------------|
| `core-web-vitals.spec.ts` | LCP, FCP, CLS, TTFB, FID, INP, Long Tasks, Console Errors |
| `page-load-timing.spec.ts` | Navigation Timing waterfall, Login flow timing, Cold vs Warm load, FPS |
| `network-api-performance.spec.ts` | API response times, XHR/Fetch monitoring, Waterfall, HTTP status codes |
| `resource-memory-analysis.spec.ts` | Resource sizes, Bundle audit, Compression, Memory profiling, DOM complexity |
| `spa-navigation-performance.spec.ts` | Multi-page navigation, SPA routing, Tab switching, Memory leak detection, Performance scorecard |

---

## Running Tests

### Run all performance tests (Edge — recommended, has memory API support)
```bash
npx playwright test --project=performance-edge
```

### Run all performance tests (Firefox — cross-browser validation)
```bash
npx playwright test --project=performance-firefox
```

### Run a specific test file
```bash
npx playwright test tests/performance/core-web-vitals.spec.ts --project=performance-edge
```

### Run with headed browser (to watch the tests)
```bash
npx playwright test --project=performance-edge --headed
```

### Run with verbose output
```bash
npx playwright test --project=performance-edge --reporter=list
```

### Run on both browsers at once
```bash
npx playwright test --project=performance-edge --project=performance-firefox
```

### View HTML report after running
```bash
npx playwright show-report
```

---

## Performance Metrics Measured

### Core Web Vitals (Google Standards)
| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| **LCP** (Largest Contentful Paint) | ≤ 2.5s | ≤ 4.0s | > 4.0s |
| **FCP** (First Contentful Paint) | ≤ 1.8s | ≤ 3.0s | > 3.0s |
| **CLS** (Cumulative Layout Shift) | ≤ 0.1 | ≤ 0.25 | > 0.25 |
| **INP** (Interaction to Next Paint) | ≤ 200ms | ≤ 500ms | > 500ms |
| **TTFB** (Time to First Byte) | ≤ 800ms | ≤ 1800ms | > 1800ms |
| **TBT** (Total Blocking Time) | ≤ 200ms | ≤ 600ms | > 600ms |

### Navigation Timing (W3C Level 2)
- DNS Lookup, TCP Connection, TLS Negotiation
- Server Response Time (TTFB)
- DOM Interactive, DOM Content Loaded, DOM Complete
- Page Load Event, Redirect Time

### Network & Resources
- Total request count & sizes
- API/XHR response times (min, avg, P90, max)
- Failed request detection
- HTTP protocol distribution (HTTP/1.1 vs HTTP/2)
- Compression analysis
- Largest & slowest resource identification

### Memory & DOM
- JS Heap memory profiling across navigation stages
- Memory leak detection across multiple navigations
- DOM element count, depth, and complexity
- Frame rate (FPS) during scroll and idle

---

## Performance Budgets (Thresholds)

The suite validates against these budgets:

| Metric | Budget |
|--------|--------|
| Page Load | < 10s |
| TTFB | < 800ms |
| FCP | < 1.8s |
| LCP | < 2.5s |
| CLS | < 0.1 |
| DOM Content Loaded | < 5s |
| Total Transfer Size | < 5MB |
| Max Requests | < 100 |

---

## Architecture

```
utils/
  performance-helpers.ts    ← Reusable utilities (timing, metrics, reporting)

tests/performance/
  core-web-vitals.spec.ts          ← CWV-01 to CWV-04
  page-load-timing.spec.ts         ← NAV-01 to NAV-05
  network-api-performance.spec.ts  ← NET-01 to NET-04
  resource-memory-analysis.spec.ts ← RES-01 to RES-05
  spa-navigation-performance.spec.ts ← SPA-01 to SPA-05
```

---

## Output

Each test generates a detailed ASCII report in the console output with color-coded ratings:
- 🟢 **GOOD** - Meets Google's recommended thresholds
- 🟡 **NEEDS IMPROVEMENT** - Acceptable but could be better
- 🔴 **POOR** - Below acceptable thresholds

JSON results are saved to `test-results/performance-report.json` for CI/CD integration.
