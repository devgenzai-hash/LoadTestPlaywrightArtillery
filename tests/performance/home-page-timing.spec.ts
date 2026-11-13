/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  HOME PAGE COMPREHENSIVE TIMING PERFORMANCE TEST
 *
 *  End-to-end performance profiling of the Home / Dashboard page:
 *
 *  1. Login → Navigate to Home page (record page load time)
 *  2. Measure KPI card render times:
 *     - Not Started Shipments
 *     - Arrived Shipments
 *     - In Transit Shipments
 *     (+ capture the numeric data inside each KPI)
 *  3. Map toggle: click "Destination" (default is "Origin") and record API timing
 *  4. Mode of Transport tabs: Ocean, Air, Rail, Road
 *     - Click each tab and measure data load + API timing
 *     - For each tab measure widget render times: Metrics, Recently Viewed
 *       Shipments, Favourite
 *  5. Global Search: type "us100", press Enter, measure navigation + data load
 *  6. Pretty-print results to console
 *  7. Persist JSON + TXT reports into  HomePagePerf/<timestamp>
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { seedLogin } from '../seed.spec';
import {
  createNetworkTracker,
  measureAction,
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
  dataValue: string;     // the numeric text displayed inside the KPI card
  apiCalls: ApiCallRecord[];
}

interface MapToggleResult {
  toggleName: string;
  switchTimeMs: number;
  networkIdleTimeMs: number;
  apiCalls: ApiCallRecord[];
  slowestApiMs: number;
  slowestApiUrl: string;
}

interface TransportTabResult {
  tabName: string;
  switchTimeMs: number;          // click → API fires (UI response)
  apiResponseTimeMs: number;     // time for API call(s) to return
  dataDisplayTimeMs: number;     // time until widgets/data are visually rendered
  networkIdleTimeMs: number;     // time for network to fully settle
  apiCalls: ApiCallRecord[];
  slowestApiMs: number;
  slowestApiUrl: string;
  widgetTimings: WidgetTimingResult[];
}

interface WidgetTimingResult {
  widgetName: string;
  renderTimeMs: number;
  visible: boolean;
}

interface GlobalSearchResult {
  searchTerm: string;
  searchTimeMs: number;          // total end-to-end time (Enter → data loaded)
  navigationTimeMs: number;      // time for URL to change
  resultLoadTimeMs: number;      // time until data rows appear in "All Shipments"
  networkIdleMs: number;
  apiCalls: ApiCallRecord[];      // all API calls (2 on Enter + 1 on result page)
  slowestApiMs: number;
  slowestApiUrl: string;
  navigatedUrl: string;
}

interface HomePagePerfReport {
  testName: string;
  timestamp: string;
  durationMs: number;
  browser: string;

  /** Page load timing */
  pageLoadMs: number;
  pageLoadApiCalls: ApiCallRecord[];

  /** KPI Cards */
  kpiResults: KpiResult[];

  /** Map toggle (Origin → Destination) */
  mapToggle: MapToggleResult | null;

  /** Mode of Transport tab switching */
  transportTabs: TransportTabResult[];

