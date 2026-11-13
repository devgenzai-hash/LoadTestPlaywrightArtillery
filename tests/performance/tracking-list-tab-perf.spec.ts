/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TRACKING LIST TAB PERFORMANCE TEST
 *
 *  End-to-end performance profiling of the Tracking List feature:
 *
 *  1. Login → Navigate to Tracking List (record navigation time)
 *  2. Capture every API call + response time during initial load
 *  3. Visit each tab (All Shipments, Not Started, In Transit, Arrived,
 *     Document Only, Live Track Pending, Inactive Shipments) — record API calls & load times
 *  4. REVISIT every tab to capture warm-cache / repeat-visit timings
 *  5. Search "us100" in All Shipments — record search timing & API calls
 *  6. Click a Shipment Number → navigate to Shipment Details page — record timing & API calls
 *  7. Pretty-print a full comparison report to the console
 *  8. Persist JSON + TXT reports into  trackingListperf/<timestamp>
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

/** Tabs in the Tracking List page — order matters (left-to-right in the UI) */
const TRACKING_TABS = [
  'All Shipments',
  'Not Started',
  'In Transit',
  'Arrived',
  'Document Only',
  'Live Track Pending',
  'Inactive Shipments',
] as const;

type TabName = (typeof TRACKING_TABS)[number];

// ── Interfaces ───────────────────────────────────────────────────────────────

interface ApiCallRecord {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  resourceType: string;
  timestamp: number;
}

interface TabResult {
  tabName: string;
  visit: 'first' | 'revisit';
  switchTimeMs: number;
  dataLoadTimeMs: number;
  networkIdleTimeMs: number;
  rowCount: number;
  apiCalls: ApiCallRecord[];
  totalApiTimeMs: number;
  slowestApiMs: number;
  slowestApiUrl: string;
}

interface TrackingListPerfReport {
  testName: string;
  timestamp: string;
  durationMs: number;
  browser: string;

  /** Time from clicking "Tracking List" to network idle */
  navigationToTrackingListMs: number;
  navigationApiCalls: ApiCallRecord[];

  /** Per-tab results — first visit */
  firstVisit: TabResult[];

  /** Per-tab results — revisit (warm cache) */
  revisit: TabResult[];

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
    slowCalls: number; // >1 s
  };

  /** Cache effectiveness per tab */
  cacheComparison: Array<{
    tabName: string;
    firstVisitMs: number;
    revisitMs: number;
    improvementPct: number;
  }>;

  /** Search profiling — typing "us100" in All Shipments */
  searchProfiling?: {
    searchTerm: string;
    searchTimeMs: number;
    networkIdleMs: number;
    resultRowCount: number;
    apiCalls: ApiCallRecord[];
    slowestApiMs: number;
    slowestApiUrl: string;
  };

  /** Shipment detail navigation — clicking a shipment number */
  shipmentDetailProfiling?: {
    shipmentNumber: string;
    navigationTimeMs: number;
    networkIdleMs: number;
    apiCalls: ApiCallRecord[];
    totalApiTimeMs: number;
    slowestApiMs: number;
    slowestApiUrl: string;
    pageUrl: string;
  };

  /** Memory snapshots */
  memorySnapshots: Array<{ stage: string; usedMB: number; totalMB: number }>;

  /** Console errors captured */
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

// ── Output helpers ───────────────────────────────────────────────────────────

