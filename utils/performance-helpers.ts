/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PERFORMANCE TESTING UTILITIES
 *  Industry-standard helpers for measuring web performance metrics
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Page, BrowserContext, expect } from '@playwright/test';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NavigationTimingMetrics {
  dnsLookup: number;
  tcpConnection: number;
  tlsNegotiation: number;
  serverResponseTime: number; // TTFB
  domContentLoaded: number;
  domInteractive: number;
  domComplete: number;
  pageLoad: number;
  redirectTime: number;
  fetchTime: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
}

export interface CoreWebVitals {
  lcp: number | null;       // Largest Contentful Paint
  fid: number | null;       // First Input Delay
  cls: number | null;       // Cumulative Layout Shift
  inp: number | null;       // Interaction to Next Paint
  fcp: number | null;       // First Contentful Paint
  ttfb: number | null;      // Time to First Byte
}

export interface ResourceMetrics {
  name: string;
  type: string;
  duration: number;
  transferSize: number;
  decodedBodySize: number;
  startTime: number;
  protocol: string;
}

export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  duration: number;
  size: number;
  resourceType: string;
  timestamp: number;
}

export interface MemoryMetrics {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  usedJSHeapSizeMB: number;
  totalJSHeapSizeMB: number;
}

export interface PerformanceBudget {
  pageLoad?: number;
  ttfb?: number;
  fcp?: number;
  lcp?: number;
  cls?: number;
  domContentLoaded?: number;
  totalTransferSize?: number;  // in KB
  maxRequestCount?: number;
  maxLongTasks?: number;
}

// ── Default Performance Budgets (Industry Standards) ─────────────────────────

export const DEFAULT_BUDGETS: PerformanceBudget = {
  pageLoad: 10000,           // 10s max page load
  ttfb: 800,                 // 800ms TTFB (Google recommendation)
  fcp: 1800,                 // 1.8s FCP (Good threshold)
  lcp: 2500,                 // 2.5s LCP (Google Core Web Vitals)
  cls: 0.1,                  // 0.1 CLS (Google Core Web Vitals)
  domContentLoaded: 5000,    // 5s DOMContentLoaded
  totalTransferSize: 5000,   // 5MB total transfer
  maxRequestCount: 100,      // Max 100 requests
  maxLongTasks: 5,           // Max 5 long tasks (>50ms)
};

// ── Navigation Timing API ────────────────────────────────────────────────────

/**
 * Collects Navigation Timing API metrics from the browser.
 * Uses the modern PerformanceNavigationTiming API (Level 2).
 */
export async function getNavigationTimingMetrics(page: Page): Promise<NavigationTimingMetrics> {
  return await page.evaluate(() => {
    const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (!entry) {
      // Fallback to legacy timing API
      const t = performance.timing;
      return {
        dnsLookup: t.domainLookupEnd - t.domainLookupStart,
        tcpConnection: t.connectEnd - t.connectStart,
        tlsNegotiation: t.secureConnectionStart > 0 ? t.connectEnd - t.secureConnectionStart : 0,
        serverResponseTime: t.responseStart - t.requestStart,
        domContentLoaded: t.domContentLoadedEventEnd - t.navigationStart,
        domInteractive: t.domInteractive - t.navigationStart,
        domComplete: t.domComplete - t.navigationStart,
        pageLoad: t.loadEventEnd - t.navigationStart,
        redirectTime: t.redirectEnd - t.redirectStart,
        fetchTime: t.responseEnd - t.fetchStart,
        transferSize: 0,
        encodedBodySize: 0,
        decodedBodySize: 0,
      };
    }

    return {
      dnsLookup: entry.domainLookupEnd - entry.domainLookupStart,
      tcpConnection: entry.connectEnd - entry.connectStart,
      tlsNegotiation: entry.secureConnectionStart > 0 ? entry.connectEnd - entry.secureConnectionStart : 0,
      serverResponseTime: entry.responseStart - entry.requestStart,
      domContentLoaded: entry.domContentLoadedEventEnd - entry.startTime,
      domInteractive: entry.domInteractive - entry.startTime,
      domComplete: entry.domComplete - entry.startTime,
      pageLoad: entry.loadEventEnd - entry.startTime,
      redirectTime: entry.redirectEnd - entry.redirectStart,
      fetchTime: entry.responseEnd - entry.fetchStart,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    };
  });
}