  /** Global Search */
  globalSearch: GlobalSearchResult | null;

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

// ── Report persistence ───────────────────────────────────────────────────────

function saveReport(report: HomePagePerfReport) {
  const ts = getTimestamp();
  const outDir = path.resolve(__dirname, '..', '..', 'HomePagePerf');
  ensureDir(outDir);

  const jsonFile = path.join(outDir, `home-page-perf-${ts}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), 'utf-8');

  const txtFile = path.join(outDir, `home-page-perf-${ts}.txt`);
  fs.writeFileSync(txtFile, buildTextReport(report), 'utf-8');

  console.log(`\n  📄 JSON report saved → ${jsonFile}`);
  console.log(`  📝 Text report saved → ${txtFile}`);
}

// ── Text report builder ──────────────────────────────────────────────────────

function buildTextReport(r: HomePagePerfReport): string {
  const HR = '═'.repeat(100);
  const hr = '─'.repeat(100);
  const lines: string[] = [];
  const w = (s = '') => lines.push(s);

  w();
  w(`╔${HR}╗`);
  w(`║${'HOME PAGE COMPREHENSIVE TIMING REPORT'.padStart(68).padEnd(100)}║`);
  w(`╠${HR}╣`);
  w(`║  Test Name   : ${r.testName.padEnd(84)}║`);
  w(`║  Timestamp   : ${r.timestamp.padEnd(84)}║`);
  w(`║  Browser     : ${r.browser.padEnd(84)}║`);
  w(`║  Duration    : ${(r.durationMs / 1000).toFixed(1)}s`.padEnd(101) + '║');
  w(`╠${HR}╣`);

  // ── Page Load ──
  w(`║  ── HOME PAGE LOAD ──`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.pageLoadMs)} Page Load Time     : ${String(r.pageLoadMs).padStart(6)}ms  ${ratingLabel(r.pageLoadMs, 5000, 15000)}`.padEnd(101) + '║');
  w(`║    API calls during load : ${String(r.pageLoadApiCalls.length).padStart(6)}`.padEnd(101) + '║');
  w(`║${''.padEnd(100)}║`);

  // ── KPI Cards ──
  w(`╠${HR}╣`);
  w(`║  ── KPI CARD RENDER TIMINGS ──`.padEnd(101) + '║');
  w(`║  ${'KPI NAME'.padEnd(30)} ${'RENDER TIME'.padStart(12)}  ${'DATA VALUE'.padStart(12)}  RATING`.padEnd(101) + '║');
  w(`║  ${hr.slice(0, 98)}║`);
  for (const kpi of r.kpiResults) {
    w(`║  ${ratingIcon(kpi.renderTimeMs)} ${kpi.name.padEnd(28)} ${String(kpi.renderTimeMs).padStart(8)}ms  ${kpi.dataValue.padStart(12)}  ${ratingLabel(kpi.renderTimeMs, 3000, 8000)}`.padEnd(101) + '║');
  }
  w(`║${''.padEnd(100)}║`);

  // ── Map Toggle ──
  if (r.mapToggle) {
    w(`╠${HR}╣`);
    w(`║  ── MAP TOGGLE (Origin → Destination) ──`.padEnd(101) + '║');
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
    w(`║  ── MODE OF TRANSPORT — TAB SWITCHING PERFORMANCE ──`.padEnd(101) + '║');
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

    // Per-tab detail: API calls + widget render timings
    w(`║  ── PER-TAB DETAIL: API CALLS & WIDGET DISPLAY ──`.padEnd(101) + '║');
    for (const t of r.transportTabs) {
      w(`║  ${hr.slice(0, 98)}║`);
      w(`║  📋 ${t.tabName}  (switch=${t.switchTimeMs}ms → API=${t.apiResponseTimeMs}ms → display=${t.dataDisplayTimeMs}ms)`.padEnd(101) + '║');
      w(`║${''.padEnd(100)}║`);
      // API calls for this tab
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
      // Widget display timings
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

  // ── Global Search ──
  if (r.globalSearch) {
    const gs = r.globalSearch;
    w(`╠${HR}╣`);
    w(`║  ── GLOBAL SEARCH — "${gs.searchTerm}" ──`.padEnd(101) + '║');
    w(`║${''.padEnd(100)}║`);
    w(`║  ${ratingIcon(gs.searchTimeMs)} TOTAL (Enter → data loaded) : ${String(gs.searchTimeMs).padStart(6)}ms`.padEnd(101) + '║');
    w(`║  ${hr.slice(0, 98)}║`);
    w(`║  ${ratingIcon(gs.navigationTimeMs)} Page navigation time       : ${String(gs.navigationTimeMs).padStart(6)}ms`.padEnd(101) + '║');
    w(`║  ${ratingIcon(gs.resultLoadTimeMs)} Result data load time      : ${String(gs.resultLoadTimeMs).padStart(6)}ms  (until All Shipments data visible)`.padEnd(101) + '║');
    w(`║    API calls fired           : ${String(gs.apiCalls.length).padStart(6)}`.padEnd(101) + '║');
    w(`║    Slowest API               : ${String(gs.slowestApiMs).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    Navigated URL             : ${gs.navigatedUrl.substring(0, 68)}`.padEnd(101) + '║');
    if (gs.apiCalls.length > 0) {
      w(`║  ${hr.slice(0, 98)}║`);
      for (const a of gs.apiCalls.slice(0, 15)) {
        const shortUrl = a.url.length > 60 ? '…' + a.url.slice(-59) : a.url;
        const icon = a.status < 400 ? '✅' : '❌';
        w(`║    ${icon} [${a.method.padEnd(4)}] ${String(a.durationMs).padStart(5)}ms | ${a.status} | ${shortUrl}`.padEnd(101) + '║');
      }
      if (gs.apiCalls.length > 15)
        w(`║    … and ${gs.apiCalls.length - 15} more API calls`.padEnd(101) + '║');
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

function printReport(r: HomePagePerfReport) {
  const text = buildTextReport(r);
  console.log(text);
}

// ═════════════════════════════════════════════════════════════════════════════
//  TEST
// ═════════════════════════════════════════════════════════════════════════════

test.describe('🏠 Home Page Comprehensive Timing Performance', () => {

  test.setTimeout(300_000); // 5 minutes — login + KPIs + map + 4 tabs + search

  test('HP-01: Full home page timing profiling', async ({ page, context, browserName }) => {

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
    console.log('  🏠 HOME PAGE COMPREHENSIVE TIMING PERFORMANCE TEST');
    console.log('═'.repeat(100));
    console.log('\n  ⏳ Step 1/5 — Logging in …');

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
    const pageLoadMs = Date.now() - pageLoadStart;
    const pageLoadApiCalls = toApiRecords(pageLoadTracker.getRequests());
    allApiCalls.push(...pageLoadApiCalls);

    console.log(`  ✅ Home page loaded in ${pageLoadMs}ms  (${pageLoadApiCalls.length} API calls)`);

    // Memory — baseline
    const memBaseline = await getMemoryMetrics(page);
    if (memBaseline) {
      memorySnapshots.push({ stage: 'After Home Page Load', usedMB: memBaseline.usedJSHeapSizeMB, totalMB: memBaseline.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 2 — KPI CARDS: Not Started / Arrived / In Transit
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 2/5 — Measuring KPI card render times …');

    const kpiResults: KpiResult[] = [];
    const kpiMeasureStart = Date.now();

    for (const kpiName of KPI_NAMES) {
      const kpiStart = Date.now();
      let dataValue = 'N/A';

      try {
        // Wait for the KPI label to be visible
        const kpiLabel = page.getByText(kpiName).first();
        await expect(kpiLabel).toBeVisible({ timeout: 30_000 });
        const kpiRenderTime = Date.now() - kpiMeasureStart; // from page settle

        // Try to extract the numeric value displayed above/near the KPI label
        // KPI cards typically have a large number + label below; look for the nearest numeric value
        try {
          const kpiCard = kpiLabel.locator('..').first(); // parent container
          const parentText = await kpiCard.textContent({ timeout: 5_000 });
          // Extract numeric value from the card text
          const numericMatch = parentText?.match(/[\d,]+/);
          if (numericMatch) {
            dataValue = numericMatch[0];
          }
        } catch {
          // If parent traversal fails, try broader approach
          try {
            const grandParent = kpiLabel.locator('../..').first();
            const gpText = await grandParent.textContent({ timeout: 5_000 });
            const numMatch = gpText?.match(/[\d,]+/);
            if (numMatch) dataValue = numMatch[0];
          } catch { /* leave as N/A */ }
        }

        kpiResults.push({
          name: kpiName,
          renderTimeMs: kpiRenderTime,
          dataValue,
          apiCalls: [], // captured as part of page load
        });

        console.log(`    ${ratingIcon(kpiRenderTime, 3000, 8000)} ${kpiName.padEnd(25)} rendered in ${kpiRenderTime}ms  value=${dataValue}`);
      } catch (err) {
        kpiResults.push({ name: kpiName, renderTimeMs: Date.now() - kpiMeasureStart, dataValue: 'TIMEOUT', apiCalls: [] });
        console.log(`    ❌ ${kpiName}: ${(err as Error).message}`);
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 3 — MAP TOGGLE: Origin → Destination
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 3/5 — Clicking map Destination toggle …');

    let mapToggleResult: MapToggleResult | null = null;

    try {
      // Scroll up to make sure map is visible
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await page.waitForTimeout(500);

      // Find the "Destination" toggle/button — it's a toggle so look for text or role
      const destinationToggle = page.getByText('Destination', { exact: true }).first();
      await expect(destinationToggle).toBeVisible({ timeout: 10_000 });

      const mapTracker = createNetworkTracker(page);
      mapTracker.start();
      const mapToggleStart = Date.now();

      await destinationToggle.click();

      // Wait for the API call(s) triggered by toggle switch
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
      const slowest = slowestApi(mapApiCalls);

      mapToggleResult = {
        toggleName: 'Destination',
        switchTimeMs,
        networkIdleTimeMs,
        apiCalls: mapApiCalls,
        slowestApiMs: slowest.durationMs,
        slowestApiUrl: slowest.url,
      };

      console.log(`    ${ratingIcon(switchTimeMs)} Map toggle to Destination: ${switchTimeMs}ms  apis=${mapApiCalls.length}  slowest=${slowest.durationMs}ms`);
    } catch (err) {
      console.log(`    ❌ Map toggle failed: ${(err as Error).message}`);
    }

    // Memory after map toggle
    const memAfterMap = await getMemoryMetrics(page);
    if (memAfterMap) {
      memorySnapshots.push({ stage: 'After Map Toggle', usedMB: memAfterMap.usedJSHeapSizeMB, totalMB: memAfterMap.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 4 — MODE OF TRANSPORT TABS: Ocean, Air, Rail, Road
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 4/5 — Clicking Mode of Transport tabs …');

    const transportTabResults: TransportTabResult[] = [];

    // Scroll down to the Mode of Transport section
    try {
      const motSection = page.getByText(/Mode of [Tt]ransport/i).first();
      await motSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    } catch {
      // Try generic scroll to midpage where tabs usually are
      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight * 0.4, behavior: 'smooth' }));
      await page.waitForTimeout(500);
    }

    for (const tabName of TRANSPORT_TABS) {
      console.log(`\n    ── ${tabName} ──`);

      try {
        // Find the tab — try role="tab" first, then text match
        let tabElement = page.getByRole('tab', { name: new RegExp(`^${tabName}$`, 'i') }).first();
        let tabVisible = await tabElement.isVisible().catch(() => false);

        if (!tabVisible) {
          // Fallback: try clicking by text within the mode-of-transport section
          tabElement = page.getByText(tabName, { exact: true }).first();
          tabVisible = await tabElement.isVisible().catch(() => false);
        }

        if (!tabVisible) {
          // Broader fallback
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

        // Wait for API response after tab click and measure API response time
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
              renderTimeMs = Date.now() - tabClickStart; // time since tab click
            }
          } catch {
            // widget not visible
          }

          widgetTimings.push({ widgetName, renderTimeMs, visible });
        }

        // Total data display time = time until all visible widgets are rendered
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

        // Console output — clearly separated timings
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

    // Memory after transport tabs
    const memAfterTabs = await getMemoryMetrics(page);
    if (memAfterTabs) {
      memorySnapshots.push({ stage: 'After Transport Tabs', usedMB: memAfterTabs.usedJSHeapSizeMB, totalMB: memAfterTabs.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 5 — GLOBAL SEARCH: type "us100" + Enter → navigate
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 5/5 — Global Search "us100" …');

    let globalSearchResult: GlobalSearchResult | null = null;

    try {
      // Scroll back to top for the search bar
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await page.waitForTimeout(500);

      // Find the Global Search text input — exclude checkboxes/toggles
      const searchInput = page.locator(
        'input[type="text"][placeholder*="Global Search"], ' +
        'input[type="text"][placeholder*="global search"], ' +
        'input[type="search"][placeholder*="Search"], ' +
        'input[type="text"][placeholder*="Search"], ' +
        'input[type="text"][aria-label*="Global Search"], ' +
        'input[type="text"][aria-label*="Search"], ' +
        'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])[placeholder*="Global Search"], ' +
        'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])[placeholder*="Search"]'
      ).first();

      await expect(searchInput).toBeVisible({ timeout: 10_000 });

      const searchTracker = createNetworkTracker(page);
      searchTracker.start();
      const searchStart = Date.now();

      // Click, clear, and type the search term
      await searchInput.click();
      await searchInput.fill('');
      await searchInput.fill('us100');

      // Press Enter to trigger search — fires 2 API calls (global-search + column-setting)
      const urlBefore = page.url();
      await searchInput.press('Enter');

      // Wait for navigation — search navigates to tracking-list page
      const navigationStart = Date.now();
      try {
        await page.waitForURL(url => url.toString() !== urlBefore, { timeout: 30_000 });
      } catch {
        // URL might not change if it's client-side rendering
      }
      const navigationTimeMs = Date.now() - navigationStart;
      console.log(`      📡 Navigation to result page: ${navigationTimeMs}ms`);
      console.log(`      🔗 URL: ${page.url()}`);

      // Wait for "All Shipments" tab to be visible on the result page
      const resultLoadStart = Date.now();
      try {
        const allShipmentsTab = page.getByRole('tab', { name: /All Shipments/i }).first();
        await expect(allShipmentsTab).toBeVisible({ timeout: 30_000 });
        console.log(`      ✅ "All Shipments" tab visible: ${Date.now() - resultLoadStart}ms`);
      } catch {
        // Tab might have different selector — try text match
        try {
          await expect(page.getByText('All Shipments').first()).toBeVisible({ timeout: 10_000 });
        } catch { /* proceed anyway */ }
      }

      // Wait for result data to fully load — the 3rd API fires on the result page
      // Wait for table rows or data grid to appear in the result page
      try {
        await page.waitForResponse(
          resp => (resp.request().resourceType() === 'xhr' || resp.request().resourceType() === 'fetch') && resp.status() < 500,
          { timeout: 25_000 },
        );
      } catch { /* might already be done */ }

      // Wait for all network activity to settle (captures all 3 API calls)
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(2000); // extra settle for data grid rendering

      // Check for table rows in the result
      let resultRowCount = 0;
      try {
        resultRowCount = await page.locator('table tbody tr, [role="row"]').count();
      } catch { /* no rows */ }

      const resultLoadTimeMs = Date.now() - resultLoadStart;
      console.log(`      📊 Result data loaded: ${resultLoadTimeMs}ms  (${resultRowCount} rows visible)`);

      const netIdleStart = Date.now();
      const networkIdleMs = 0; // already waited above

      searchTracker.stop();
      const searchTimeMs = Date.now() - searchStart;
      const searchApiCalls = toApiRecords(searchTracker.getRequests());
      allApiCalls.push(...searchApiCalls);
      const searchSlowest = slowestApi(searchApiCalls);

      globalSearchResult = {
        searchTerm: 'us100',
        searchTimeMs,
        navigationTimeMs,
        resultLoadTimeMs,
        networkIdleMs,
        apiCalls: searchApiCalls,
        slowestApiMs: searchSlowest.durationMs,
        slowestApiUrl: searchSlowest.url,
        navigatedUrl: page.url(),
      };

      // Detailed console output for all API calls
      console.log(`\n      ── API Calls (${searchApiCalls.length} total) ──`);
      for (const a of searchApiCalls) {
        const shortUrl = a.url.split('?')[0];
        const displayUrl = shortUrl.length > 55 ? '…' + shortUrl.slice(-54) : shortUrl;
        console.log(`         ${a.status < 400 ? '✅' : '❌'} [${a.method}] ${a.durationMs}ms | ${a.status} | ${displayUrl}`);
      }

      console.log(
        `\n    ${ratingIcon(searchTimeMs)} Search "us100" TOTAL: ${searchTimeMs}ms  ` +
        `(nav=${navigationTimeMs}ms  resultLoad=${resultLoadTimeMs}ms  apis=${searchApiCalls.length}  slowest=${searchSlowest.durationMs}ms)`
      );
    } catch (err) {
      console.log(`    ❌ Global Search failed: ${(err as Error).message}`);
    }

    // Memory — final snapshot
    const memFinal = await getMemoryMetrics(page);
    if (memFinal) {
      memorySnapshots.push({ stage: 'Final (After Search)', usedMB: memFinal.usedJSHeapSizeMB, totalMB: memFinal.totalJSHeapSizeMB });
    }

    // Stop console tracker
    consoleTracker.stop();
    const consoleErrors = consoleTracker.getErrors().map(e => e.text);

    // ══════════════════════════════════════════════════════════════════════════
    //  BUILD & PERSIST REPORT
    // ══════════════════════════════════════════════════════════════════════════

    const testDuration = Date.now() - testStart;

    const report: HomePagePerfReport = {
      testName: 'Home Page Comprehensive Timing',
      timestamp: new Date().toISOString(),
      durationMs: testDuration,
      browser: browserName,
      pageLoadMs,
      pageLoadApiCalls,
      kpiResults,
      mapToggle: mapToggleResult,
      transportTabs: transportTabResults,
      globalSearch: globalSearchResult,
      apiSummary: buildApiSummary(allApiCalls),
      memorySnapshots,
      consoleErrors,
    };

    // Pretty-print to console
    printReport(report);

    // Persist to disk
    saveReport(report);

    // ══════════════════════════════════════════════════════════════════════════
    //  ASSERTIONS — soft checks (test won't fail but will flag issues)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ── ASSERTIONS ──');

    // Page load under 60s
    expect(pageLoadMs, `Home page should load within 60s`).toBeLessThan(60_000);
    console.log(`  ✅ Page load (${pageLoadMs}ms) under 60s threshold`);

    // KPIs should all render within 30s
    for (const kpi of kpiResults) {
      expect(kpi.renderTimeMs, `${kpi.name} should render within 30s`).toBeLessThan(30_000);
    }
    console.log(`  ✅ All ${kpiResults.length} KPI cards rendered within threshold`);

    // No excessive console errors
    if (consoleErrors.length > 20) {
      console.log(`  ⚠️  High console error count: ${consoleErrors.length}`);
    } else {
      console.log(`  ✅ Console errors within acceptable range: ${consoleErrors.length}`);
    }

    console.log(`\n  🏁 Test completed in ${(testDuration / 1000).toFixed(1)}s\n`);
  });
});