function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function saveReport(report: TrackingListPerfReport) {
  const ts = getTimestamp();
  const outDir = path.resolve(__dirname, '..', '..', 'trackingListperf');
  ensureDir(outDir);

  // ── JSON ──
  const jsonFile = path.join(outDir, `tracking-list-perf-${ts}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), 'utf-8');

  // ── Human-readable TXT ──
  const txtFile = path.join(outDir, `tracking-list-perf-${ts}.txt`);
  fs.writeFileSync(txtFile, buildTextReport(report), 'utf-8');

  console.log(`\n  📄 JSON report saved → ${jsonFile}`);
  console.log(`  📝 Text report saved → ${txtFile}`);
}

// ── Pretty console + text report ─────────────────────────────────────────────

function buildTextReport(r: TrackingListPerfReport): string {
  const HR = '═'.repeat(100);
  const hr = '─'.repeat(100);
  const lines: string[] = [];
  const w = (s = '') => lines.push(s);

  w();
  w(`╔${HR}╗`);
  w(`║${'TRACKING LIST TAB PERFORMANCE REPORT'.padStart(68).padEnd(100)}║`);
  w(`╠${HR}╣`);
  w(`║  Timestamp : ${r.timestamp.padEnd(86)}║`);
  w(`║  Browser   : ${r.browser.padEnd(86)}║`);
  w(`║  Duration  : ${(r.durationMs / 1000).toFixed(1)}s`.padEnd(101) + '║');
  w(`╠${HR}╣`);

  // Navigation
  w(`║  ── NAVIGATION TO TRACKING LIST ──`.padEnd(101) + '║');
  w(`║  ${ratingIcon(r.navigationToTrackingListMs)} Total navigation time : ${String(r.navigationToTrackingListMs).padStart(6)}ms`.padEnd(101) + '║');
  w(`║    API calls during nav : ${String(r.navigationApiCalls.length).padStart(6)}`.padEnd(101) + '║');
  if (r.navigationApiCalls.length > 0) {
    w(`║  ${hr.slice(0, 98)}║`);
    w(`║  ${'METHOD'.padEnd(8)} ${'STATUS'.padStart(6)}  ${'DURATION'.padStart(10)}  URL`.padEnd(101) + '║');
    w(`║  ${hr.slice(0, 98)}║`);
    for (const a of r.navigationApiCalls.slice(0, 20)) {
      const shortUrl = a.url.length > 65 ? '…' + a.url.slice(-64) : a.url;
      w(`║  ${a.method.padEnd(8)} ${String(a.status).padStart(6)}  ${String(a.durationMs).padStart(8)}ms  ${shortUrl}`.padEnd(101) + '║');
    }
    if (r.navigationApiCalls.length > 20)
      w(`║  ... and ${r.navigationApiCalls.length - 20} more API calls`.padEnd(101) + '║');
  }
  w(`║${''.padEnd(100)}║`);

  // First visit table
  w(`╠${HR}╣`);
  w(`║  ── FIRST VISIT — TAB PERFORMANCE ──`.padEnd(101) + '║');
  w(`║  ${'TAB'.padEnd(22)} ${'SWITCH'.padStart(8)}  ${'DATA LOAD'.padStart(10)}  ${'NET IDLE'.padStart(10)}  ${'ROWS'.padStart(6)}  ${'APIs'.padStart(5)}  ${'SLOWEST'.padStart(9)}  RATING`.padEnd(101) + '║');
  w(`║  ${hr.slice(0, 98)}║`);
  for (const t of r.firstVisit) {
    w(`║  ${ratingIcon(t.dataLoadTimeMs)} ${t.tabName.padEnd(20)} ${String(t.switchTimeMs).padStart(6)}ms  ${String(t.dataLoadTimeMs).padStart(8)}ms  ${String(t.networkIdleTimeMs).padStart(8)}ms  ${String(t.rowCount).padStart(6)}  ${String(t.apiCalls.length).padStart(5)}  ${String(t.slowestApiMs).padStart(7)}ms`.padEnd(101) + '║');
  }
  const avgFirst = Math.round(r.firstVisit.reduce((s, t) => s + t.dataLoadTimeMs, 0) / (r.firstVisit.length || 1));
  w(`║  Average data load (first visit) : ${String(avgFirst).padStart(6)}ms`.padEnd(101) + '║');
  w(`║${''.padEnd(100)}║`);

  // Revisit table
  w(`╠${HR}╣`);
  w(`║  ── REVISIT — TAB PERFORMANCE (WARM CACHE) ──`.padEnd(101) + '║');
  w(`║  ${'TAB'.padEnd(22)} ${'SWITCH'.padStart(8)}  ${'DATA LOAD'.padStart(10)}  ${'NET IDLE'.padStart(10)}  ${'ROWS'.padStart(6)}  ${'APIs'.padStart(5)}  ${'SLOWEST'.padStart(9)}  RATING`.padEnd(101) + '║');
  w(`║  ${hr.slice(0, 98)}║`);
  for (const t of r.revisit) {
    w(`║  ${ratingIcon(t.dataLoadTimeMs)} ${t.tabName.padEnd(20)} ${String(t.switchTimeMs).padStart(6)}ms  ${String(t.dataLoadTimeMs).padStart(8)}ms  ${String(t.networkIdleTimeMs).padStart(8)}ms  ${String(t.rowCount).padStart(6)}  ${String(t.apiCalls.length).padStart(5)}  ${String(t.slowestApiMs).padStart(7)}ms`.padEnd(101) + '║');
  }
  const avgRevisit = Math.round(r.revisit.reduce((s, t) => s + t.dataLoadTimeMs, 0) / (r.revisit.length || 1));
  w(`║  Average data load (revisit)     : ${String(avgRevisit).padStart(6)}ms`.padEnd(101) + '║');
  w(`║${''.padEnd(100)}║`);

  // Cache comparison
  w(`╠${HR}╣`);
  w(`║  ── COLD vs WARM COMPARISON ──`.padEnd(101) + '║');
  w(`║  ${'TAB'.padEnd(22)} ${'1st VISIT'.padStart(10)}  ${'REVISIT'.padStart(10)}  ${'IMPROVEMENT'.padStart(12)}`.padEnd(101) + '║');
  w(`║  ${hr.slice(0, 98)}║`);
  for (const c of r.cacheComparison) {
    const arrow = c.improvementPct > 0 ? '⬇' : c.improvementPct < 0 ? '⬆' : '═';
    w(`║  ${arrow} ${c.tabName.padEnd(20)} ${String(c.firstVisitMs).padStart(8)}ms  ${String(c.revisitMs).padStart(8)}ms  ${String(c.improvementPct).padStart(10)}%`.padEnd(101) + '║');
  }
  w(`║${''.padEnd(100)}║`);

  // API summary
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

  // Per-tab API breakdown (first visit)
  w(`╠${HR}╣`);
  w(`║  ── PER-TAB API BREAKDOWN (FIRST VISIT) ──`.padEnd(101) + '║');
  for (const t of r.firstVisit) {
    w(`║  ${hr.slice(0, 98)}║`);
    w(`║  📋 ${t.tabName}  (${t.apiCalls.length} APIs, slowest ${t.slowestApiMs}ms)`.padEnd(101) + '║');
    for (const a of t.apiCalls.slice(0, 10)) {
      const shortUrl = a.url.split('?')[0];
      const displayUrl = shortUrl.length > 55 ? '…' + shortUrl.slice(-54) : shortUrl;
      const icon = a.status < 400 ? '✅' : '❌';
      w(`║    ${icon} [${a.method.padEnd(4)}] ${String(a.durationMs).padStart(5)}ms | ${a.status} | ${displayUrl}`.padEnd(101) + '║');
    }
    if (t.apiCalls.length > 10)
      w(`║    ... and ${t.apiCalls.length - 10} more`.padEnd(101) + '║');
  }
  w(`║${''.padEnd(100)}║`);

  // Search profiling
  if (r.searchProfiling) {
    const sp = r.searchProfiling;
    w(`╠${HR}╣`);
    w(`║  ── SEARCH PROFILING — "${sp.searchTerm}" ──`.padEnd(101) + '║');
    w(`║  ${ratingIcon(sp.searchTimeMs)} Total search time      : ${String(sp.searchTimeMs).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    Network idle time    : ${String(sp.networkIdleMs).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    Result rows returned : ${String(sp.resultRowCount).padStart(6)}`.padEnd(101) + '║');
    w(`║    API calls fired      : ${String(sp.apiCalls.length).padStart(6)}`.padEnd(101) + '║');
    w(`║    Slowest API          : ${String(sp.slowestApiMs).padStart(6)}ms`.padEnd(101) + '║');
    if (sp.apiCalls.length > 0) {
      w(`║  ${hr.slice(0, 98)}║`);
      w(`║  ${'METHOD'.padEnd(8)} ${'STATUS'.padStart(6)}  ${'DURATION'.padStart(10)}  URL`.padEnd(101) + '║');
      w(`║  ${hr.slice(0, 98)}║`);
      for (const a of sp.apiCalls.slice(0, 15)) {
        const shortUrl = a.url.length > 65 ? '…' + a.url.slice(-64) : a.url;
        const icon = a.status < 400 ? '✅' : '❌';
        w(`║  ${icon} ${a.method.padEnd(8)} ${String(a.status).padStart(6)}  ${String(a.durationMs).padStart(8)}ms  ${shortUrl}`.padEnd(101) + '║');
      }
      if (sp.apiCalls.length > 15)
        w(`║  ... and ${sp.apiCalls.length - 15} more API calls`.padEnd(101) + '║');
    }
    w(`║${''.padEnd(100)}║`);
  }

  // Shipment detail navigation
  if (r.shipmentDetailProfiling) {
    const sd = r.shipmentDetailProfiling;
    w(`╠${HR}╣`);
    w(`║  ── SHIPMENT DETAIL PAGE NAVIGATION — "${sd.shipmentNumber}" ──`.padEnd(101) + '║');
    w(`║  ${ratingIcon(sd.navigationTimeMs)} Total navigation time  : ${String(sd.navigationTimeMs).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    Network idle time    : ${String(sd.networkIdleMs).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    Total API time       : ${String(sd.totalApiTimeMs).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    API calls fired      : ${String(sd.apiCalls.length).padStart(6)}`.padEnd(101) + '║');
    w(`║    Slowest API          : ${String(sd.slowestApiMs).padStart(6)}ms`.padEnd(101) + '║');
    w(`║    Page URL             : ${sd.pageUrl.substring(0, 74)}`.padEnd(101) + '║');
    if (sd.apiCalls.length > 0) {
      w(`║  ${hr.slice(0, 98)}║`);
      w(`║  ${'METHOD'.padEnd(8)} ${'STATUS'.padStart(6)}  ${'DURATION'.padStart(10)}  URL`.padEnd(101) + '║');
      w(`║  ${hr.slice(0, 98)}║`);
      for (const a of sd.apiCalls.slice(0, 20)) {
        const shortUrl = a.url.length > 65 ? '…' + a.url.slice(-64) : a.url;
        const icon = a.status < 400 ? '✅' : '❌';
        w(`║  ${icon} ${a.method.padEnd(8)} ${String(a.status).padStart(6)}  ${String(a.durationMs).padStart(8)}ms  ${shortUrl}`.padEnd(101) + '║');
      }
      if (sd.apiCalls.length > 20)
        w(`║  ... and ${sd.apiCalls.length - 20} more API calls`.padEnd(101) + '║');
    }
    w(`║${''.padEnd(100)}║`);
  }

  // Memory
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

  // Errors
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
  return lines.join('\n');
}

function printReport(r: TrackingListPerfReport) {
  const text = buildTextReport(r);
  console.log(text);
}

// ═════════════════════════════════════════════════════════════════════════════
//  TEST
// ═════════════════════════════════════════════════════════════════════════════

test.describe('📋 Tracking List Tab Performance Profiling', () => {

  test.setTimeout(420_000); // 7 minutes — covers login + 7 tabs × 2 visits + search + detail nav

  test('TLP-01: Profile all Tracking List tabs — first visit & revisit', async ({ page, context, browserName }) => {

    const testStart = Date.now();
    const allApiCalls: ApiCallRecord[] = [];

    // Console error tracker
    const consoleTracker = createConsoleTracker(page);
    consoleTracker.start();

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 1 — LOGIN
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(100));
    console.log('  TRACKING LIST TAB PERFORMANCE PROFILING');
    console.log('═'.repeat(100));
    console.log('\n  ⏳ Step 1/6 — Logging in …');

    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    console.log('  ✅ Logged in & home page loaded');

    // Memory snapshot — baseline
    const memorySnapshots: Array<{ stage: string; usedMB: number; totalMB: number }> = [];
    const memBaseline = await getMemoryMetrics(page);
    if (memBaseline) {
      memorySnapshots.push({ stage: 'After Login (Baseline)', usedMB: memBaseline.usedJSHeapSizeMB, totalMB: memBaseline.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 2 — NAVIGATE TO TRACKING LIST
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 2/6 — Navigating to Tracking List …');

    const navTracker = createNetworkTracker(page);
    navTracker.start();
    const navStart = Date.now();

    // Click the Tracking List nav link
    const trackingLink = page.getByRole('link', { name: /Tracking List/i });
    await expect(trackingLink).toBeVisible({ timeout: 15_000 });
    await trackingLink.click();

    // Wait for the default tab's table to appear
    try {
      await page.locator('table tbody tr, [role="row"]').first().waitFor({ state: 'visible', timeout: 45_000 });
    } catch {
      // SPA may not have a classic table — wait for network idle instead
    }
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(1500); // let stragglers finish

    navTracker.stop();
    const navigationToTrackingListMs = Date.now() - navStart;
    const navigationApiCalls = toApiRecords(navTracker.getRequests());
    allApiCalls.push(...navigationApiCalls);

    console.log(`  ✅ Tracking List loaded in ${navigationToTrackingListMs}ms  (${navigationApiCalls.length} API calls)`);

    // Memory after navigation
    const memAfterNav = await getMemoryMetrics(page);
    if (memAfterNav) {
      memorySnapshots.push({ stage: 'After Tracking List Nav', usedMB: memAfterNav.usedJSHeapSizeMB, totalMB: memAfterNav.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 3 — FIRST VISIT TO EACH TAB
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 3/6 — First visit to each tab …');

    const firstVisitResults: TabResult[] = [];

    for (const tabName of TRACKING_TABS) {
      const result = await profileTab(page, tabName, 'first');
      firstVisitResults.push(result);
      allApiCalls.push(...result.apiCalls);

      console.log(
        `    ${ratingIcon(result.dataLoadTimeMs)} ${tabName.padEnd(22)} ` +
        `switch=${result.switchTimeMs}ms  data=${result.dataLoadTimeMs}ms  ` +
        `rows=${result.rowCount}  apis=${result.apiCalls.length}`
      );
    }

    // Memory after first round
    const memAfterFirst = await getMemoryMetrics(page);
    if (memAfterFirst) {
      memorySnapshots.push({ stage: 'After First Visit (all tabs)', usedMB: memAfterFirst.usedJSHeapSizeMB, totalMB: memAfterFirst.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 4 — REVISIT EACH TAB (warm cache)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 4/6 — Revisiting each tab (warm cache) …');

    const revisitResults: TabResult[] = [];

    for (const tabName of TRACKING_TABS) {
      const result = await profileTab(page, tabName, 'revisit');
      revisitResults.push(result);
      allApiCalls.push(...result.apiCalls);

      console.log(
        `    ${ratingIcon(result.dataLoadTimeMs)} ${tabName.padEnd(22)} ` +
        `switch=${result.switchTimeMs}ms  data=${result.dataLoadTimeMs}ms  ` +
        `rows=${result.rowCount}  apis=${result.apiCalls.length}`
      );
    }

    // Memory after revisit round
    const memAfterRevisit = await getMemoryMetrics(page);
    if (memAfterRevisit) {
      memorySnapshots.push({ stage: 'After Revisit (all tabs)', usedMB: memAfterRevisit.usedJSHeapSizeMB, totalMB: memAfterRevisit.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 5 — SEARCH "us100" IN ALL SHIPMENTS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 5/6 — Searching "us100" in All Shipments …');

    // First go back to All Shipments tab
    const allShipmentsTab = page.getByRole('tab', { name: /All Shipments/i });
    const allShipVisible = await allShipmentsTab.isVisible({ timeout: 5_000 }).catch(() => false);
    if (allShipVisible) {
      await allShipmentsTab.click();
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    let searchProfiling: TrackingListPerfReport['searchProfiling'] | undefined;
    const searchTracker = createNetworkTracker(page);
    searchTracker.start();
    const searchStart = Date.now();

    try {
      // Find the search input — try multiple selectors for robustness
      const searchInput = page.locator('input[type="search"], input[placeholder*="earch"], input[placeholder*="Search"], input[aria-label*="earch"], .search-input input, [class*="search"] input').first();
      await expect(searchInput).toBeVisible({ timeout: 10_000 });

      // Clear any existing text and type search term
      await searchInput.click();
      await searchInput.fill('');
      await searchInput.fill('us100');

      // Some UIs require pressing Enter or clicking a search button
      await searchInput.press('Enter').catch(() => {});

      // Wait for search API response
      try {
        await page.waitForResponse(
          resp => (resp.request().resourceType() === 'xhr' || resp.request().resourceType() === 'fetch') && resp.status() < 500,
          { timeout: 25_000 },
        );
      } catch { /* search may filter client-side */ }

      // Wait for network idle
      const searchNetIdleStart = Date.now();
      await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {});
      await page.waitForTimeout(1000); // let table re-render
      const searchNetIdleMs = Date.now() - searchNetIdleStart;

      const searchTimeMs = Date.now() - searchStart;
      searchTracker.stop();

      const searchApiCalls = toApiRecords(searchTracker.getRequests());
      allApiCalls.push(...searchApiCalls);

      const searchRowCount = await page.locator('table tbody tr').count().catch(() => 0);

      const slowestSearch = searchApiCalls.length > 0
        ? searchApiCalls.reduce((max, a) => (a.durationMs > max.durationMs ? a : max), searchApiCalls[0])
        : { durationMs: 0, url: '' };

      searchProfiling = {
        searchTerm: 'us100',
        searchTimeMs,
        networkIdleMs: searchNetIdleMs,
        resultRowCount: searchRowCount,
        apiCalls: searchApiCalls,
        slowestApiMs: slowestSearch.durationMs,
        slowestApiUrl: slowestSearch.url,
      };

      console.log(
        `    ${ratingIcon(searchTimeMs)} Search "us100" completed in ${searchTimeMs}ms  ` +
        `rows=${searchRowCount}  apis=${searchApiCalls.length}  slowest=${slowestSearch.durationMs}ms`
      );
    } catch (err) {
      searchTracker.stop();
      console.log(`    ❌ Search profiling failed: ${(err as Error).message}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 6 — CLICK SHIPMENT NUMBER → SHIPMENT DETAILS PAGE
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 6/6 — Navigating to Shipment Details …');

    let shipmentDetailProfiling: TrackingListPerfReport['shipmentDetailProfiling'] | undefined;
    const detailTracker = createNetworkTracker(page);
    detailTracker.start();
    const detailNavStart = Date.now();

    try {
      // Find a clickable shipment number link in the table
      // Shipment numbers are typically in the first few columns as links/anchors
      const shipmentLink = page.locator('table tbody tr td a[title], table tbody tr td a.text-blue-600, table tbody tr td a[href="#"]').first();

      let shipmentNumber = 'unknown';

      // Scroll the element into view first (search results may push it off-screen)
      await shipmentLink.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(500);

      shipmentNumber = (await shipmentLink.getAttribute('title') || await shipmentLink.innerText().catch(() => 'unknown')).trim();

      // Force-click in case overlays or sticky headers are covering it
      await shipmentLink.click({ force: true, timeout: 15_000 });

      console.log(`    📦 Clicked shipment: "${shipmentNumber}"`);

      // Wait for navigation / new page content to load
      try {
        await page.waitForURL(/.*/, { timeout: 30_000, waitUntil: 'load' });
      } catch { /* SPA routing may not change URL pattern */ }

      // Wait for the detail page content to appear
      try {
        await page.waitForResponse(
          resp => (resp.request().resourceType() === 'xhr' || resp.request().resourceType() === 'fetch') && resp.status() < 500,
          { timeout: 25_000 },
        );
      } catch { /* may already have loaded */ }

      // Wait for network to settle on detail page
      const detailNetIdleStart = Date.now();
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1500); // let detail page fully render
      const detailNetIdleMs = Date.now() - detailNetIdleStart;

      const navigationTimeMs = Date.now() - detailNavStart;
      detailTracker.stop();

      const detailApiCalls = toApiRecords(detailTracker.getRequests());
      allApiCalls.push(...detailApiCalls);

      const totalDetailApiTimeMs = detailApiCalls.reduce((s, a) => s + a.durationMs, 0);
      const slowestDetail = detailApiCalls.length > 0
        ? detailApiCalls.reduce((max, a) => (a.durationMs > max.durationMs ? a : max), detailApiCalls[0])
        : { durationMs: 0, url: '' };

      shipmentDetailProfiling = {
        shipmentNumber,
        navigationTimeMs,
        networkIdleMs: detailNetIdleMs,
        apiCalls: detailApiCalls,
        totalApiTimeMs: totalDetailApiTimeMs,
        slowestApiMs: slowestDetail.durationMs,
        slowestApiUrl: slowestDetail.url,
        pageUrl: page.url(),
      };

      console.log(
        `    ${ratingIcon(navigationTimeMs)} Shipment detail page loaded in ${navigationTimeMs}ms  ` +
        `apis=${detailApiCalls.length}  slowest=${slowestDetail.durationMs}ms`
      );
    } catch (err) {
      detailTracker.stop();
      console.log(`    ❌ Shipment detail navigation failed: ${(err as Error).message}`);
    }

    // Memory after search + detail
    const memAfterDetail = await getMemoryMetrics(page);
    if (memAfterDetail) {
      memorySnapshots.push({ stage: 'After Search + Detail Nav', usedMB: memAfterDetail.usedJSHeapSizeMB, totalMB: memAfterDetail.totalJSHeapSizeMB });
    }

    consoleTracker.stop();

    // ══════════════════════════════════════════════════════════════════════════
    //  BUILD REPORT
    // ══════════════════════════════════════════════════════════════════════════

    const cacheComparison = TRACKING_TABS.map((tabName, i) => {
      const first = firstVisitResults[i]?.dataLoadTimeMs ?? 0;
      const revisit = revisitResults[i]?.dataLoadTimeMs ?? 0;
      const improvement = first > 0 ? Math.round(((first - revisit) / first) * 100) : 0;
      return { tabName, firstVisitMs: first, revisitMs: revisit, improvementPct: improvement };
    });

    const report: TrackingListPerfReport = {
      testName: 'Tracking List Tab Performance Profiling',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - testStart,
      browser: browserName || 'unknown',
      navigationToTrackingListMs,
      navigationApiCalls,
      firstVisit: firstVisitResults,
      revisit: revisitResults,
      apiSummary: buildApiSummary(allApiCalls),
      cacheComparison,
      searchProfiling,
      shipmentDetailProfiling,
      memorySnapshots,
      consoleErrors: consoleTracker.getErrors().map(e => e.text),
    };

    // Print to console
    printReport(report);

    // Save to disk
    saveReport(report);

    // ── Soft assertions (won't fail the test, but logged) ────────────────────
    const avgFirstVisit = Math.round(firstVisitResults.reduce((s, t) => s + t.dataLoadTimeMs, 0) / firstVisitResults.length);
    console.log(`\n  📊 Avg first-visit data load  : ${avgFirstVisit}ms`);
    console.log(`  📊 Avg revisit data load      : ${Math.round(revisitResults.reduce((s, t) => s + t.dataLoadTimeMs, 0) / revisitResults.length)}ms`);
    console.log(`  📊 Total API calls tracked    : ${allApiCalls.length}`);
    console.log(`  📊 Total test duration        : ${((Date.now() - testStart) / 1000).toFixed(1)}s\n`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  TAB PROFILING FUNCTION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Clicks a tab, waits for its data to load, and captures all API calls
 * plus timing metrics during that window.
 */
async function profileTab(
  page: import('@playwright/test').Page,
  tabName: TabName,
  visit: 'first' | 'revisit',
): Promise<TabResult> {

  const tracker = createNetworkTracker(page);
  tracker.start();

  const switchStart = Date.now();

  // Find and click the tab (robust selector)
  const tab = page.getByRole('tab', { name: new RegExp(`^${escapeRegex(tabName)}`, 'i') });
  const tabExists = await tab.isVisible({ timeout: 5_000 }).catch(() => false);

  if (!tabExists) {
    // Fallback: try text match
    const fallback = page.locator(`text="${tabName}"`).first();
    await fallback.click({ timeout: 10_000 }).catch(() => {});
  } else {
    await tab.click();
  }

  const switchTimeMs = Date.now() - switchStart;

  // Wait for data to load (table rows / network idle)
  const dataStart = Date.now();
  try {
    // Wait for at least one new XHR response from clicking the tab
    await page.waitForResponse(
      resp => (resp.request().resourceType() === 'xhr' || resp.request().resourceType() === 'fetch') && resp.status() < 500,
      { timeout: 20_000 },
    );
  } catch {
    // No XHR fired (data may be cached client-side)
  }

  // Wait for network to settle
  const networkIdleStart = Date.now();
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(800); // extra buffer for rendering
  const networkIdleTimeMs = Date.now() - networkIdleStart;

  const dataLoadTimeMs = Date.now() - dataStart;

  tracker.stop();

  // Count visible rows
  const rowCount = await page.locator('table tbody tr').count().catch(() => 0);

  // Collect API calls during this tab switch
  const apiCalls = toApiRecords(tracker.getRequests());
  const totalApiTimeMs = apiCalls.reduce((s, a) => s + a.durationMs, 0);
  const slowest = apiCalls.length > 0
    ? apiCalls.reduce((max, a) => (a.durationMs > max.durationMs ? a : max), apiCalls[0])
    : { durationMs: 0, url: '' };

  return {
    tabName,
    visit,
    switchTimeMs,
    dataLoadTimeMs,
    networkIdleTimeMs,
    rowCount,
    apiCalls,
    totalApiTimeMs,
    slowestApiMs: slowest.durationMs,
    slowestApiUrl: slowest.url,
  };
}

/** Escape special regex characters in tab names */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