// ── Core Web Vitals ──────────────────────────────────────────────────────────

/**
 * Injects PerformanceObserver scripts to capture Core Web Vitals.
 * Must be called BEFORE page.goto() to capture FCP and LCP from the start.
 */
export async function injectWebVitalsObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Storage for metrics
    (window as any).__perfMetrics = {
      lcp: null,
      fid: null,
      cls: 0,
      inp: null,
      fcp: null,
      ttfb: null,
      longTasks: [],
      layoutShifts: [],
    };

    // LCP Observer
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as any;
        (window as any).__perfMetrics.lcp = lastEntry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) { /* not supported */ }

    // FID Observer
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          (window as any).__perfMetrics.fid = (entries[0] as any).processingStart - entries[0].startTime;
        }
      }).observe({ type: 'first-input', buffered: true });
    } catch (e) { /* not supported */ }

    // CLS Observer
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            (window as any).__perfMetrics.cls += (entry as any).value;
            (window as any).__perfMetrics.layoutShifts.push({
              value: (entry as any).value,
              time: entry.startTime,
            });
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) { /* not supported */ }

    // FCP Observer
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          (window as any).__perfMetrics.fcp = entries[0].startTime;
        }
      }).observe({ type: 'paint', buffered: true });
    } catch (e) { /* not supported */ }

    // Long Tasks Observer (>50ms)
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          (window as any).__perfMetrics.longTasks.push({
            duration: entry.duration,
            startTime: entry.startTime,
            name: entry.name,
          });
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch (e) { /* not supported */ }

    // INP Observer (Interaction to Next Paint)
    try {
      let maxINP = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const duration = entry.duration;
          if (duration > maxINP) {
            maxINP = duration;
            (window as any).__perfMetrics.inp = duration;
          }
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as any);
    } catch (e) { /* not supported */ }
  });
}

/**
 * Retrieves collected Core Web Vitals from the page.
 * Call this AFTER the page has loaded and interactions have been performed.
 */
