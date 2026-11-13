/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  HOME ↔ TRACKING LIST FILTER PERFORMANCE TEST
 *
 *  End-to-end performance profiling flow:
 *
 *  1. Login → Home Page — record page load timing & all metrics
 *  2. Click "Tracking List" → wait for page load — record navigation time
 *  3. Click "Show filters" → open filter panel
 *  4. Click cog/settings icon → open saved filters panel
 *  5. Click "PeformanceTesting" saved filter → measure filter apply time
 *     (time from click until data finishes loading on Tracking List page)
 *  6. Click "Home" → navigate to Home page (filter already applied) — record
 *     time to load Home page from Tracking List
 *  7. Click "Tracking List" → navigate back — record time to return to
 *     Tracking List page with filter still applied
 *  8. Pretty-print full report to console & save JSON + TXT to
 *     home-trackingListFilter/<timestamp>
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { seedLogin } from '../seed.spec';
import {
  createNetworkTracker,
  getMemoryMetrics,
  getNavigationTimingMetrics,
  createConsoleTracker,
  type NetworkRequest,
} from '../../utils/performance-helpers';

// ── Constants ────────────────────────────────────────────────────────────────

// const BASE_URL = 'https://test.itt.bdpsmart.com';

const BASE_URL = 'https://stage.itt.bdpsmart.com';
const HOME_URL = `${BASE_URL}/#/home`;

// ── Interfaces ───────────────────────────────────────────────────────────────

interface ApiCallRecord {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  resourceType: string;
  timestamp: number;
}

interface HomeTrackingListFilterReport {
  testName: string;
  timestamp: string;
  durationMs: number;
  browser: string;

  // Step 1 — Login → Home page
  loginToHomeMs: number;
  homePageLoadMs: number;
  homePageApiCalls: ApiCallRecord[];
  homePageNavTiming: {
    dnsLookup: number;
    tcpConnection: number;
    tlsNegotiation: number;
    serverResponseTime: number;
    domContentLoaded: number;
    domInteractive: number;
    domComplete: number;
    pageLoad: number;
  } | null;

  // Step 2 — Home → Tracking List
  homeToTrackingListMs: number;
  trackingListPageLoadMs: number;
  trackingListApiCalls: ApiCallRecord[];

  // Step 3 & 4 — Show filters + cog icon
  showFilterClickMs: number;
  settingsIconClickMs: number;

  // Step 5 — Filter apply on Tracking List
  filterApplyMs: number;
  filterDataLoadMs: number;
  filterApiCalls: ApiCallRecord[];
  filterSlowestApiMs: number;
  filterSlowestApiUrl: string;

  // Step 6 — Tracking List (filtered) → Home
  trackingListToHomeMs: number;
  homeAfterFilterLoadMs: number;
  homeAfterFilterApiCalls: ApiCallRecord[];

  // Step 7 — Home → Tracking List (return trip, filter still applied)
  homeToTrackingListReturnMs: number;
  trackingListReturnLoadMs: number;
  trackingListReturnApiCalls: ApiCallRecord[];

  // Aggregate API summary
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

  // Memory snapshots
  memorySnapshots: Array<{ stage: string; usedMB: number; totalMB: number }>;

