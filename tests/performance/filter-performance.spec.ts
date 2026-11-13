/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  FILTER PERFORMANCE TEST — "PerformanceTesting" Saved Filter
 *
 *  End-to-end performance profiling of the Saved Filter workflow:
 *
 *  1. Login → Navigate to Home page (record login-to-home timing)
 *  2. Measure initial home page load with 3 KPIs:
 *     - Not Started Shipments
 *     - Arrived Shipments
 *     - In Transit Shipments
 *  3. Click "Show filter" button (top-right) → sidebar opens
 *  4. Click settings icon (next to "Saved current filter criteria")
 *     → saved filters panel appears
 *  5. Click "PerformanceTesting" saved filter
 *     → loader starts, page reloads with filtered data
 *     → measure KPI reload timings
 *  6. Map toggle: click "Destination" (default "Origin"), record API timing
 *  7. Mode of Transport tabs: Ocean, Air, Rail, Road
 *     → click each tab, measure data load & widget render:
 *        Metrics, Recently Viewed Shipments, Favourite
 *  8. Pretty-print all results to console
 *  9. Persist JSON + TXT reports into  FilterPerformance/<timestamp>
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { seedLogin } from '../seed.spec';
import {
  createNetworkTracker,
  getMemoryMetrics,
  createConsoleTracker,
  type NetworkRequest,
} from '../../utils/performance-helpers';

// ── Constants ────────────────────────────────────────────────────────────────

// const BASE_URL = 'https://test.itt.bdpsmart.com';

const BASE_URL = 'https://stage.itt.bdpsmart.com';
const HOME_URL = `${BASE_URL}/#/home`;

const KPI_NAMES = [
  'Not Started Shipments',
  'Arrived Shipments',
  'In Transit Shipments',
] as const;

const TRANSPORT_TABS = ['Ocean', 'Air', 'Rail', 'Road'] as const;
const WIDGET_NAMES = ['Metrics', 'Recently Viewed Shipments', 'Favourite'] as const;

type KpiName = (typeof KPI_NAMES)[number];
type TransportTab = (typeof TRANSPORT_TABS)[number];
type WidgetName = (typeof WIDGET_NAMES)[number];

// ── Interfaces ───────────────────────────────────────────────────────────────

interface ApiCallRecord {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  resourceType: string;
  timestamp: number;
}

interface KpiResult {
  name: string;
  renderTimeMs: number;
  dataValue: string;
  apiCalls: ApiCallRecord[];
}

interface FilterApplyResult {
  filterName: string;
  showFilterClickMs: number;       // time to open the sidebar
  settingsIconClickMs: number;     // time for saved filters panel to appear
  filterApplyTimeMs: number;       // total time from filter click → all KPIs loaded
  kpiResults: KpiResult[];
  apiCalls: ApiCallRecord[];
  slowestApiMs: number;
  slowestApiUrl: string;
}

interface MapToggleResult {
  toggleName: string;
  switchTimeMs: number;
  networkIdleTimeMs: number;
  apiCalls: ApiCallRecord[];
  slowestApiMs: number;
  slowestApiUrl: string;
}

interface WidgetTimingResult {
  widgetName: string;
  renderTimeMs: number;
  visible: boolean;
}

interface TransportTabResult {
  tabName: string;
  switchTimeMs: number;
  apiResponseTimeMs: number;
  dataDisplayTimeMs: number;
  networkIdleTimeMs: number;
  apiCalls: ApiCallRecord[];
  slowestApiMs: number;
  slowestApiUrl: string;
  widgetTimings: WidgetTimingResult[];
}

interface FilterPerformanceReport {
  testName: string;
  timestamp: string;
  durationMs: number;
  browser: string;

  /** Login → Home page timing */
  loginToHomeMs: number;

  /** Initial home page load */
  initialPageLoadMs: number;
  initialPageLoadApiCalls: ApiCallRecord[];
  initialKpiResults: KpiResult[];

  /** Filter apply timing */
  filterApply: FilterApplyResult | null;

  /** Map toggle after filter */
  mapToggle: MapToggleResult | null;

  /** Mode of Transport tabs after filter */
  transportTabs: TransportTabResult[];

  /** Aggregate API statistics */
  apiSummary: {
    totalCalls: number;
    failedCalls: number;
    avgResponseMs: number;
    p50Ms: number;
    p90Ms: number;
    p99Ms: number;
    maxMs: number;
    minMs: number;
    slowCalls: number;
  };

  /** Memory snapshots */
  memorySnapshots: Array<{ stage: string; usedMB: number; totalMB: number }>;