export async function getCoreWebVitals(page: Page): Promise<CoreWebVitals> {
  return await page.evaluate(() => {
    const metrics = (window as any).__perfMetrics || {};

    // Get TTFB from Navigation Timing
    const [navEntry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const ttfb = navEntry ? navEntry.responseStart - navEntry.requestStart : null;

    return {
      lcp: metrics.lcp ?? null,
      fid: metrics.fid ?? null,
      cls: metrics.cls ?? null,
      inp: metrics.inp ?? null,
      fcp: metrics.fcp ?? null,
      ttfb: ttfb,
    };
  });
}

/**
 * Returns information about Long Tasks captured during page load.
 */
export async function getLongTasks(page: Page): Promise<Array<{ duration: number; startTime: number; name: string }>> {
  return await page.evaluate(() => {
    return (window as any).__perfMetrics?.longTasks || [];
  });
}

/**
 * Returns layout shift entries captured during page load.
 */
export async function getLayoutShifts(page: Page): Promise<Array<{ value: number; time: number }>> {
  return await page.evaluate(() => {
    return (window as any).__perfMetrics?.layoutShifts || [];
  });
}

// ── Resource Timing ──────────────────────────────────────────────────────────

/**
 * Collects all resource timing entries from the page.
 */
export async function getResourceTimingEntries(page: Page): Promise<ResourceMetrics[]> {
  return await page.evaluate(() => {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    return entries.map(entry => ({
      name: entry.name,
      type: entry.initiatorType,
      duration: Math.round(entry.duration),
      transferSize: entry.transferSize || 0,
      decodedBodySize: entry.decodedBodySize || 0,
      startTime: Math.round(entry.startTime),
      protocol: entry.nextHopProtocol || 'unknown',
    }));
  });
}

/**
 * Summarizes resource loading by type (script, stylesheet, image, etc.)
 */
export async function getResourceSummary(page: Page): Promise<Record<string, { count: number; totalSize: number; totalDuration: number }>> {
  const resources = await getResourceTimingEntries(page);
  const summary: Record<string, { count: number; totalSize: number; totalDuration: number }> = {};

  for (const r of resources) {
    if (!summary[r.type]) {
      summary[r.type] = { count: 0, totalSize: 0, totalDuration: 0 };
    }
    summary[r.type].count++;
    summary[r.type].totalSize += r.transferSize;
    summary[r.type].totalDuration += r.duration;
  }

  return summary;
}

// ── Memory Profiling ─────────────────────────────────────────────────────────

/**
 * Captures JS heap memory usage (Chromium-only).
 */
export async function getMemoryMetrics(page: Page): Promise<MemoryMetrics | null> {
  return await page.evaluate(() => {
    const perf = performance as any;
    if (!perf.memory) return null;

    return {
      usedJSHeapSize: perf.memory.usedJSHeapSize,
      totalJSHeapSize: perf.memory.totalJSHeapSize,
      jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
      usedJSHeapSizeMB: Math.round(perf.memory.usedJSHeapSize / 1048576 * 100) / 100,
      totalJSHeapSizeMB: Math.round(perf.memory.totalJSHeapSize / 1048576 * 100) / 100,
    };
  });
}

// ── Network Request Monitoring ───────────────────────────────────────────────

/**
 * Creates a network request tracker that records all requests and responses.
 * Returns start/stop functions and access to collected requests.
 */
export function createNetworkTracker(page: Page) {
  const requests: NetworkRequest[] = [];
  const pendingRequests = new Map<string, { url: string; method: string; startTime: number; resourceType: string }>();

  const onRequest = (request: any) => {
    pendingRequests.set(request.url(), {
      url: request.url(),
      method: request.method(),
      startTime: Date.now(),
      resourceType: request.resourceType(),
    });
  };

  const onResponse = (response: any) => {
    const url = response.url();
    const pending = pendingRequests.get(url);
    if (pending) {
      requests.push({
        url: pending.url,
        method: pending.method,
        status: response.status(),
        duration: Date.now() - pending.startTime,
        size: 0, // Will be populated if headers contain content-length
        resourceType: pending.resourceType,
        timestamp: pending.startTime,
      });
      pendingRequests.delete(url);
    }
  };

  return {
    start() {
      page.on('request', onRequest);
      page.on('response', onResponse);
    },
    stop() {
      page.removeListener('request', onRequest);
      page.removeListener('response', onResponse);
    },
    getRequests: () => [...requests],
    getRequestsByType: (type: string) => requests.filter(r => r.resourceType === type),
    getSlowRequests: (thresholdMs = 1000) => requests.filter(r => r.duration > thresholdMs),
    getFailedRequests: () => requests.filter(r => r.status >= 400),
    getSummary: () => ({
      totalRequests: requests.length,
      totalDuration: requests.reduce((sum, r) => sum + r.duration, 0),
      avgDuration: Math.round(requests.reduce((sum, r) => sum + r.duration, 0) / (requests.length || 1)),
      byType: requests.reduce((acc, r) => {
        acc[r.resourceType] = (acc[r.resourceType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      failedCount: requests.filter(r => r.status >= 400).length,
      slowCount: requests.filter(r => r.duration > 1000).length,
    }),
  };
}

// ── Timing Utilities ─────────────────────────────────────────────────────────

/**
 * Measures the time taken for a Playwright action (click, navigation, etc.)
 */
export async function measureAction<T>(
  name: string,
  action: () => Promise<T>
): Promise<{ result: T; duration: number; name: string }> {
  const start = Date.now();
  const result = await action();
  const duration = Date.now() - start;
  return { result, duration, name };
}

/**
 * Measures the time for an element to become visible after an action.
 */
export async function measureTimeToVisible(
  page: Page,
  selector: string,
  timeout = 30000
): Promise<number> {
  const start = Date.now();
  await page.locator(selector).waitFor({ state: 'visible', timeout });
  return Date.now() - start;
}

/**
 * Runs the same action multiple times and returns statistical analysis.
 */
export async function benchmarkAction(
  action: () => Promise<number>,
  iterations = 5
): Promise<{ min: number; max: number; avg: number; median: number; p95: number; p99: number; values: number[] }> {
  const values: number[] = [];

  for (let i = 0; i < iterations; i++) {
    values.push(await action());
  }

  values.sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);

  return {
    min: values[0],
    max: values[values.length - 1],
    avg: Math.round(sum / values.length),
    median: values[Math.floor(values.length / 2)],
    p95: values[Math.floor(values.length * 0.95)],
    p99: values[Math.floor(values.length * 0.99)],
    values,
  };
}

// ── Console Error Tracking ───────────────────────────────────────────────────

/**
 * Creates a console error tracker that captures all console errors and warnings.
 */
export function createConsoleTracker(page: Page) {
  const errors: Array<{ type: string; text: string; timestamp: number }> = [];

  const handler = (msg: any) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      errors.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
    }
  };

  return {
    start() { page.on('console', handler); },
    stop() { page.removeListener('console', handler); },
    getErrors: () => errors.filter(e => e.type === 'error'),
    getWarnings: () => errors.filter(e => e.type === 'warning'),
    getAll: () => [...errors],
  };
}

// ── Report Generators ────────────────────────────────────────────────────────

/**
 * Generates a formatted performance report string for console output.
 */
export function generatePerformanceReport(
  testName: string,
  navTiming: NavigationTimingMetrics,
  webVitals: CoreWebVitals,
  resourceSummary: Record<string, { count: number; totalSize: number; totalDuration: number }>,
  memory: MemoryMetrics | null,
  longTasks: Array<{ duration: number; startTime: number }>,
  networkSummary?: { totalRequests: number; failedCount: number; slowCount: number; avgDuration: number }
): string {
  const totalResources = Object.values(resourceSummary).reduce((sum, r) => sum + r.count, 0);
  const totalTransferKB = Math.round(Object.values(resourceSummary).reduce((sum, r) => sum + r.totalSize, 0) / 1024);

  const ratingLCP = (webVitals.lcp ?? 0) <= 2500 ? '🟢 GOOD' : (webVitals.lcp ?? 0) <= 4000 ? '🟡 NEEDS IMPROVEMENT' : '🔴 POOR';
  const ratingFCP = (webVitals.fcp ?? 0) <= 1800 ? '🟢 GOOD' : (webVitals.fcp ?? 0) <= 3000 ? '🟡 NEEDS IMPROVEMENT' : '🔴 POOR';
  const ratingCLS = (webVitals.cls ?? 0) <= 0.1 ? '🟢 GOOD' : (webVitals.cls ?? 0) <= 0.25 ? '🟡 NEEDS IMPROVEMENT' : '🔴 POOR';
  const ratingTTFB = (webVitals.ttfb ?? 0) <= 800 ? '🟢 GOOD' : (webVitals.ttfb ?? 0) <= 1800 ? '🟡 NEEDS IMPROVEMENT' : '🔴 POOR';

  let report = `
╔════════════════════════════════════════════════════════════════════════════════╗
║                     PERFORMANCE TEST REPORT                                  ║
║  Test: ${testName.padEnd(67)}║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  ── CORE WEB VITALS (Google Lighthouse Standards) ────────────────────────── ║
║                                                                              ║
║  LCP  (Largest Contentful Paint) : ${String(Math.round(webVitals.lcp ?? 0)).padStart(6)}ms  ${ratingLCP.padEnd(25)}║
║  FCP  (First Contentful Paint)   : ${String(Math.round(webVitals.fcp ?? 0)).padStart(6)}ms  ${ratingFCP.padEnd(25)}║
║  CLS  (Cumulative Layout Shift)  : ${String((webVitals.cls ?? 0).toFixed(4)).padStart(8)}  ${ratingCLS.padEnd(25)}║
║  TTFB (Time to First Byte)       : ${String(Math.round(webVitals.ttfb ?? 0)).padStart(6)}ms  ${ratingTTFB.padEnd(25)}║
║  FID  (First Input Delay)        : ${String(Math.round(webVitals.fid ?? 0)).padStart(6)}ms                         ║
║  INP  (Interaction to Next Paint): ${String(Math.round(webVitals.inp ?? 0)).padStart(6)}ms                         ║
║                                                                              ║
║  ── NAVIGATION TIMING ───────────────────────────────────────────────────── ║
║                                                                              ║
║  DNS Lookup          : ${String(Math.round(navTiming.dnsLookup)).padStart(6)}ms                                    ║
║  TCP Connection      : ${String(Math.round(navTiming.tcpConnection)).padStart(6)}ms                                    ║
║  TLS Negotiation     : ${String(Math.round(navTiming.tlsNegotiation)).padStart(6)}ms                                    ║
║  Server Response     : ${String(Math.round(navTiming.serverResponseTime)).padStart(6)}ms  (TTFB)                        ║
║  DOM Interactive     : ${String(Math.round(navTiming.domInteractive)).padStart(6)}ms                                    ║
║  DOM Content Loaded  : ${String(Math.round(navTiming.domContentLoaded)).padStart(6)}ms                                    ║
║  DOM Complete        : ${String(Math.round(navTiming.domComplete)).padStart(6)}ms                                    ║
║  Page Load           : ${String(Math.round(navTiming.pageLoad)).padStart(6)}ms                                    ║
║  Redirect Time       : ${String(Math.round(navTiming.redirectTime)).padStart(6)}ms                                    ║
║                                                                              ║
║  ── RESOURCE LOADING ────────────────────────────────────────────────────── ║
║                                                                              ║
║  Total Resources     : ${String(totalResources).padStart(6)}                                         ║
║  Total Transfer Size : ${String(totalTransferKB).padStart(6)} KB                                      ║`;

  for (const [type, data] of Object.entries(resourceSummary)) {
    report += `\n║  ${type.padEnd(20)} : ${String(data.count).padStart(4)} files, ${String(Math.round(data.totalSize / 1024)).padStart(6)} KB, ${String(Math.round(data.totalDuration)).padStart(6)}ms  ║`;
  }

  report += `
║                                                                              ║
║  ── LONG TASKS (>50ms) ──────────────────────────────────────────────────── ║
║                                                                              ║
║  Count               : ${String(longTasks.length).padStart(6)}                                         ║
║  Total Blocking Time : ${String(Math.round(longTasks.reduce((sum, t) => sum + (t.duration - 50), 0))).padStart(6)}ms                                    ║`;

  if (memory) {
    report += `
║                                                                              ║
║  ── MEMORY USAGE (JS Heap) ──────────────────────────────────────────────── ║
║                                                                              ║
║  Used JS Heap        : ${String(memory.usedJSHeapSizeMB).padStart(6)} MB                                     ║
║  Total JS Heap       : ${String(memory.totalJSHeapSizeMB).padStart(6)} MB                                     ║`;
  }

  if (networkSummary) {
    report += `
║                                                                              ║
║  ── NETWORK SUMMARY ─────────────────────────────────────────────────────── ║
║                                                                              ║
║  Total Requests      : ${String(networkSummary.totalRequests).padStart(6)}                                         ║
║  Failed Requests     : ${String(networkSummary.failedCount).padStart(6)}                                         ║
║  Slow Requests (>1s) : ${String(networkSummary.slowCount).padStart(6)}                                         ║
║  Avg Response Time   : ${String(networkSummary.avgDuration).padStart(6)}ms                                    ║`;
  }

  report += `
║                                                                              ║
╚════════════════════════════════════════════════════════════════════════════════╝`;

  return report;
}

/**
 * Validates performance against defined budgets and returns pass/fail results.
 */
export function validatePerformanceBudget(
  navTiming: NavigationTimingMetrics,
  webVitals: CoreWebVitals,
  budget: PerformanceBudget = DEFAULT_BUDGETS
): Array<{ metric: string; actual: number; budget: number; passed: boolean }> {
  const results: Array<{ metric: string; actual: number; budget: number; passed: boolean }> = [];

  if (budget.pageLoad !== undefined) {
    results.push({ metric: 'Page Load', actual: navTiming.pageLoad, budget: budget.pageLoad, passed: navTiming.pageLoad <= budget.pageLoad });
  }
  if (budget.ttfb !== undefined && webVitals.ttfb !== null) {
    results.push({ metric: 'TTFB', actual: webVitals.ttfb, budget: budget.ttfb, passed: webVitals.ttfb <= budget.ttfb });
  }
  if (budget.fcp !== undefined && webVitals.fcp !== null) {
    results.push({ metric: 'FCP', actual: webVitals.fcp, budget: budget.fcp, passed: webVitals.fcp <= budget.fcp });
  }
  if (budget.lcp !== undefined && webVitals.lcp !== null) {
    results.push({ metric: 'LCP', actual: webVitals.lcp, budget: budget.lcp, passed: webVitals.lcp <= budget.lcp });
  }
  if (budget.cls !== undefined && webVitals.cls !== null) {
    results.push({ metric: 'CLS', actual: webVitals.cls, budget: budget.cls, passed: webVitals.cls <= budget.cls });
  }
  if (budget.domContentLoaded !== undefined) {
    results.push({ metric: 'DOM Content Loaded', actual: navTiming.domContentLoaded, budget: budget.domContentLoaded, passed: navTiming.domContentLoaded <= budget.domContentLoaded });
  }

  return results;
}

/**
 * Captures a full screenshot for visual performance regression tracking.
 */
export async function capturePerformanceScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/perf-screenshots/${name}-${Date.now()}.png`, fullPage: true });
}

/**
 * Waits for network idle state (no requests for a specified duration).
 */
export async function waitForNetworkSettled(page: Page, idleTimeMs = 2000, timeout = 30000): Promise<number> {
  const start = Date.now();
  await page.waitForLoadState('networkidle', { timeout });
  return Date.now() - start;
}

/**
 * Gets the frame timing data for animation performance analysis.
 */
export async function getFrameTimingData(page: Page, durationMs = 3000): Promise<{ fps: number; droppedFrames: number; totalFrames: number }> {
  return await page.evaluate((duration) => {
    return new Promise<{ fps: number; droppedFrames: number; totalFrames: number }>((resolve) => {
      let frameCount = 0;
      const start = performance.now();

      function countFrame() {
        frameCount++;
        if (performance.now() - start < duration) {
          requestAnimationFrame(countFrame);
        } else {
          const elapsed = (performance.now() - start) / 1000;
          const fps = Math.round(frameCount / elapsed);
          const expectedFrames = Math.round(elapsed * 60);
          resolve({
            fps,
            droppedFrames: Math.max(0, expectedFrames - frameCount),
            totalFrames: frameCount,
          });
        }
      }

      requestAnimationFrame(countFrame);
    });
  }, durationMs);
}