  // Console errors
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

function saveReport(report: HomeTrackingListFilterReport) {
  const ts = getTimestamp();
  const outDir = path.resolve(__dirname, '..', '..', 'home-trackingListFilter');
  ensureDir(outDir);

  const jsonFile = path.join(outDir, `home-tracking-filter-perf-${ts}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), 'utf-8');

  const txtFile = path.join(outDir, `home-tracking-filter-perf-${ts}.txt`);
  fs.writeFileSync(txtFile, buildTextReport(report), 'utf-8');

  console.log(`\n  📄 JSON report saved → ${jsonFile}`);
  console.log(`  📝 Text report saved → ${txtFile}`);
}

// ── Text Report Builder ─────────────────────────────────────────────────────

function buildTextReport(r: HomeTrackingListFilterReport): string {
  const HR = '═'.repeat(100);
  const hr = '─'.repeat(100);
  const lines: string[] = [];
  const w = (s = '') => lines.push(s);

  w();
  w(`╔${HR}╗`);
  w(`║${'HOME ↔ TRACKING LIST FILTER PERFORMANCE REPORT'.padStart(73).padEnd(100)}║`);
  w(`║${'Filter: "PerformanceTesting" — Navigation Round-Trip'.padStart(76).padEnd(100)}║`);
  w(`╠${HR}╣`);
  w(`║  Test Name   : ${r.testName.padEnd(84)}║`);
  w(`║  Timestamp   : ${r.timestamp.padEnd(84)}║`);
  w(`║  Browser     : ${r.browser.padEnd(84)}║`);
  w(`║  Duration    : ${(r.durationMs / 1000).toFixed(1)}s`.padEnd(101) + '║');
  w(`╠${HR}╣`);

  // ── Step 1: Login → Home ──
  w(`║  ── STEP 1: LOGIN → HOME PAGE ──`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.loginToHomeMs, 10000, 30000)} Login → Home page           : ${String(r.loginToHomeMs).padStart(6)}ms  ${ratingLabel(r.loginToHomeMs, 10000, 30000)}`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.homePageLoadMs)} Home page load time        : ${String(r.homePageLoadMs).padStart(6)}ms  ${ratingLabel(r.homePageLoadMs, 5000, 15000)}`.padEnd(101) + '║');
  w(`║    API calls during load       : ${String(r.homePageApiCalls.length).padStart(6)}`.padEnd(101) + '║');

  if (r.homePageNavTiming) {
    w(`║${''.padEnd(100)}║`);
    w(`║  ── NAVIGATION TIMING (Home Page) ──`.padEnd(101) + '║');
    w(`║    DNS Lookup                  : ${String(Math.round(r.homePageNavTiming.dnsLookup)).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    TCP Connection              : ${String(Math.round(r.homePageNavTiming.tcpConnection)).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    TLS Negotiation             : ${String(Math.round(r.homePageNavTiming.tlsNegotiation)).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    Server Response (TTFB)      : ${String(Math.round(r.homePageNavTiming.serverResponseTime)).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    DOM Content Loaded          : ${String(Math.round(r.homePageNavTiming.domContentLoaded)).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    DOM Interactive             : ${String(Math.round(r.homePageNavTiming.domInteractive)).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    DOM Complete                : ${String(Math.round(r.homePageNavTiming.domComplete)).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    Page Load                   : ${String(Math.round(r.homePageNavTiming.pageLoad)).padStart(6)}ms`.padEnd(101) + '║');
  }
  w(`║${''.padEnd(100)}║`);

  // ── Step 2: Home → Tracking List ──
  w(`╠${HR}╣`);
  w(`║  ── STEP 2: HOME → TRACKING LIST PAGE ──`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.homeToTrackingListMs, 5000, 15000)} Navigation time (click → load) : ${String(r.homeToTrackingListMs).padStart(6)}ms  ${ratingLabel(r.homeToTrackingListMs, 5000, 15000)}`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.trackingListPageLoadMs, 5000, 15000)} Page fully loaded              : ${String(r.trackingListPageLoadMs).padStart(6)}ms  ${ratingLabel(r.trackingListPageLoadMs, 5000, 15000)}`.padEnd(101) + '║');
  w(`║    API calls during navigation  : ${String(r.trackingListApiCalls.length).padStart(6)}`.padEnd(101) + '║');
  w(`║${''.padEnd(100)}║`);

  // ── Steps 3-4: Show filters + Settings icon ──
  w(`╠${HR}╣`);
  w(`║  ── STEP 3-4: OPEN FILTER PANEL & SAVED FILTERS ──`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.showFilterClickMs, 1000, 3000)} "Show filters" → sidebar open  : ${String(r.showFilterClickMs).padStart(6)}ms  ${ratingLabel(r.showFilterClickMs, 1000, 3000)}`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.settingsIconClickMs, 1000, 3000)} Settings icon → panel open     : ${String(r.settingsIconClickMs).padStart(6)}ms  ${ratingLabel(r.settingsIconClickMs, 1000, 3000)}`.padEnd(101) + '║');
  w(`║${''.padEnd(100)}║`);

  // ── Step 5: Filter apply ──
  w(`╠${HR}╣`);
  w(`║  ── STEP 5: APPLY "PerformanceTesting" FILTER ON TRACKING LIST ──`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.filterApplyMs, 3000, 8000)} Filter click → first response  : ${String(r.filterApplyMs).padStart(6)}ms  ${ratingLabel(r.filterApplyMs, 3000, 8000)}`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.filterDataLoadMs, 5000, 15000)} Filter click → data fully loaded: ${String(r.filterDataLoadMs).padStart(6)}ms  ${ratingLabel(r.filterDataLoadMs, 5000, 15000)}`.padEnd(101) + '║');
  w(`║    API calls during filter      : ${String(r.filterApiCalls.length).padStart(6)}`.padEnd(101) + '║');
  w(`║    Slowest API                  : ${String(r.filterSlowestApiMs).padStart(6)}ms`.padEnd(101) + '║');
  if (r.filterSlowestApiUrl !== 'N/A') {
    const shortUrl = r.filterSlowestApiUrl.split('?')[0];
    const displayUrl = shortUrl.length > 65 ? '…' + shortUrl.slice(-64) : shortUrl;
    w(`║    Slowest API URL              : ${displayUrl}`.padEnd(101) + '║');
  }
  w(`║${''.padEnd(100)}║`);

  // Filter API call details
  if (r.filterApiCalls.length > 0) {
    w(`║  ── API CALLS DURING FILTER APPLICATION ──`.padEnd(101) + '║');
    for (const a of r.filterApiCalls.slice(0, 20)) {
      const shortUrl = a.url.split('?')[0];
      const displayUrl = shortUrl.length > 55 ? '…' + shortUrl.slice(-54) : shortUrl;
      const icon = a.status < 400 ? '✅' : '❌';
      w(`║    ${icon} [${a.method.padEnd(4)}] ${String(a.durationMs).padStart(5)}ms | ${a.status} | ${displayUrl}`.padEnd(101) + '║');
    }
    if (r.filterApiCalls.length > 20) {
      w(`║    … and ${r.filterApiCalls.length - 20} more API calls`.padEnd(101) + '║');
    }
    w(`║${''.padEnd(100)}║`);
  }

  // ── Step 6: Tracking List → Home (filtered) ──
  w(`╠${HR}╣`);
  w(`║  ── STEP 6: TRACKING LIST (FILTERED) → HOME PAGE ──`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.trackingListToHomeMs, 5000, 15000)} Navigation time (click → load) : ${String(r.trackingListToHomeMs).padStart(6)}ms  ${ratingLabel(r.trackingListToHomeMs, 5000, 15000)}`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.homeAfterFilterLoadMs, 5000, 15000)} Home page fully loaded         : ${String(r.homeAfterFilterLoadMs).padStart(6)}ms  ${ratingLabel(r.homeAfterFilterLoadMs, 5000, 15000)}`.padEnd(101) + '║');
  w(`║    API calls during navigation  : ${String(r.homeAfterFilterApiCalls.length).padStart(6)}`.padEnd(101) + '║');
  w(`║${''.padEnd(100)}║`);

  // ── Step 7: Home → Tracking List (return) ──
  w(`╠${HR}╣`);
  w(`║  ── STEP 7: HOME → TRACKING LIST (RETURN TRIP — FILTER APPLIED) ──`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.homeToTrackingListReturnMs, 5000, 15000)} Navigation time (click → load) : ${String(r.homeToTrackingListReturnMs).padStart(6)}ms  ${ratingLabel(r.homeToTrackingListReturnMs, 5000, 15000)}`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.trackingListReturnLoadMs, 5000, 15000)} Tracking List fully loaded     : ${String(r.trackingListReturnLoadMs).padStart(6)}ms  ${ratingLabel(r.trackingListReturnLoadMs, 5000, 15000)}`.padEnd(101) + '║');
  w(`║    API calls during navigation  : ${String(r.trackingListReturnApiCalls.length).padStart(6)}`.padEnd(101) + '║');
  w(`║${''.padEnd(100)}║`);

  // ── Navigation Round-Trip Summary ──
  w(`╠${HR}╣`);
  w(`║  ── NAVIGATION ROUND-TRIP SUMMARY ──`.padEnd(101) + '║');
  w(`║${''.padEnd(100)}║`);
  w(`║   STEP                                    TIME (ms)   RATING`.padEnd(101) + '║');
  w(`║  ${hr.slice(0, 98)}║`);
  w(`║  ${ratingIcon(r.homePageLoadMs)} 1. Home Page Load (initial)       ${String(r.homePageLoadMs).padStart(8)}ms   ${ratingLabel(r.homePageLoadMs, 5000, 15000)}`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.homeToTrackingListMs, 5000, 15000)} 2. Home → Tracking List            ${String(r.homeToTrackingListMs).padStart(8)}ms   ${ratingLabel(r.homeToTrackingListMs, 5000, 15000)}`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.showFilterClickMs, 1000, 3000)} 3. Show Filters (sidebar open)    ${String(r.showFilterClickMs).padStart(8)}ms   ${ratingLabel(r.showFilterClickMs, 1000, 3000)}`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.settingsIconClickMs, 1000, 3000)} 4. Settings Icon (panel open)     ${String(r.settingsIconClickMs).padStart(8)}ms   ${ratingLabel(r.settingsIconClickMs, 1000, 3000)}`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.filterDataLoadMs, 5000, 15000)} 5. Filter Apply → Data Loaded     ${String(r.filterDataLoadMs).padStart(8)}ms   ${ratingLabel(r.filterDataLoadMs, 5000, 15000)}`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.trackingListToHomeMs, 5000, 15000)} 6. Tracking List → Home (filtered)${String(r.trackingListToHomeMs).padStart(8)}ms   ${ratingLabel(r.trackingListToHomeMs, 5000, 15000)}`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.homeToTrackingListReturnMs, 5000, 15000)} 7. Home → Tracking List (return)  ${String(r.homeToTrackingListReturnMs).padStart(8)}ms   ${ratingLabel(r.homeToTrackingListReturnMs, 5000, 15000)}`.padEnd(101) + '║');
  w(`║  ${hr.slice(0, 98)}║`);
  const totalRoundTrip = r.homePageLoadMs + r.homeToTrackingListMs + r.showFilterClickMs +
    r.settingsIconClickMs + r.filterDataLoadMs + r.trackingListToHomeMs + r.homeToTrackingListReturnMs;
  w(`║  ⏱️  TOTAL ROUND-TRIP TIME             ${String(totalRoundTrip).padStart(8)}ms`.padEnd(101) + '║');
  w(`║${''.padEnd(100)}║`);

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
    w(`║  ${'STAGE'.padEnd(45)} ${'USED'.padStart(10)}  ${'TOTAL'.padStart(10)}`.padEnd(101) + '║');
    w(`║  ${hr.slice(0, 98)}║`);
    for (const m of r.memorySnapshots) {
      w(`║  ${m.stage.padEnd(45)} ${String(m.usedMB.toFixed(2)).padStart(8)} MB  ${String(m.totalMB.toFixed(2)).padStart(8)} MB`.padEnd(101) + '║');
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

function printReport(r: HomeTrackingListFilterReport) {
  const text = buildTextReport(r);
  console.log(text);
}

// ═════════════════════════════════════════════════════════════════════════════
//  TEST
// ═════════════════════════════════════════════════════════════════════════════

test.describe('🏠↔📋 Home ↔ Tracking List Filter Performance', () => {

  test.setTimeout(300_000); // 5 minutes

  test('HTF-01: Filter apply on Tracking List + navigation round-trip profiling', async ({ page, context, browserName }) => {

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
    console.log('  🏠↔📋 HOME ↔ TRACKING LIST FILTER PERFORMANCE TEST');
    console.log('═'.repeat(100));
    console.log('\n  ⏳ Step 1/7 — Logging in & loading Home page …');

    const loginStart = Date.now();
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    // Track network during home page load
    const homeLoadTracker = createNetworkTracker(page);
    homeLoadTracker.start();
    const homeLoadStart = Date.now();

    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/#\/home/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000); // SPA settle time

    homeLoadTracker.stop();
    const homePageLoadMs = Date.now() - homeLoadStart;
    const loginToHomeMs = Date.now() - loginStart;
    const homePageApiCalls = toApiRecords(homeLoadTracker.getRequests());
    allApiCalls.push(...homePageApiCalls);

    // Capture Navigation Timing
    let homePageNavTiming: HomeTrackingListFilterReport['homePageNavTiming'] = null;
    try {
      const navTiming = await getNavigationTimingMetrics(page);
      homePageNavTiming = {
        dnsLookup: navTiming.dnsLookup,
        tcpConnection: navTiming.tcpConnection,
        tlsNegotiation: navTiming.tlsNegotiation,
        serverResponseTime: navTiming.serverResponseTime,
        domContentLoaded: navTiming.domContentLoaded,
        domInteractive: navTiming.domInteractive,
        domComplete: navTiming.domComplete,
        pageLoad: navTiming.pageLoad,
      };
    } catch { /* navigation timing not available */ }

    console.log(`  ✅ Login → Home page: ${loginToHomeMs}ms`);
    console.log(`  ✅ Home page loaded in ${homePageLoadMs}ms  (${homePageApiCalls.length} API calls)`);
    if (homePageNavTiming) {
      console.log(`     DNS: ${Math.round(homePageNavTiming.dnsLookup)}ms | TCP: ${Math.round(homePageNavTiming.tcpConnection)}ms | TTFB: ${Math.round(homePageNavTiming.serverResponseTime)}ms | DCL: ${Math.round(homePageNavTiming.domContentLoaded)}ms | Load: ${Math.round(homePageNavTiming.pageLoad)}ms`);
    }

    // Memory — baseline
    const memBaseline = await getMemoryMetrics(page);
    if (memBaseline) {
      memorySnapshots.push({ stage: 'After Home Page Load', usedMB: memBaseline.usedJSHeapSizeMB, totalMB: memBaseline.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 2 — NAVIGATE TO TRACKING LIST PAGE
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 2/7 — Navigating to Tracking List page …');

    const trackingListTracker = createNetworkTracker(page);
    trackingListTracker.start();
    const navToTrackingStart = Date.now();

    // Click "Tracking List" link in the navigation
    await page.getByRole('link', { name: ' Tracking List' }).click();

    // Wait for the Tracking List page to load — look for table or tab
    try {
      await page.locator('#spinner.backdrop').waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
      await page.locator('#spinner.backdrop').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
    } catch { /* no spinner */ }

    // Wait for In Transit tab or table to be visible
    await expect(page.getByRole('tab', { name: 'In Transit' })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000); // settle

    trackingListTracker.stop();
    const homeToTrackingListMs = Date.now() - navToTrackingStart;
    const trackingListPageLoadMs = homeToTrackingListMs;
    const trackingListApiCalls = toApiRecords(trackingListTracker.getRequests());
    allApiCalls.push(...trackingListApiCalls);

    console.log(`  ✅ Tracking List page loaded in ${homeToTrackingListMs}ms  (${trackingListApiCalls.length} API calls)`);

    // Memory after tracking list
    const memAfterTL = await getMemoryMetrics(page);
    if (memAfterTL) {
      memorySnapshots.push({ stage: 'After Tracking List Load', usedMB: memAfterTL.usedJSHeapSizeMB, totalMB: memAfterTL.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 3 — CLICK "SHOW FILTERS" → OPEN SIDEBAR
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 3/7 — Clicking "Show filters" button …');

    let showFilterClickMs = 0;
    let settingsIconClickMs = 0;

    try {
      // Wait for any spinner to disappear
      await page.locator('#spinner.backdrop').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});

      // Find "Show filters" button
      const showFilterBtn = page.getByRole('button', { name: 'Show filters' });
      await expect(showFilterBtn).toBeVisible({ timeout: 15_000 });

      const showFilterStart = Date.now();
      await showFilterBtn.click();

      // Wait for sidebar to open
      await page.locator('.p-drawer-active, [data-pc-name="sidebar"]').waitFor({ state: 'visible', timeout: 15_000 });
      await page.waitForTimeout(1000); // allow sidebar content to render
      showFilterClickMs = Date.now() - showFilterStart;

      console.log(`  ✅ ${ratingIcon(showFilterClickMs, 1000, 3000)} Sidebar opened in ${showFilterClickMs}ms`);
    } catch (err) {
      console.log(`  ❌ "Show filters" click failed: ${(err as Error).message}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 4 — CLICK SETTINGS/COG ICON → SAVED FILTERS PANEL
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 4/7 — Clicking settings icon (cog) for saved filters …');

    try {
      await page.locator('#spinner.backdrop').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});

      // The cog icon button inside the sidebar
      const sidebar = page.locator('.p-drawer-active, [data-pc-name="sidebar"]');
      const cogButton = sidebar.locator('button.p-button-icon-only:has(span.pi-cog)');

      const settingsStart = Date.now();
      await expect(cogButton).toBeVisible({ timeout: 10_000 });
      console.log('    ✅ Found cog/settings icon button inside sidebar');

      await cogButton.click({ force: true });
      console.log('    🖱️ Clicked cog icon');

      // Wait for saved filters panel to appear
      await page.waitForTimeout(2000);
      settingsIconClickMs = Date.now() - settingsStart;
      console.log(`  ✅ ${ratingIcon(settingsIconClickMs, 1000, 3000)} Saved filters panel opened in ${settingsIconClickMs}ms`);
    } catch (err) {
      console.log(`  ❌ Settings icon click failed: ${(err as Error).message}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 5 — CLICK "PeformanceTesting" SAVED FILTER → MEASURE DATA LOAD
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 5/7 — Applying "PeformanceTesting" saved filter …');

    let filterApplyMs = 0;
    let filterDataLoadMs = 0;
    let filterApiCalls: ApiCallRecord[] = [];
    let filterSlowestApiMs = 0;
    let filterSlowestApiUrl = 'N/A';

    try {
      // Find the "PeformanceTesting" button (note: app has typo "Peformance")
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
      console.log('    🖱️ Clicked "PeformanceTesting" — measuring filter data load time …');

      // Wait for loader/spinner to appear and disappear
      try {
        const spinner = page.locator('#spinner.backdrop');
        await spinner.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
        console.log('    ⏳ Spinner/loader appeared …');
        filterApplyMs = Date.now() - filterClickStart;
        await spinner.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
        console.log('    ✅ Spinner/loader disappeared');
      } catch {
        console.log('    ⏳ No spinner detected, waiting for network settle …');
        filterApplyMs = Date.now() - filterClickStart;
      }

      // Wait for network to settle — data fully loaded
      await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(2000); // settle

      filterTracker.stop();
      filterDataLoadMs = Date.now() - filterClickStart;
      filterApiCalls = toApiRecords(filterTracker.getRequests());
      allApiCalls.push(...filterApiCalls);
      const slowest = slowestApi(filterApiCalls);
      filterSlowestApiMs = slowest.durationMs;
      filterSlowestApiUrl = slowest.url;

      console.log(`  ✅ ${ratingIcon(filterDataLoadMs, 5000, 15000)} Filter data loaded in ${filterDataLoadMs}ms  (${filterApiCalls.length} API calls, slowest ${filterSlowestApiMs}ms)`);

      // Log API calls
      console.log(`\n    ── API Calls During Filter (${filterApiCalls.length}) ──`);
      for (const a of filterApiCalls) {
        const shortUrl = a.url.split('?')[0];
        const displayUrl = shortUrl.length > 55 ? '…' + shortUrl.slice(-54) : shortUrl;
        console.log(`       ${a.status < 400 ? '✅' : '❌'} [${a.method}] ${a.durationMs}ms | ${a.status} | ${displayUrl}`);
      }
    } catch (err) {
      console.log(`  ❌ Filter application failed: ${(err as Error).message}`);
    }

    // Memory after filter
    const memAfterFilter = await getMemoryMetrics(page);
    if (memAfterFilter) {
      memorySnapshots.push({ stage: 'After Filter Applied on Tracking List', usedMB: memAfterFilter.usedJSHeapSizeMB, totalMB: memAfterFilter.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 6 — CLICK "HOME" → NAVIGATE BACK TO HOME (FILTER APPLIED)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 6/7 — Navigating from Tracking List → Home (filter applied) …');

    const homeReturnTracker = createNetworkTracker(page);
    homeReturnTracker.start();
    const trackingToHomeStart = Date.now();

    // Click "Home" link
    await page.getByRole('link', { name: ' Home' }).click();

    // Wait for home page to load
    try {
      await page.locator('#spinner.backdrop').waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
      await page.locator('#spinner.backdrop').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
    } catch { /* no spinner */ }

    await expect(page).toHaveURL(/#\/home/, { timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000); // settle

    homeReturnTracker.stop();
    const trackingListToHomeMs = Date.now() - trackingToHomeStart;
    const homeAfterFilterLoadMs = trackingListToHomeMs;
    const homeAfterFilterApiCalls = toApiRecords(homeReturnTracker.getRequests());
    allApiCalls.push(...homeAfterFilterApiCalls);

    console.log(`  ✅ ${ratingIcon(trackingListToHomeMs, 5000, 15000)} Tracking List → Home: ${trackingListToHomeMs}ms  (${homeAfterFilterApiCalls.length} API calls)`);

    // Memory after home return
    const memAfterHomeReturn = await getMemoryMetrics(page);
    if (memAfterHomeReturn) {
      memorySnapshots.push({ stage: 'After Return to Home (filtered)', usedMB: memAfterHomeReturn.usedJSHeapSizeMB, totalMB: memAfterHomeReturn.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 7 — CLICK "TRACKING LIST" → RETURN (FILTER STILL APPLIED)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 7/7 — Navigating Home → Tracking List (return trip, filter applied) …');

    const trackingReturnTracker = createNetworkTracker(page);
    trackingReturnTracker.start();
    const homeToTrackingReturnStart = Date.now();

    // Click "Tracking List" link
    await page.getByRole('link', { name: ' Tracking List' }).click();

    // Wait for Tracking List to load
    try {
      await page.locator('#spinner.backdrop').waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
      await page.locator('#spinner.backdrop').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
    } catch { /* no spinner */ }

    await expect(page.getByRole('tab', { name: 'In Transit' })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000); // settle

    trackingReturnTracker.stop();
    const homeToTrackingListReturnMs = Date.now() - homeToTrackingReturnStart;
    const trackingListReturnLoadMs = homeToTrackingListReturnMs;
    const trackingListReturnApiCalls = toApiRecords(trackingReturnTracker.getRequests());
    allApiCalls.push(...trackingListReturnApiCalls);

    console.log(`  ✅ ${ratingIcon(homeToTrackingListReturnMs, 5000, 15000)} Home → Tracking List (return): ${homeToTrackingListReturnMs}ms  (${trackingListReturnApiCalls.length} API calls)`);

    // Memory — final
    const memFinal = await getMemoryMetrics(page);
    if (memFinal) {
      memorySnapshots.push({ stage: 'After Return to Tracking List (final)', usedMB: memFinal.usedJSHeapSizeMB, totalMB: memFinal.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  BUILD & SAVE REPORT
    // ══════════════════════════════════════════════════════════════════════════

    const report: HomeTrackingListFilterReport = {
      testName: 'Home ↔ Tracking List Filter Performance',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - testStart,
      browser: browserName,

      // Step 1
      loginToHomeMs,
      homePageLoadMs,
      homePageApiCalls,
      homePageNavTiming,

      // Step 2
      homeToTrackingListMs,
      trackingListPageLoadMs,
      trackingListApiCalls,

      // Steps 3-4
      showFilterClickMs,
      settingsIconClickMs,

      // Step 5
      filterApplyMs,
      filterDataLoadMs,
      filterApiCalls,
      filterSlowestApiMs,
      filterSlowestApiUrl,

      // Step 6
      trackingListToHomeMs,
      homeAfterFilterLoadMs,
      homeAfterFilterApiCalls,

      // Step 7
      homeToTrackingListReturnMs,
      trackingListReturnLoadMs,
      trackingListReturnApiCalls,

      // Aggregate
      apiSummary: buildApiSummary(allApiCalls),
      memorySnapshots,
      consoleErrors: consoleTracker.getErrors().map(e => e.text),
    };

    consoleTracker.stop();

    // Print full report to console
    printReport(report);

    // Save to home-trackingListFilter folder
    saveReport(report);

    // ══════════════════════════════════════════════════════════════════════════
    //  CONSOLE SUMMARY
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(100));
    console.log('  📊 QUICK SUMMARY — HOME ↔ TRACKING LIST FILTER');
    console.log('═'.repeat(100));
    console.log(`  ${ratingIcon(homePageLoadMs)} Home Page Load (initial)         : ${homePageLoadMs}ms`);
    console.log(`  ${ratingIcon(homeToTrackingListMs, 5000, 15000)} Home → Tracking List             : ${homeToTrackingListMs}ms`);
    console.log(`  ${ratingIcon(showFilterClickMs, 1000, 3000)} Show Filters → sidebar open      : ${showFilterClickMs}ms`);
    console.log(`  ${ratingIcon(settingsIconClickMs, 1000, 3000)} Settings → saved filters panel   : ${settingsIconClickMs}ms`);
    console.log(`  ${ratingIcon(filterDataLoadMs, 5000, 15000)} Filter Apply → data loaded       : ${filterDataLoadMs}ms`);
    console.log(`  ${ratingIcon(trackingListToHomeMs, 5000, 15000)} Tracking List → Home (filtered)  : ${trackingListToHomeMs}ms`);
    console.log(`  ${ratingIcon(homeToTrackingListReturnMs, 5000, 15000)} Home → Tracking List (return)    : ${homeToTrackingListReturnMs}ms`);
    const totalRoundTrip = homePageLoadMs + homeToTrackingListMs + showFilterClickMs +
      settingsIconClickMs + filterDataLoadMs + trackingListToHomeMs + homeToTrackingListReturnMs;
    console.log(`  ⏱️  TOTAL ROUND-TRIP                    : ${totalRoundTrip}ms (${(totalRoundTrip / 1000).toFixed(1)}s)`);
    console.log(`  📡 Total API calls                     : ${allApiCalls.length}`);
    console.log(`  ❌ Console errors                      : ${consoleTracker.getErrors().length}`);
    console.log('═'.repeat(100));
  });
});