  /** Console errors */
  consoleErrors: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function buildApiSummary(calls: ApiCallRecord[]) {
  if (calls.length === 0) {
    return { totalCalls: 0, failedCalls: 0, avgResponseMs: 0, p50Ms: 0, p90Ms: 0, p99Ms: 0, maxMs: 0, minMs: 0, slowCalls: 0 };
  }
  const durations = calls.map(c => c.durationMs).sort((a, b) => a - b);
  return {
    totalCalls: calls.length,
    failedCalls: calls.filter(c => c.status >= 400).length,
    avgResponseMs: Math.round(durations.reduce((s, d) => s + d, 0) / durations.length),
    p50Ms: percentile(durations, 0.5),
    p90Ms: percentile(durations, 0.9),
    p99Ms: percentile(durations, 0.99),
    maxMs: durations[durations.length - 1],
    minMs: durations[0],
    slowCalls: durations.filter(d => d > 1000).length,
  };
}

function toApiRecords(requests: NetworkRequest[]): ApiCallRecord[] {
  return requests
    .filter(r => r.resourceType === 'xhr' || r.resourceType === 'fetch')
    .map(r => ({
      url: r.url,
      method: r.method,
      status: r.status,
      durationMs: r.duration,
      resourceType: r.resourceType,
      timestamp: r.timestamp,
    }));
}

function ratingIcon(ms: number, good = 2000, poor = 5000): string {
  if (ms <= good) return '🟢';
  if (ms <= poor) return '🟡';
  return '🔴';
}

function ratingLabel(ms: number, good = 2000, poor = 5000): string {
  if (ms <= good) return 'GOOD';
  if (ms <= poor) return 'NEEDS IMPROVEMENT';
  return 'POOR';
}

function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slowestApi(calls: ApiCallRecord[]): { durationMs: number; url: string } {
  if (calls.length === 0) return { durationMs: 0, url: 'N/A' };
  return calls.reduce((max, a) => (a.durationMs > max.durationMs ? a : max), calls[0]);
}

// ── Report Persistence ───────────────────────────────────────────────────────

function saveReport(report: FilterPerformanceReport) {
  const ts = getTimestamp();
  const outDir = path.resolve(__dirname, '..', '..', 'FilterPerformance');
  ensureDir(outDir);

  const jsonFile = path.join(outDir, `filter-perf-${ts}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), 'utf-8');

  const txtFile = path.join(outDir, `filter-perf-${ts}.txt`);
  fs.writeFileSync(txtFile, buildTextReport(report), 'utf-8');

  console.log(`\n  📄 JSON report saved → ${jsonFile}`);
  console.log(`  📝 Text report saved → ${txtFile}`);
}

// ── Text Report Builder ─────────────────────────────────────────────────────

function buildTextReport(r: FilterPerformanceReport): string {
  const HR = '═'.repeat(100);
  const hr = '─'.repeat(100);
  const lines: string[] = [];
  const w = (s = '') => lines.push(s);

  w();
  w(`╔${HR}╗`);
  w(`║${'FILTER PERFORMANCE TEST REPORT'.padStart(65).padEnd(100)}║`);
  w(`║${'Saved Filter: "PerformanceTesting"'.padStart(67).padEnd(100)}║`);
  w(`╠${HR}╣`);
  w(`║  Test Name   : ${r.testName.padEnd(84)}║`);
  w(`║  Timestamp   : ${r.timestamp.padEnd(84)}║`);
  w(`║  Browser     : ${r.browser.padEnd(84)}║`);
  w(`║  Duration    : ${(r.durationMs / 1000).toFixed(1)}s`.padEnd(101) + '║');
  w(`╠${HR}╣`);

  // ── Login → Home ──
  w(`║  ── LOGIN → HOME PAGE ──`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.loginToHomeMs, 10000, 30000)} Login to Home Page   : ${String(r.loginToHomeMs).padStart(6)}ms  ${ratingLabel(r.loginToHomeMs, 10000, 30000)}`.padEnd(101) + '║');
  w(`║${''.padEnd(100)}║`);

  // ── Initial Page Load ──
  w(`╠${HR}╣`);
  w(`║  ── INITIAL HOME PAGE LOAD (Before Filter) ──`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.initialPageLoadMs)} Page Load Time     : ${String(r.initialPageLoadMs).padStart(6)}ms  ${ratingLabel(r.initialPageLoadMs, 5000, 15000)}`.padEnd(101) + '║');
  w(`║    API calls during load : ${String(r.initialPageLoadApiCalls.length).padStart(6)}`.padEnd(101) + '║');
  w(`║${''.padEnd(100)}║`);

  // ── Initial KPI Cards ──
  w(`║  ── INITIAL KPI CARD TIMINGS ──`.padEnd(101) + '║');
  w(`║  ${'KPI NAME'.padEnd(30)} ${'RENDER TIME'.padStart(12)}  ${'DATA VALUE'.padStart(12)}  RATING`.padEnd(101) + '║');
  w(`║  ${hr.slice(0, 98)}║`);
  for (const kpi of r.initialKpiResults) {
    w(`║  ${ratingIcon(kpi.renderTimeMs)} ${kpi.name.padEnd(28)} ${String(kpi.renderTimeMs).padStart(8)}ms  ${kpi.dataValue.padStart(12)}  ${ratingLabel(kpi.renderTimeMs, 3000, 8000)}`.padEnd(101) + '║');
  }
  w(`║${''.padEnd(100)}║`);

  // ── Filter Apply ──
  if (r.filterApply) {
    const fa = r.filterApply;
    w(`╠${HR}╣`);
    w(`║  ── SAVED FILTER APPLICATION: "${fa.filterName}" ──`.padEnd(101) + '║');
    w(`║${''.padEnd(100)}║`);
    w(`║  ${ratingIcon(fa.showFilterClickMs, 1000, 3000)} "Show filter" → sidebar open  : ${String(fa.showFilterClickMs).padStart(6)}ms`.padEnd(101) + '║');
    w(`║  ${ratingIcon(fa.settingsIconClickMs, 1000, 3000)} Settings icon → panel open    : ${String(fa.settingsIconClickMs).padStart(6)}ms`.padEnd(101) + '║');
    w(`║  ${ratingIcon(fa.filterApplyTimeMs, 5000, 15000)} Filter click → all data loaded : ${String(fa.filterApplyTimeMs).padStart(6)}ms  ${ratingLabel(fa.filterApplyTimeMs, 5000, 15000)}`.padEnd(101) + '║');
    w(`║    API calls during filter      : ${String(fa.apiCalls.length).padStart(6)}`.padEnd(101) + '║');
    w(`║    Slowest API                  : ${String(fa.slowestApiMs).padStart(6)}ms`.padEnd(101) + '║');
    w(`║${''.padEnd(100)}║`);

    // KPI cards after filter
    w(`║  ── KPI CARDS AFTER FILTER ──`.padEnd(101) + '║');
    w(`║  ${'KPI NAME'.padEnd(30)} ${'RENDER TIME'.padStart(12)}  ${'DATA VALUE'.padStart(12)}  RATING`.padEnd(101) + '║');
    w(`║  ${hr.slice(0, 98)}║`);
    for (const kpi of fa.kpiResults) {
      w(`║  ${ratingIcon(kpi.renderTimeMs)} ${kpi.name.padEnd(28)} ${String(kpi.renderTimeMs).padStart(8)}ms  ${kpi.dataValue.padStart(12)}  ${ratingLabel(kpi.renderTimeMs, 3000, 8000)}`.padEnd(101) + '║');
    }
    w(`║${''.padEnd(100)}║`);

    // API calls detail
    if (fa.apiCalls.length > 0) {
      w(`║  ── API CALLS DURING FILTER APPLICATION ──`.padEnd(101) + '║');
      for (const a of fa.apiCalls.slice(0, 20)) {
        const shortUrl = a.url.split('?')[0];
        const displayUrl = shortUrl.length > 55 ? '…' + shortUrl.slice(-54) : shortUrl;
        const icon = a.status < 400 ? '✅' : '❌';
        w(`║    ${icon} [${a.method.padEnd(4)}] ${String(a.durationMs).padStart(5)}ms | ${a.status} | ${displayUrl}`.padEnd(101) + '║');
      }
      if (fa.apiCalls.length > 20) {
        w(`║    … and ${fa.apiCalls.length - 20} more API calls`.padEnd(101) + '║');
      }
      w(`║${''.padEnd(100)}║`);
    }
  }

  // ── Map Toggle ──
  if (r.mapToggle) {
    w(`╠${HR}╣`);
    w(`║  ── MAP TOGGLE (Origin → Destination) — After Filter ──`.padEnd(101) + '║');
    w(`║  ${ratingIcon(r.mapToggle.switchTimeMs)} Toggle switch time    : ${String(r.mapToggle.switchTimeMs).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    Network idle time     : ${String(r.mapToggle.networkIdleTimeMs).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    API calls fired       : ${String(r.mapToggle.apiCalls.length).padStart(6)}`.padEnd(101) + '║');
    w(`║    Slowest API           : ${String(r.mapToggle.slowestApiMs).padStart(6)}ms`.padEnd(101) + '║');
    if (r.mapToggle.apiCalls.length > 0) {
      w(`║  ${hr.slice(0, 98)}║`);
      for (const a of r.mapToggle.apiCalls.slice(0, 10)) {
        const shortUrl = a.url.length > 60 ? '…' + a.url.slice(-59) : a.url;
        const icon = a.status < 400 ? '✅' : '❌';
        w(`║    ${icon} [${a.method.padEnd(4)}] ${String(a.durationMs).padStart(5)}ms | ${a.status} | ${shortUrl}`.padEnd(101) + '║');
      }
    }
    w(`║${''.padEnd(100)}║`);
  }

  // ── Mode of Transport Tabs ──
  if (r.transportTabs.length > 0) {
    w(`╠${HR}╣`);
    w(`║  ── MODE OF TRANSPORT — TAB SWITCHING (After Filter) ──`.padEnd(101) + '║');
    w(`║  ${'TAB'.padEnd(10)} ${'SWITCH'.padStart(8)}  ${'API RESP'.padStart(10)}  ${'DATA DISP'.padStart(10)}  ${'APIs'.padStart(5)}  ${'SLOWEST'.padStart(9)}  RATING`.padEnd(101) + '║');
    w(`║  ${hr.slice(0, 98)}║`);
    for (const t of r.transportTabs) {
      w(`║  ${ratingIcon(t.dataDisplayTimeMs)} ${t.tabName.padEnd(8)} ${String(t.switchTimeMs).padStart(6)}ms  ${String(t.apiResponseTimeMs).padStart(8)}ms  ${String(t.dataDisplayTimeMs).padStart(8)}ms  ${String(t.apiCalls.length).padStart(5)}  ${String(t.slowestApiMs).padStart(7)}ms  ${ratingLabel(t.dataDisplayTimeMs, 3000, 8000)}`.padEnd(101) + '║');
    }
    w(`║${''.padEnd(100)}║`);

    const avgApiResp = Math.round(r.transportTabs.reduce((s, t) => s + t.apiResponseTimeMs, 0) / (r.transportTabs.length || 1));
    const avgDisplay = Math.round(r.transportTabs.reduce((s, t) => s + t.dataDisplayTimeMs, 0) / (r.transportTabs.length || 1));
    w(`║  Avg API response  : ${String(avgApiResp).padStart(6)}ms    Avg data display : ${String(avgDisplay).padStart(6)}ms`.padEnd(101) + '║');
    w(`║${''.padEnd(100)}║`);

    // Per-tab detail
    w(`║  ── PER-TAB DETAIL: API CALLS & WIDGET DISPLAY ──`.padEnd(101) + '║');
    for (const t of r.transportTabs) {
      w(`║  ${hr.slice(0, 98)}║`);
      w(`║  📋 ${t.tabName}  (switch=${t.switchTimeMs}ms → API=${t.apiResponseTimeMs}ms → display=${t.dataDisplayTimeMs}ms)`.padEnd(101) + '║');
      w(`║${''.padEnd(100)}║`);
      if (t.apiCalls.length > 0) {
        w(`║    📡 API Calls (${t.apiCalls.length}):`.padEnd(101) + '║');
        for (const a of t.apiCalls) {
          const shortUrl = a.url.split('?')[0];
          const displayUrl = shortUrl.length > 50 ? '…' + shortUrl.slice(-49) : shortUrl;
          const icon = a.status < 400 ? '✅' : '❌';
          w(`║      ${icon} [${a.method.padEnd(4)}] ${String(a.durationMs).padStart(5)}ms | ${a.status} | ${displayUrl}`.padEnd(101) + '║');
        }
      } else {
        w(`║    📡 No API calls detected (may use cached data)`.padEnd(101) + '║');
      }
      w(`║${''.padEnd(100)}║`);
      w(`║    📊 Widget Display Timings:`.padEnd(101) + '║');
      for (const wt of t.widgetTimings) {
        if (wt.visible) {
          w(`║      ${ratingIcon(wt.renderTimeMs, 3000, 8000)} ${wt.widgetName.padEnd(28)} ${String(wt.renderTimeMs).padStart(6)}ms  ${ratingLabel(wt.renderTimeMs, 3000, 8000)}`.padEnd(101) + '║');
        } else {
          w(`║      ⬜ ${wt.widgetName.padEnd(28)} NOT VISIBLE`.padEnd(101) + '║');
        }
      }
    }
    w(`║${''.padEnd(100)}║`);
  }

  // ── API Summary ──
  w(`╠${HR}╣`);
  w(`║  ── AGGREGATE API STATISTICS ──`.padEnd(101) + '║');
  w(`║  Total API calls   : ${String(r.apiSummary.totalCalls).padStart(6)}`.padEnd(101) + '║');
  w(`║  Failed calls      : ${String(r.apiSummary.failedCalls).padStart(6)}`.padEnd(101) + '║');
  w(`║  Slow calls (>1s)  : ${String(r.apiSummary.slowCalls).padStart(6)}`.padEnd(101) + '║');
  w(`║  Min response      : ${String(r.apiSummary.minMs).padStart(6)}ms`.padEnd(101) + '║');
  w(`║  Avg response      : ${String(r.apiSummary.avgResponseMs).padStart(6)}ms`.padEnd(101) + '║');
  w(`║  P50 response      : ${String(r.apiSummary.p50Ms).padStart(6)}ms`.padEnd(101) + '║');
  w(`║  P90 response      : ${String(r.apiSummary.p90Ms).padStart(6)}ms`.padEnd(101) + '║');
  w(`║  P99 response      : ${String(r.apiSummary.p99Ms).padStart(6)}ms`.padEnd(101) + '║');
  w(`║  Max response      : ${String(r.apiSummary.maxMs).padStart(6)}ms`.padEnd(101) + '║');
  w(`║${''.padEnd(100)}║`);

  // ── Memory ──
  if (r.memorySnapshots.length > 0) {
    w(`╠${HR}╣`);
    w(`║  ── MEMORY SNAPSHOTS ──`.padEnd(101) + '║');
    w(`║  ${'STAGE'.padEnd(40)} ${'USED'.padStart(10)}  ${'TOTAL'.padStart(10)}`.padEnd(101) + '║');
    w(`║  ${hr.slice(0, 98)}║`);
    for (const m of r.memorySnapshots) {
      w(`║  ${m.stage.padEnd(40)} ${String(m.usedMB.toFixed(2)).padStart(8)} MB  ${String(m.totalMB.toFixed(2)).padStart(8)} MB`.padEnd(101) + '║');
    }
    w(`║${''.padEnd(100)}║`);
  }

  // ── Console Errors ──
  if (r.consoleErrors.length > 0) {
    w(`╠${HR}╣`);
    w(`║  ── CONSOLE ERRORS (${r.consoleErrors.length}) ──`.padEnd(101) + '║');
    for (const e of r.consoleErrors.slice(0, 15)) {
      w(`║  ❌ ${e.substring(0, 94)}`.padEnd(101) + '║');
    }
    w(`║${''.padEnd(100)}║`);
  }

  w(`╚${HR}╝`);
  w();
  w(`Report generated at: ${r.timestamp}`);
  w(`Test duration: ${(r.durationMs / 1000).toFixed(1)}s`);
  w();
  return lines.join('\n');
}

function printReport(r: FilterPerformanceReport) {
  const text = buildTextReport(r);
  console.log(text);
}

// ═════════════════════════════════════════════════════════════════════════════
//  TEST
// ═════════════════════════════════════════════════════════════════════════════

test.describe('🔍 Filter Performance — Saved Filter "PerformanceTesting"', () => {

  test.setTimeout(300_000); // 5 minutes — login + initial load + filter + map + tabs

  test('FP-01: Saved filter application & post-filter performance profiling', async ({ page, context, browserName }) => {

    const testStart = Date.now();
    const allApiCalls: ApiCallRecord[] = [];
    const memorySnapshots: Array<{ stage: string; usedMB: number; totalMB: number }> = [];

    // Console error tracker
    const consoleTracker = createConsoleTracker(page);
    consoleTracker.start();

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 1 — LOGIN & NAVIGATE TO HOME PAGE
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(100));
    console.log('  🔍 FILTER PERFORMANCE TEST — Saved Filter "PerformanceTesting"');
    console.log('═'.repeat(100));
    console.log('\n  ⏳ Step 1/7 — Logging in …');

    const loginStart = Date.now();
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    // Track network during home page load
    const pageLoadTracker = createNetworkTracker(page);
    pageLoadTracker.start();
    const pageLoadStart = Date.now();

    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/#\/home/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000); // settle time for SPA

    pageLoadTracker.stop();
    const initialPageLoadMs = Date.now() - pageLoadStart;
    const loginToHomeMs = Date.now() - loginStart;
    const initialPageLoadApiCalls = toApiRecords(pageLoadTracker.getRequests());
    allApiCalls.push(...initialPageLoadApiCalls);

    console.log(`  ✅ Login → Home page: ${loginToHomeMs}ms`);
    console.log(`  ✅ Home page loaded in ${initialPageLoadMs}ms  (${initialPageLoadApiCalls.length} API calls)`);

    // Memory — baseline
    const memBaseline = await getMemoryMetrics(page);
    if (memBaseline) {
      memorySnapshots.push({ stage: 'After Initial Home Page Load', usedMB: memBaseline.usedJSHeapSizeMB, totalMB: memBaseline.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 2 — INITIAL KPI CARDS (Before Filter)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 2/7 — Measuring initial KPI card render times …');

    const initialKpiResults: KpiResult[] = [];
    const kpiMeasureStart = Date.now();

    for (const kpiName of KPI_NAMES) {
      try {
        const kpiLabel = page.getByText(kpiName).first();
        await expect(kpiLabel).toBeVisible({ timeout: 30_000 });
        const kpiRenderTime = Date.now() - kpiMeasureStart;

        let dataValue = 'N/A';
        try {
          const kpiCard = kpiLabel.locator('..').first();
          const parentText = await kpiCard.textContent({ timeout: 5_000 });
          const numericMatch = parentText?.match(/[\d,]+/);
          if (numericMatch) dataValue = numericMatch[0];
        } catch {
          try {
            const grandParent = kpiLabel.locator('../..').first();
            const gpText = await grandParent.textContent({ timeout: 5_000 });
            const numMatch = gpText?.match(/[\d,]+/);
            if (numMatch) dataValue = numMatch[0];
          } catch { /* leave as N/A */ }
        }

        initialKpiResults.push({ name: kpiName, renderTimeMs: kpiRenderTime, dataValue, apiCalls: [] });
        console.log(`    ${ratingIcon(kpiRenderTime, 3000, 8000)} ${kpiName.padEnd(25)} rendered in ${kpiRenderTime}ms  value=${dataValue}`);
      } catch (err) {
        initialKpiResults.push({ name: kpiName, renderTimeMs: Date.now() - kpiMeasureStart, dataValue: 'TIMEOUT', apiCalls: [] });
        console.log(`    ❌ ${kpiName}: ${(err as Error).message}`);
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 3 — CLICK "SHOW FILTER" → OPEN SIDEBAR
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 3/7 — Clicking "Show filter" button …');

    let showFilterClickMs = 0;
    let settingsIconClickMs = 0;

    try {
      // Wait for any initial spinner/loader to disappear before interacting
      await page.locator('#spinner.backdrop').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});

      // Find "Show filters" button — PrimeNG button with title="Show filters"
      const showFilterBtn = page.getByRole('button', { name: 'Show filters' });
      await expect(showFilterBtn).toBeVisible({ timeout: 15_000 });

      const showFilterStart = Date.now();
      await showFilterBtn.click();

      // Wait for the sidebar (PrimeNG p-drawer) to open
      await page.locator('.p-drawer-active, [data-pc-name="sidebar"]').waitFor({ state: 'visible', timeout: 15_000 });
      await page.waitForTimeout(1000); // allow sidebar content to render
      showFilterClickMs = Date.now() - showFilterStart;

      console.log(`    ${ratingIcon(showFilterClickMs, 1000, 3000)} Sidebar opened in ${showFilterClickMs}ms`);
    } catch (err) {
      console.log(`    ❌ "Show filters" click failed: ${(err as Error).message}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 4 — CLICK SETTINGS ICON → SAVED FILTERS PANEL
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 4/7 — Clicking settings icon (cog) for saved filters …');

    try {
      // Wait for any spinner overlay to disappear first
      await page.locator('#spinner.backdrop').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});

      // The settings icon is a PrimeNG icon-only button with pi-cog icon, inside the sidebar
      const sidebar = page.locator('.p-drawer-active, [data-pc-name="sidebar"]');
      const cogButton = sidebar.locator('button.p-button-icon-only:has(span.pi-cog)');

      const settingsStart = Date.now();

      // Wait for the cog button to be visible inside the sidebar
      await expect(cogButton).toBeVisible({ timeout: 10_000 });
      console.log('    ✅ Found cog/settings icon button inside sidebar');

      // Use force:true to bypass any remaining overlay interception
      await cogButton.click({ force: true });
      console.log('    🖱️ Clicked cog icon');

      // Wait for saved filters panel to expand within the sidebar
      await page.waitForTimeout(2000); // allow the saved filter list to render
      settingsIconClickMs = Date.now() - settingsStart;
      console.log(`    ${ratingIcon(settingsIconClickMs, 1000, 3000)} Saved filters panel opened in ${settingsIconClickMs}ms`);
    } catch (err) {
      console.log(`    ❌ Settings icon click failed: ${(err as Error).message}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 5 — CLICK "PerformanceTesting" SAVED FILTER → MEASURE RELOAD
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 5/7 — Applying "PerformanceTesting" saved filter …');

    let filterApplyResult: FilterApplyResult | null = null;

    try {
      // Find the "PeformanceTesting" saved filter button (note: app has typo "Peformance" not "Performance")
      // The button is: <button pbutton class="text-primary text-sm ...">PeformanceTesting</button>
      const perfFilter = page.locator('button.text-primary:has-text("PeformanceTesting")').first()
        .or(page.getByText('PeformanceTesting', { exact: true }).first())
        .or(page.getByText('PerformanceTesting', { exact: false }).first());

      await expect(perfFilter).toBeVisible({ timeout: 15_000 });
      console.log('    ✅ Found "PeformanceTesting" saved filter button');

      // Start tracking network + timing
      const filterTracker = createNetworkTracker(page);
      filterTracker.start();
      const filterClickStart = Date.now();

      await perfFilter.click({ force: true });
      console.log('    🖱️ Clicked "PeformanceTesting" — loader expected …');

      // Wait for page to reload with filtered data — loader appears then disappears
      // Wait for any loader/spinner to appear and then disappear
      try {
        // Wait for the ng-http-loader spinner backdrop to appear and disappear
        const spinner = page.locator('#spinner.backdrop');
        await spinner.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
        console.log('    ⏳ Spinner/loader appeared …');
        // Wait for spinner to disappear — indicates data has loaded
        await spinner.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
        console.log('    ✅ Spinner/loader disappeared');
      } catch {
        // If no spinner detected, wait for network idle
        console.log('    ⏳ No spinner detected, waiting for network settle …');
      }

      // Wait for network to fully settle after filter application
      await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(2000); // settle time

      filterTracker.stop();
      const filterApiCalls = toApiRecords(filterTracker.getRequests());
      allApiCalls.push(...filterApiCalls);
      const filterSlowest = slowestApi(filterApiCalls);

      // Measure KPIs after filter
      const filteredKpiResults: KpiResult[] = [];
      const kpiAfterFilterStart = Date.now();

      for (const kpiName of KPI_NAMES) {
        try {
          const kpiLabel = page.getByText(kpiName).first();
          await expect(kpiLabel).toBeVisible({ timeout: 30_000 });
          const kpiRenderTime = Date.now() - filterClickStart; // time from filter click

          let dataValue = 'N/A';
          try {
            const kpiCard = kpiLabel.locator('..').first();
            const parentText = await kpiCard.textContent({ timeout: 5_000 });
            const numericMatch = parentText?.match(/[\d,]+/);
            if (numericMatch) dataValue = numericMatch[0];
          } catch {
            try {
              const grandParent = kpiLabel.locator('../..').first();
              const gpText = await grandParent.textContent({ timeout: 5_000 });
              const numMatch = gpText?.match(/[\d,]+/);
              if (numMatch) dataValue = numMatch[0];
            } catch { /* leave as N/A */ }
          }

          filteredKpiResults.push({ name: kpiName, renderTimeMs: kpiRenderTime, dataValue, apiCalls: [] });
          console.log(`    ${ratingIcon(kpiRenderTime, 3000, 8000)} ${kpiName.padEnd(25)} loaded in ${kpiRenderTime}ms  value=${dataValue}`);
        } catch (err) {
          filteredKpiResults.push({ name: kpiName, renderTimeMs: Date.now() - filterClickStart, dataValue: 'TIMEOUT', apiCalls: [] });
          console.log(`    ❌ ${kpiName}: ${(err as Error).message}`);
        }
      }

      const filterApplyTimeMs = Date.now() - filterClickStart;

      filterApplyResult = {
        filterName: 'PerformanceTesting',
        showFilterClickMs,
        settingsIconClickMs,
        filterApplyTimeMs,
        kpiResults: filteredKpiResults,
        apiCalls: filterApiCalls,
        slowestApiMs: filterSlowest.durationMs,
        slowestApiUrl: filterSlowest.url,
      };

      console.log(`\n    ${ratingIcon(filterApplyTimeMs, 5000, 15000)} TOTAL filter apply → all data: ${filterApplyTimeMs}ms  (${filterApiCalls.length} APIs, slowest ${filterSlowest.durationMs}ms)`);

      // Detailed API log
      console.log(`\n    ── API Calls During Filter (${filterApiCalls.length}) ──`);
      for (const a of filterApiCalls) {
        const shortUrl = a.url.split('?')[0];
        const displayUrl = shortUrl.length > 55 ? '…' + shortUrl.slice(-54) : shortUrl;
        console.log(`       ${a.status < 400 ? '✅' : '❌'} [${a.method}] ${a.durationMs}ms | ${a.status} | ${displayUrl}`);
      }
    } catch (err) {
      console.log(`    ❌ Filter application failed: ${(err as Error).message}`);
    }

    // Memory after filter
    const memAfterFilter = await getMemoryMetrics(page);
    if (memAfterFilter) {
      memorySnapshots.push({ stage: 'After Filter Applied', usedMB: memAfterFilter.usedJSHeapSizeMB, totalMB: memAfterFilter.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 6 — MAP TOGGLE: Origin → Destination (After Filter)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 6/7 — Clicking map Destination toggle (post-filter) …');

    let mapToggleResult: MapToggleResult | null = null;

    try {
      // Scroll up to make map visible
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await page.waitForTimeout(500);

      const destinationToggle = page.getByText('Destination', { exact: true }).first();
      await expect(destinationToggle).toBeVisible({ timeout: 10_000 });

      const mapTracker = createNetworkTracker(page);
      mapTracker.start();
      const mapToggleStart = Date.now();

      await destinationToggle.click();

      // Wait for API response triggered by toggle
      try {
        await page.waitForResponse(
          resp => (resp.request().resourceType() === 'xhr' || resp.request().resourceType() === 'fetch') && resp.status() < 500,
          { timeout: 15_000 },
        );
      } catch { /* may not fire separate API */ }

      const netIdleStart = Date.now();
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const networkIdleTimeMs = Date.now() - netIdleStart;

      mapTracker.stop();
      const switchTimeMs = Date.now() - mapToggleStart;
      const mapApiCalls = toApiRecords(mapTracker.getRequests());
      allApiCalls.push(...mapApiCalls);
      const mapSlowest = slowestApi(mapApiCalls);

      mapToggleResult = {
        toggleName: 'Destination',
        switchTimeMs,
        networkIdleTimeMs,
        apiCalls: mapApiCalls,
        slowestApiMs: mapSlowest.durationMs,
        slowestApiUrl: mapSlowest.url,
      };

      console.log(`    ${ratingIcon(switchTimeMs)} Map toggle to Destination: ${switchTimeMs}ms  apis=${mapApiCalls.length}  slowest=${mapSlowest.durationMs}ms`);

      // Log API calls
      for (const a of mapApiCalls) {
        const shortUrl = a.url.split('?')[0];
        const displayUrl = shortUrl.length > 55 ? '…' + shortUrl.slice(-54) : shortUrl;
        console.log(`       ${a.status < 400 ? '✅' : '❌'} [${a.method}] ${a.durationMs}ms | ${a.status} | ${displayUrl}`);
      }
    } catch (err) {
      console.log(`    ❌ Map toggle failed: ${(err as Error).message}`);
    }

    // Memory after map toggle
    const memAfterMap = await getMemoryMetrics(page);
    if (memAfterMap) {
      memorySnapshots.push({ stage: 'After Map Toggle (Post-Filter)', usedMB: memAfterMap.usedJSHeapSizeMB, totalMB: memAfterMap.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 7 — MODE OF TRANSPORT TABS (After Filter)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 7/7 — Clicking Mode of Transport tabs (post-filter) …');

    const transportTabResults: TransportTabResult[] = [];

    // Scroll to Mode of Transport section
    try {
      const motSection = page.getByText(/Mode of [Tt]ransport/i).first();
      await motSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    } catch {
      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight * 0.4, behavior: 'smooth' }));
      await page.waitForTimeout(500);
    }

    for (const tabName of TRANSPORT_TABS) {
      console.log(`\n    ── ${tabName} ──`);

      try {
        // Find the tab
        let tabElement = page.getByRole('tab', { name: new RegExp(`^${tabName}$`, 'i') }).first();
        let tabVisible = await tabElement.isVisible().catch(() => false);

        if (!tabVisible) {
          tabElement = page.getByText(tabName, { exact: true }).first();
          tabVisible = await tabElement.isVisible().catch(() => false);
        }

        if (!tabVisible) {
          tabElement = page.locator(`[role="tab"]:has-text("${tabName}"), button:has-text("${tabName}"), .tab:has-text("${tabName}"), [class*="tab"]:has-text("${tabName}")`).first();
          tabVisible = await tabElement.isVisible().catch(() => false);
        }

        if (!tabVisible) {
          console.log(`      ⚠️  Tab "${tabName}" not found — skipping`);
          continue;
        }

        const tabTracker = createNetworkTracker(page);
        tabTracker.start();
        const tabClickStart = Date.now();

        await tabElement.click();
        const switchTimeMs = Date.now() - tabClickStart;

        // Wait for API response after tab click
        let apiResponseTimeMs = 0;
        try {
          await page.waitForResponse(
            resp => (resp.request().resourceType() === 'xhr' || resp.request().resourceType() === 'fetch') && resp.status() < 500,
            { timeout: 20_000 },
          );
          apiResponseTimeMs = Date.now() - tabClickStart;
        } catch {
          apiResponseTimeMs = Date.now() - tabClickStart;
        }

        const netIdleStart = Date.now();
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(1500); // allow widgets to settle
        const networkIdleTimeMs = Date.now() - netIdleStart;

        tabTracker.stop();
        const tabApiCalls = toApiRecords(tabTracker.getRequests());
        allApiCalls.push(...tabApiCalls);
        const tabSlowest = slowestApi(tabApiCalls);

        // ── Measure widget visibility & data display times ──
        const widgetTimings: WidgetTimingResult[] = [];

        for (const widgetName of WIDGET_NAMES) {
          let visible = false;
          let renderTimeMs = 0;

          try {
            let widgetLocator = page.getByRole('heading', { name: new RegExp(widgetName, 'i') }).first();
            let widgetFound = await widgetLocator.isVisible({ timeout: 3_000 }).catch(() => false);

            if (!widgetFound) {
              widgetLocator = page.getByText(widgetName, { exact: false }).first();
              widgetFound = await widgetLocator.isVisible({ timeout: 3_000 }).catch(() => false);
            }

            if (widgetFound) {
              visible = true;
              renderTimeMs = Date.now() - tabClickStart;
            }
          } catch {
            // widget not visible
          }

          widgetTimings.push({ widgetName, renderTimeMs, visible });
        }

        // Total data display time
        const visibleWidgets = widgetTimings.filter(w => w.visible);
        const dataDisplayTimeMs = visibleWidgets.length > 0
          ? Math.max(...visibleWidgets.map(w => w.renderTimeMs))
          : Date.now() - tabClickStart;

        transportTabResults.push({
          tabName,
          switchTimeMs,
          apiResponseTimeMs,
          dataDisplayTimeMs,
          networkIdleTimeMs,
          apiCalls: tabApiCalls,
          slowestApiMs: tabSlowest.durationMs,
          slowestApiUrl: tabSlowest.url,
          widgetTimings,
        });

        // Console output
        console.log(`      ⏱️  Click → API fired    : ${switchTimeMs}ms`);
        console.log(`      📡 API response time    : ${apiResponseTimeMs}ms  (${tabApiCalls.length} calls, slowest ${tabSlowest.durationMs}ms)`);
        for (const a of tabApiCalls) {
          const shortUrl = a.url.split('?')[0];
          const displayUrl = shortUrl.length > 55 ? '…' + shortUrl.slice(-54) : shortUrl;
          console.log(`         ${a.status < 400 ? '✅' : '❌'} [${a.method}] ${a.durationMs}ms | ${a.status} | ${displayUrl}`);
        }
        for (const wt of widgetTimings) {
          if (wt.visible) {
            console.log(`      📊 Widget "${wt.widgetName}" displayed in ${wt.renderTimeMs}ms`);
          } else {
            console.log(`      ⬜ Widget "${wt.widgetName}" — not visible`);
          }
        }
        console.log(`    ${ratingIcon(dataDisplayTimeMs, 3000, 8000)} ${tabName}: total data display=${dataDisplayTimeMs}ms  apiResponse=${apiResponseTimeMs}ms`);
      } catch (err) {
        console.log(`    ❌ Tab "${tabName}" failed: ${(err as Error).message}`);
      }
    }

    // Memory — final snapshot
    const memFinal = await getMemoryMetrics(page);
    if (memFinal) {
      memorySnapshots.push({ stage: 'Final (After All Tabs)', usedMB: memFinal.usedJSHeapSizeMB, totalMB: memFinal.totalJSHeapSizeMB });
    }

    // Stop console tracker
    consoleTracker.stop();
    const consoleErrors = consoleTracker.getErrors().map(e => e.text);

    // ══════════════════════════════════════════════════════════════════════════
    //  BUILD & PERSIST REPORT
    // ══════════════════════════════════════════════════════════════════════════

    const testDuration = Date.now() - testStart;

    const report: FilterPerformanceReport = {
      testName: 'Filter Performance — Saved Filter "PerformanceTesting"',
      timestamp: new Date().toISOString(),
      durationMs: testDuration,
      browser: browserName,
      loginToHomeMs,
      initialPageLoadMs,
      initialPageLoadApiCalls,
      initialKpiResults,
      filterApply: filterApplyResult,
      mapToggle: mapToggleResult,
      transportTabs: transportTabResults,
      apiSummary: buildApiSummary(allApiCalls),
      memorySnapshots,
      consoleErrors,
    };

    // Pretty-print to console
    printReport(report);

    // Persist to disk
    saveReport(report);

    // ══════════════════════════════════════════════════════════════════════════
    //  ASSERTIONS — soft checks
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ── ASSERTIONS ──');

    // Page load under 60s
    expect(initialPageLoadMs, 'Home page should load within 60s').toBeLessThan(60_000);
    console.log(`  ✅ Initial page load (${initialPageLoadMs}ms) under 60s threshold`);

    // Filter apply under 60s
    if (filterApplyResult) {
      expect(filterApplyResult.filterApplyTimeMs, 'Filter apply should complete within 60s').toBeLessThan(60_000);
      console.log(`  ✅ Filter apply (${filterApplyResult.filterApplyTimeMs}ms) under 60s threshold`);
    }

    // KPIs should render within 30s
    for (const kpi of initialKpiResults) {
      expect(kpi.renderTimeMs, `${kpi.name} should render within 30s`).toBeLessThan(30_000);
    }
    console.log(`  ✅ All ${initialKpiResults.length} initial KPI cards rendered within threshold`);

    if (filterApplyResult) {
      for (const kpi of filterApplyResult.kpiResults) {
        expect(kpi.renderTimeMs, `${kpi.name} (post-filter) should render within 60s`).toBeLessThan(60_000);
      }
      console.log(`  ✅ All ${filterApplyResult.kpiResults.length} post-filter KPI cards rendered within threshold`);
    }

    // No excessive console errors
    if (consoleErrors.length > 20) {
      console.log(`  ⚠️  High console error count: ${consoleErrors.length}`);
    } else {
      console.log(`  ✅ Console errors within acceptable range: ${consoleErrors.length}`);
    }

    console.log(`\n  🏁 Test completed in ${(testDuration / 1000).toFixed(1)}s\n`);
  });
});
