/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GLOBAL SEARCH → SHIPMENT DETAILS PERFORMANCE TEST
 *
 *  End-to-end performance profiling flow:
 *
 *  1. Login → Home Page — record page load time & navigation timing
 *  2. Global Search "US10020996682" → press Enter — record API calls & timing
 *  3. Click shipment row in tracking list → navigate to Detail page — record
 *     navigation time, API calls, data render
 *  4. Click each detail tab (Shipment Information, Location, Event, Alerts,
 *     Documents) — record switch time & data load time
 *  5. In Shipment Information tab, expand dropdowns (General Information,
 *     Transport Information, Current Location, CO2 Emissions) — record timing
 *  6. Navigate back to Home (click "Home") — record navigation time
 *  7. Global Search "US100" → press Enter — wait for tracking list to fully
 *     load with all shipments, record API calls & timing
 *  8. Pretty-print full report to console & save JSON + TXT to
 *     GlobalSearchtoDetails/<timestamp>
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
  getNavigationTimingMetrics,
  createConsoleTracker,
  type NetworkRequest,
} from '../../utils/performance-helpers';

// ── Constants ────────────────────────────────────────────────────────────────

// const BASE_URL = 'https://test.itt.bdpsmart.com';

const BASE_URL = 'https://stage.itt.bdpsmart.com';
const HOME_URL = `${BASE_URL}/#/home`;

/** Detail-page tabs below the map */
const DETAIL_TABS = [
  'Shipment Information',
  'Location',
  'Event',
  'Alerts',
  'Documents',
] as const;

type DetailTabName = (typeof DETAIL_TABS)[number];

/** Dropdowns / sections inside Shipment Information tab */
const SHIPMENT_INFO_SECTIONS = [
  'General Information',
  'Transport Information',
  'Current Location',
  'Co2 Emissions',
] as const;

type SectionName = (typeof SHIPMENT_INFO_SECTIONS)[number];

// ── Interfaces ───────────────────────────────────────────────────────────────

interface ApiCallRecord {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  resourceType: string;
  timestamp: number;
}

interface SearchProfiling {
  searchTerm: string;
  searchTimeMs: number;
  networkIdleMs: number;
  apiCalls: ApiCallRecord[];
  totalApiTimeMs: number;
  slowestApiMs: number;
  slowestApiUrl: string;
  resultPageUrl: string;
}

interface DetailPageProfiling {
  shipmentNumber: string;
  navigationTimeMs: number;
  networkIdleMs: number;
  apiCalls: ApiCallRecord[];
  totalApiTimeMs: number;
  slowestApiMs: number;
  slowestApiUrl: string;
  pageUrl: string;
  dataVisibleTimeMs: number;
}

interface TabSwitchResult {
  tabName: string;
  switchTimeMs: number;
  dataLoadTimeMs: number;
  apiCalls: ApiCallRecord[];
  totalApiTimeMs: number;
  slowestApiMs: number;
  slowestApiUrl: string;
}

interface SectionExpandResult {
  sectionName: string;
  expandTimeMs: number;
  isExpanded: boolean;
  apiCalls: ApiCallRecord[];
}

interface GlobalSearchPerfReport {
  testName: string;
  timestamp: string;
  durationMs: number;
  browser: string;

  // Home page
  homePageLoadMs: number;
  homePageNetworkIdleMs: number;
  homePageApiCalls: ApiCallRecord[];

  // Search 1 — "US10021000763"
  search1: SearchProfiling;

  // Shipment Detail Page
  detailPage: DetailPageProfiling;

  // Detail tabs
  detailTabs: TabSwitchResult[];

  // Shipment Info dropdowns
  shipmentInfoSections: SectionExpandResult[];

  // Navigation back to Home
  backToHomeMs: number;
  backToHomeApiCalls: ApiCallRecord[];

  // Search 2 — "US100"
  search2: SearchProfiling;

  // Aggregate API stats
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

  // Memory
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

function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slowestApi(calls: ApiCallRecord[]): { durationMs: number; url: string } {
  if (calls.length === 0) return { durationMs: 0, url: '' };
  return calls.reduce((max, a) => (a.durationMs > max.durationMs ? a : max), calls[0]);
}

// ── Report builder ───────────────────────────────────────────────────────────

function buildTextReport(r: GlobalSearchPerfReport): string {
  const HR = '═'.repeat(110);
  const hr = '─'.repeat(110);
  const lines: string[] = [];
  const w = (s = '') => lines.push(s);

  w();
  w(`╔${HR}╗`);
  w(`║${'GLOBAL SEARCH → SHIPMENT DETAILS PERFORMANCE REPORT'.padStart(80).padEnd(110)}║`);
  w(`╠${HR}╣`);
  w(`║  Timestamp : ${r.timestamp.padEnd(96)}║`);
  w(`║  Browser   : ${r.browser.padEnd(96)}║`);
  w(`║  Duration  : ${(r.durationMs / 1000).toFixed(1)}s`.padEnd(111) + '║');
  w(`╠${HR}╣`);

  // ── HOME PAGE ──
  w(`║  ── 1. HOME PAGE LOAD ──`.padEnd(111) + '║');
  w(`║  ${ratingIcon(r.homePageLoadMs)} Page load time       : ${String(r.homePageLoadMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    Network idle time   : ${String(r.homePageNetworkIdleMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    API calls           : ${String(r.homePageApiCalls.length).padStart(6)}`.padEnd(111) + '║');
  if (r.homePageApiCalls.length > 0) {
    w(`║  ${hr.slice(0, 108)}║`);
    w(`║  ${'METHOD'.padEnd(8)} ${'STATUS'.padStart(6)}  ${'DURATION'.padStart(10)}  URL`.padEnd(111) + '║');
    w(`║  ${hr.slice(0, 108)}║`);
    for (const a of r.homePageApiCalls.slice(0, 15)) {
      const shortUrl = a.url.length > 72 ? '…' + a.url.slice(-71) : a.url;
      const icon = a.status < 400 ? '✅' : '❌';
      w(`║  ${icon} ${a.method.padEnd(8)} ${String(a.status).padStart(6)}  ${String(a.durationMs).padStart(8)}ms  ${shortUrl}`.padEnd(111) + '║');
    }
    if (r.homePageApiCalls.length > 15)
      w(`║  ... and ${r.homePageApiCalls.length - 15} more API calls`.padEnd(111) + '║');
  }
  w(`║${''.padEnd(110)}║`);

  // ── SEARCH 1 ──
  w(`╠${HR}╣`);
  w(`║  ── 2. GLOBAL SEARCH — "${r.search1.searchTerm}" ──`.padEnd(111) + '║');
  w(`║  ${ratingIcon(r.search1.searchTimeMs)} Total search + nav time : ${String(r.search1.searchTimeMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    Network idle time     : ${String(r.search1.networkIdleMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    API calls fired       : ${String(r.search1.apiCalls.length).padStart(6)}`.padEnd(111) + '║');
  w(`║    Total API time        : ${String(r.search1.totalApiTimeMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    Slowest API           : ${String(r.search1.slowestApiMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    Result page URL       : ${r.search1.resultPageUrl.substring(0, 82)}`.padEnd(111) + '║');
  if (r.search1.apiCalls.length > 0) {
    w(`║  ${hr.slice(0, 108)}║`);
    w(`║  ${'METHOD'.padEnd(8)} ${'STATUS'.padStart(6)}  ${'DURATION'.padStart(10)}  URL`.padEnd(111) + '║');
    w(`║  ${hr.slice(0, 108)}║`);
    for (const a of r.search1.apiCalls.slice(0, 20)) {
      const shortUrl = a.url.length > 72 ? '…' + a.url.slice(-71) : a.url;
      const icon = a.status < 400 ? '✅' : '❌';
      w(`║  ${icon} ${a.method.padEnd(8)} ${String(a.status).padStart(6)}  ${String(a.durationMs).padStart(8)}ms  ${shortUrl}`.padEnd(111) + '║');
    }
    if (r.search1.apiCalls.length > 20)
      w(`║  ... and ${r.search1.apiCalls.length - 20} more API calls`.padEnd(111) + '║');
  }
  w(`║${''.padEnd(110)}║`);

  // ── SHIPMENT DETAIL PAGE ──
  w(`╠${HR}╣`);
  w(`║  ── 3. SHIPMENT DETAILS PAGE — "${r.detailPage.shipmentNumber}" ──`.padEnd(111) + '║');
  w(`║  ${ratingIcon(r.detailPage.navigationTimeMs)} Navigation time        : ${String(r.detailPage.navigationTimeMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    Data visible time     : ${String(r.detailPage.dataVisibleTimeMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    Network idle time     : ${String(r.detailPage.networkIdleMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    API calls fired       : ${String(r.detailPage.apiCalls.length).padStart(6)}`.padEnd(111) + '║');
  w(`║    Total API time        : ${String(r.detailPage.totalApiTimeMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    Slowest API           : ${String(r.detailPage.slowestApiMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    Page URL              : ${r.detailPage.pageUrl.substring(0, 82)}`.padEnd(111) + '║');
  if (r.detailPage.apiCalls.length > 0) {
    w(`║  ${hr.slice(0, 108)}║`);
    w(`║  ${'METHOD'.padEnd(8)} ${'STATUS'.padStart(6)}  ${'DURATION'.padStart(10)}  URL`.padEnd(111) + '║');
    w(`║  ${hr.slice(0, 108)}║`);
    for (const a of r.detailPage.apiCalls.slice(0, 25)) {
      const shortUrl = a.url.length > 72 ? '…' + a.url.slice(-71) : a.url;
      const icon = a.status < 400 ? '✅' : '❌';
      w(`║  ${icon} ${a.method.padEnd(8)} ${String(a.status).padStart(6)}  ${String(a.durationMs).padStart(8)}ms  ${shortUrl}`.padEnd(111) + '║');
    }
    if (r.detailPage.apiCalls.length > 25)
      w(`║  ... and ${r.detailPage.apiCalls.length - 25} more API calls`.padEnd(111) + '║');
  }
  w(`║${''.padEnd(110)}║`);

  // ── DETAIL TABS ──
  w(`╠${HR}╣`);
  w(`║  ── 4. DETAIL PAGE TABS ──`.padEnd(111) + '║');
  w(`║  ${'TAB'.padEnd(25)} ${'SWITCH'.padStart(8)}  ${'DATA LOAD'.padStart(10)}  ${'APIs'.padStart(5)}  ${'TOTAL API'.padStart(10)}  ${'SLOWEST'.padStart(9)}  RATING`.padEnd(111) + '║');
  w(`║  ${hr.slice(0, 108)}║`);
  for (const t of r.detailTabs) {
    w(`║  ${ratingIcon(t.dataLoadTimeMs, 500, 2000)} ${t.tabName.padEnd(23)} ${String(t.switchTimeMs).padStart(6)}ms  ${String(t.dataLoadTimeMs).padStart(8)}ms  ${String(t.apiCalls.length).padStart(5)}  ${String(t.totalApiTimeMs).padStart(8)}ms  ${String(t.slowestApiMs).padStart(7)}ms`.padEnd(111) + '║');
  }
  w(`║${''.padEnd(110)}║`);

  // ── SHIPMENT INFORMATION SECTIONS ──
  w(`╠${HR}╣`);
  w(`║  ── 5. SHIPMENT INFORMATION — DROPDOWN/ACCORDION SECTIONS ──`.padEnd(111) + '║');
  w(`║  ${'SECTION'.padEnd(30)} ${'EXPAND TIME'.padStart(12)}  ${'EXPANDED'.padStart(10)}  ${'APIs'.padStart(5)}  RATING`.padEnd(111) + '║');
  w(`║  ${hr.slice(0, 108)}║`);
  for (const s of r.shipmentInfoSections) {
    w(`║  ${ratingIcon(s.expandTimeMs, 300, 1000)} ${s.sectionName.padEnd(28)} ${String(s.expandTimeMs).padStart(10)}ms  ${String(s.isExpanded ? 'YES' : 'NO').padStart(10)}  ${String(s.apiCalls.length).padStart(5)}`.padEnd(111) + '║');
  }
  w(`║${''.padEnd(110)}║`);

  // ── BACK TO HOME ──
  w(`╠${HR}╣`);
  w(`║  ── 6. NAVIGATE BACK TO HOME ──`.padEnd(111) + '║');
  w(`║  ${ratingIcon(r.backToHomeMs)} Navigation time : ${String(r.backToHomeMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    API calls          : ${String(r.backToHomeApiCalls.length).padStart(6)}`.padEnd(111) + '║');
  w(`║${''.padEnd(110)}║`);

  // ── SEARCH 2 ──
  w(`╠${HR}╣`);
  w(`║  ── 7. GLOBAL SEARCH — "${r.search2.searchTerm}" ──`.padEnd(111) + '║');
  w(`║  ${ratingIcon(r.search2.searchTimeMs)} Total search + nav time : ${String(r.search2.searchTimeMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    Network idle time     : ${String(r.search2.networkIdleMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    API calls fired       : ${String(r.search2.apiCalls.length).padStart(6)}`.padEnd(111) + '║');
  w(`║    Total API time        : ${String(r.search2.totalApiTimeMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    Slowest API           : ${String(r.search2.slowestApiMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    Result page URL       : ${r.search2.resultPageUrl.substring(0, 82)}`.padEnd(111) + '║');
  if (r.search2.apiCalls.length > 0) {
    w(`║  ${hr.slice(0, 108)}║`);
    w(`║  ${'METHOD'.padEnd(8)} ${'STATUS'.padStart(6)}  ${'DURATION'.padStart(10)}  URL`.padEnd(111) + '║');
    w(`║  ${hr.slice(0, 108)}║`);
    for (const a of r.search2.apiCalls.slice(0, 20)) {
      const shortUrl = a.url.length > 72 ? '…' + a.url.slice(-71) : a.url;
      const icon = a.status < 400 ? '✅' : '❌';
      w(`║  ${icon} ${a.method.padEnd(8)} ${String(a.status).padStart(6)}  ${String(a.durationMs).padStart(8)}ms  ${shortUrl}`.padEnd(111) + '║');
    }
    if (r.search2.apiCalls.length > 20)
      w(`║  ... and ${r.search2.apiCalls.length - 20} more API calls`.padEnd(111) + '║');
  }
  w(`║${''.padEnd(110)}║`);

  // ── AGGREGATE API SUMMARY ──
  w(`╠${HR}╣`);
  w(`║  ── AGGREGATE API STATISTICS ──`.padEnd(111) + '║');
  w(`║  Total API calls   : ${String(r.apiSummary.totalCalls).padStart(6)}`.padEnd(111) + '║');
  w(`║  Failed calls      : ${String(r.apiSummary.failedCalls).padStart(6)}`.padEnd(111) + '║');
  w(`║  Slow calls (>1s)  : ${String(r.apiSummary.slowCalls).padStart(6)}`.padEnd(111) + '║');
  w(`║  Min response      : ${String(r.apiSummary.minMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║  Avg response      : ${String(r.apiSummary.avgResponseMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║  P50 response      : ${String(r.apiSummary.p50Ms).padStart(6)}ms`.padEnd(111) + '║');
  w(`║  P90 response      : ${String(r.apiSummary.p90Ms).padStart(6)}ms`.padEnd(111) + '║');
  w(`║  P99 response      : ${String(r.apiSummary.p99Ms).padStart(6)}ms`.padEnd(111) + '║');
  w(`║  Max response      : ${String(r.apiSummary.maxMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║${''.padEnd(110)}║`);

  // ── MEMORY ──
  if (r.memorySnapshots.length > 0) {
    w(`╠${HR}╣`);
    w(`║  ── MEMORY SNAPSHOTS ──`.padEnd(111) + '║');
    w(`║  ${'STAGE'.padEnd(45)} ${'USED'.padStart(10)}  ${'TOTAL'.padStart(10)}`.padEnd(111) + '║');
    w(`║  ${hr.slice(0, 108)}║`);
    for (const m of r.memorySnapshots) {
      w(`║  ${m.stage.padEnd(45)} ${String(m.usedMB.toFixed(2)).padStart(8)} MB  ${String(m.totalMB.toFixed(2)).padStart(8)} MB`.padEnd(111) + '║');
    }
    w(`║${''.padEnd(110)}║`);
  }

  // ── CONSOLE ERRORS ──
  if (r.consoleErrors.length > 0) {
    w(`╠${HR}╣`);
    w(`║  ── CONSOLE ERRORS (${r.consoleErrors.length}) ──`.padEnd(111) + '║');
    for (const e of r.consoleErrors.slice(0, 15)) {
      w(`║  ❌ ${e.substring(0, 104)}`.padEnd(111) + '║');
    }
    w(`║${''.padEnd(110)}║`);
  }

  w(`╚${HR}╝`);
  w();
  return lines.join('\n');
}

function saveReport(report: GlobalSearchPerfReport) {
  const ts = getTimestamp();
  const outDir = path.resolve(__dirname, '..', '..', 'GlobalSearchtoDetails');
  ensureDir(outDir);

  const jsonFile = path.join(outDir, `global-search-details-perf-${ts}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), 'utf-8');

  const txtFile = path.join(outDir, `global-search-details-perf-${ts}.txt`);
  fs.writeFileSync(txtFile, buildTextReport(report), 'utf-8');

  console.log(`\n  📄 JSON report saved → ${jsonFile}`);
  console.log(`  📝 Text report saved → ${txtFile}`);
}

function printReport(r: GlobalSearchPerfReport) {
  console.log(buildTextReport(r));
}

// ═════════════════════════════════════════════════════════════════════════════
//  TEST
// ═════════════════════════════════════════════════════════════════════════════

test.describe('🔍 Global Search → Shipment Details Performance Profiling', () => {

  test.setTimeout(480_000); // 8 minutes — covers full flow

  test('GSP-01: Global Search to Shipment Details — full performance profile', async ({ page, context, browserName }) => {

    const testStart = Date.now();
    const allApiCalls: ApiCallRecord[] = [];
    const memorySnapshots: Array<{ stage: string; usedMB: number; totalMB: number }> = [];

    // Console error tracker
    const consoleTracker = createConsoleTracker(page);
    consoleTracker.start();

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 1 — LOGIN & HOME PAGE LOAD
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(110));
    console.log('  GLOBAL SEARCH → SHIPMENT DETAILS PERFORMANCE PROFILING');
    console.log('═'.repeat(110));
    console.log('\n  ⏳ Step 1/8 — Logging in & loading Home Page …');

    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    // Track home page load
    const homeTracker = createNetworkTracker(page);
    homeTracker.start();
    const homeLoadStart = Date.now();

    await page.goto(HOME_URL, { waitUntil: 'load' });
    const homeNetIdleStart = Date.now();
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await page.waitForTimeout(1500);
    const homePageNetworkIdleMs = Date.now() - homeNetIdleStart;
    const homePageLoadMs = Date.now() - homeLoadStart;

    homeTracker.stop();
    const homePageApiCalls = toApiRecords(homeTracker.getRequests());
    allApiCalls.push(...homePageApiCalls);

    // Memory baseline
    const memBaseline = await getMemoryMetrics(page);
    if (memBaseline) {
      memorySnapshots.push({ stage: 'After Home Page Load (Baseline)', usedMB: memBaseline.usedJSHeapSizeMB, totalMB: memBaseline.totalJSHeapSizeMB });
    }

    console.log(`  ✅ Home page loaded in ${homePageLoadMs}ms  (${homePageApiCalls.length} API calls)`);
    for (const a of homePageApiCalls.slice(0, 5)) {
      const shortUrl = a.url.length > 70 ? '…' + a.url.slice(-69) : a.url;
      console.log(`     ${a.status < 400 ? '✅' : '❌'} [${a.method}] ${a.durationMs}ms | ${a.status} | ${shortUrl}`);
    }
    if (homePageApiCalls.length > 5) console.log(`     ... and ${homePageApiCalls.length - 5} more`);

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 2 — GLOBAL SEARCH "US10020996682"
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 2/8 — Global Search for "US10020996682" …');

    const search1Tracker = createNetworkTracker(page);
    search1Tracker.start();
    const search1Start = Date.now();

    // Click the Global Search textbox in the top area
    const searchInputReady = page.getByRole('textbox', { name: /Global Search/i });
    await expect(searchInputReady).toBeVisible({ timeout: 10_000 });
    await searchInputReady.click();
    await searchInputReady.fill('US10020996682');
    await page.waitForTimeout(300);

    // Press Enter to search
    await searchInputReady.press('Enter');

    // Wait for navigation to search results / detail page
    try {
      await page.waitForResponse(
        resp => (resp.request().resourceType() === 'xhr' || resp.request().resourceType() === 'fetch') && resp.status() < 500,
        { timeout: 30_000 },
      );
    } catch { /* may navigate directly */ }

    const search1NetIdleStart = Date.now();
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(2000); // let data render
    const search1NetworkIdleMs = Date.now() - search1NetIdleStart;
    const search1TimeMs = Date.now() - search1Start;

    search1Tracker.stop();
    const search1ApiCalls = toApiRecords(search1Tracker.getRequests());
    allApiCalls.push(...search1ApiCalls);

    const s1Slowest = slowestApi(search1ApiCalls);
    const search1: SearchProfiling = {
      searchTerm: 'US10020996682',
      searchTimeMs: search1TimeMs,
      networkIdleMs: search1NetworkIdleMs,
      apiCalls: search1ApiCalls,
      totalApiTimeMs: search1ApiCalls.reduce((s, a) => s + a.durationMs, 0),
      slowestApiMs: s1Slowest.durationMs,
      slowestApiUrl: s1Slowest.url,
      resultPageUrl: page.url(),
    };

    console.log(`  ✅ Search "US10020996682" completed in ${search1TimeMs}ms  (${search1ApiCalls.length} API calls)`);
    console.log(`     Navigated to: ${page.url()}`);
    for (const a of search1ApiCalls.slice(0, 8)) {
      const shortUrl = a.url.length > 70 ? '…' + a.url.slice(-69) : a.url;
      console.log(`     ${a.status < 400 ? '✅' : '❌'} [${a.method}] ${a.durationMs}ms | ${a.status} | ${shortUrl}`);
    }
    if (search1ApiCalls.length > 8) console.log(`     ... and ${search1ApiCalls.length - 8} more`);

    // Memory after search 1
    const memAfterSearch1 = await getMemoryMetrics(page);
    if (memAfterSearch1) {
      memorySnapshots.push({ stage: 'After Search "US10020996682"', usedMB: memAfterSearch1.usedJSHeapSizeMB, totalMB: memAfterSearch1.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 3 — NAVIGATE TO / VERIFY DETAIL PAGE
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 3/8 — Verifying detail page …');

    const detailTracker = createNetworkTracker(page);
    detailTracker.start();
    const detailStart = Date.now();

    let dataVisibleTimeMs = 0;
    const alreadyOnDetailPage = page.url().includes('tracking-list-details');

    if (alreadyOnDetailPage) {
      // Search for a specific shipment often navigates directly to its detail page
      console.log(`     ✅ Already on detail page: ${page.url()}`);

      // Wait for detail page content to fully render
      const dataVisibleStart = Date.now();
      try {
        await page.getByText('Shipment Information').first().waitFor({ state: 'visible', timeout: 15_000 });
        dataVisibleTimeMs = Date.now() - dataVisibleStart;
      } catch {
        dataVisibleTimeMs = Date.now() - dataVisibleStart;
      }

      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1500);
    } else {
      // We're on the tracking list — click the shipment row to navigate to detail page
      try {
        await page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForTimeout(500);

        const shipmentLink = page.locator('table tbody tr td a, table tbody tr td [class*="link"]').first();
        await shipmentLink.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {});
        console.log(`     📦 Clicking shipment row to open detail page …`);
        await shipmentLink.click({ force: true, timeout: 15_000 });

        // Wait for navigation to detail page
        try {
          await page.waitForURL(/tracking-list-details/i, { timeout: 30_000, waitUntil: 'load' });
        } catch { /* SPA routing */ }

        // Wait for detail page content to render
        const dataVisibleStart = Date.now();
        try {
          await page.getByText('Shipment Information').first().waitFor({ state: 'visible', timeout: 30_000 });
          dataVisibleTimeMs = Date.now() - dataVisibleStart;
        } catch {
          dataVisibleTimeMs = Date.now() - dataVisibleStart;
        }

        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(2000);
      } catch (err) {
        console.log(`     ⚠️ Could not click shipment row: ${(err as Error).message}`);
      }
    }

    detailTracker.stop();
    const detailApiCalls = toApiRecords(detailTracker.getRequests());
    allApiCalls.push(...detailApiCalls);

    const detailSlowest = slowestApi(detailApiCalls);
    const detailNavigationMs = Date.now() - detailStart;
    const detailPage: DetailPageProfiling = {
      shipmentNumber: 'US10020996682',
      navigationTimeMs: detailNavigationMs,
      networkIdleMs: detailNavigationMs,
      apiCalls: detailApiCalls,
      totalApiTimeMs: detailApiCalls.reduce((s, a) => s + a.durationMs, 0),
      slowestApiMs: detailSlowest.durationMs,
      slowestApiUrl: detailSlowest.url,
      pageUrl: page.url(),
      dataVisibleTimeMs,
    };

    console.log(`  ✅ Detail page loaded in ${detailNavigationMs}ms  (${detailApiCalls.length} API calls)`);
    console.log(`     Data visible in ${dataVisibleTimeMs}ms`);
    console.log(`     Page URL: ${page.url()}`);
    for (const a of detailApiCalls.slice(0, 8)) {
      const shortUrl = a.url.length > 70 ? '…' + a.url.slice(-69) : a.url;
      console.log(`     ${a.status < 400 ? '✅' : '❌'} [${a.method}] ${a.durationMs}ms | ${a.status} | ${shortUrl}`);
    }
    if (detailApiCalls.length > 8) console.log(`     ... and ${detailApiCalls.length - 8} more`);

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 4 — CLICK EACH DETAIL TAB
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 4/8 — Clicking detail page tabs …');

    const detailTabResults: TabSwitchResult[] = [];

    for (const tabName of DETAIL_TABS) {
      const result = await profileDetailTab(page, tabName);
      detailTabResults.push(result);
      allApiCalls.push(...result.apiCalls);

      console.log(
        `    ${ratingIcon(result.dataLoadTimeMs, 500, 2000)} ${tabName.padEnd(25)} ` +
        `switch=${result.switchTimeMs}ms  data=${result.dataLoadTimeMs}ms  ` +
        `apis=${result.apiCalls.length}  slowest=${result.slowestApiMs}ms`
      );
    }

    // Memory after tabs
    const memAfterTabs = await getMemoryMetrics(page);
    if (memAfterTabs) {
      memorySnapshots.push({ stage: 'After Detail Tab Clicks', usedMB: memAfterTabs.usedJSHeapSizeMB, totalMB: memAfterTabs.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 5 — SHIPMENT INFORMATION DROPDOWNS / ACCORDIONS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 5/8 — Expanding Shipment Information sections …');

    // First, make sure we're on the "Shipment Information" tab
    const shipInfoTab = page.getByRole('tab', { name: /Shipment Information/i }).or(
      page.locator('text="Shipment Information"').first()
    );
    const shipInfoVisible = await shipInfoTab.isVisible({ timeout: 5_000 }).catch(() => false);
    if (shipInfoVisible) {
      await shipInfoTab.click().catch(() => {});
      await page.waitForTimeout(1000);
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    }

    const sectionResults: SectionExpandResult[] = [];

    for (const sectionName of SHIPMENT_INFO_SECTIONS) {
      const result = await profileSectionExpand(page, sectionName);
      sectionResults.push(result);
      allApiCalls.push(...result.apiCalls);

      console.log(
        `    ${ratingIcon(result.expandTimeMs, 300, 1000)} ${sectionName.padEnd(25)} ` +
        `expand=${result.expandTimeMs}ms  expanded=${result.isExpanded}  apis=${result.apiCalls.length}`
      );
    }

    // Memory after dropdowns
    const memAfterSections = await getMemoryMetrics(page);
    if (memAfterSections) {
      memorySnapshots.push({ stage: 'After Section Expands', usedMB: memAfterSections.usedJSHeapSizeMB, totalMB: memAfterSections.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 6 — NAVIGATE BACK TO HOME
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 6/8 — Navigating back to Home …');

    const backHomeTracker = createNetworkTracker(page);
    backHomeTracker.start();
    const backHomeStart = Date.now();

    // Click the "Home" link in the top navigation
    const homeLink = page.getByRole('link', { name: /^Home$/i }).or(
      page.locator('a[href*="home"], a[href*="Home"]').first()
    ).or(
      page.locator('text="Home"').first()
    );
    await expect(homeLink.first()).toBeVisible({ timeout: 10_000 });
    await homeLink.first().click();

    // Wait for home page to load
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    backHomeTracker.stop();
    const backToHomeMs = Date.now() - backHomeStart;
    const backToHomeApiCalls = toApiRecords(backHomeTracker.getRequests());
    allApiCalls.push(...backToHomeApiCalls);

    console.log(`  ✅ Returned to Home in ${backToHomeMs}ms  (${backToHomeApiCalls.length} API calls)`);

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 7 — GLOBAL SEARCH "US100"
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 7/8 — Global Search for "US100" …');

    const search2Tracker = createNetworkTracker(page);
    search2Tracker.start();
    const search2Start = Date.now();

    // Click global search again
    const searchInput2Ready = page.getByRole('textbox', { name: /Global Search/i });
    await expect(searchInput2Ready).toBeVisible({ timeout: 10_000 });
    await searchInput2Ready.click();
    await searchInput2Ready.fill('US100');
    await page.waitForTimeout(300);

    // Press Enter
    await searchInput2Ready.press('Enter');

    // Wait for the global-search API response first
    try {
      await page.waitForResponse(
        resp => resp.url().includes('global-search') && resp.status() < 500,
        { timeout: 30_000 },
      );
    } catch { /* fallback to generic wait */ }

    // Wait for the tracking list fetch-shipment-tracking-list API
    try {
      await page.waitForResponse(
        resp => resp.url().includes('fetch-shipment-tracking-list') && resp.status() < 500,
        { timeout: 30_000 },
      );
    } catch { /* may already have completed */ }

    // Wait for the tracking list table rows to become visible
    try {
      await page.locator('table tbody tr, [role="row"]').first().waitFor({ state: 'visible', timeout: 30_000 });
    } catch { /* table may use different structure */ }

    // Wait for full network idle — all shipment data loaded
    const search2NetIdleStart = Date.now();
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(3000); // extra buffer — let all shipment rows render
    const search2NetworkIdleMs = Date.now() - search2NetIdleStart;
    const search2TimeMs = Date.now() - search2Start;

    // Count visible rows in the tracking list
    const search2RowCount = await page.locator('table tbody tr').count().catch(() => 0);
    console.log(`     📋 Tracking list rows loaded: ${search2RowCount}`);

    search2Tracker.stop();
    const search2ApiCalls = toApiRecords(search2Tracker.getRequests());
    allApiCalls.push(...search2ApiCalls);

    const s2Slowest = slowestApi(search2ApiCalls);
    const search2: SearchProfiling = {
      searchTerm: 'US100',
      searchTimeMs: search2TimeMs,
      networkIdleMs: search2NetworkIdleMs,
      apiCalls: search2ApiCalls,
      totalApiTimeMs: search2ApiCalls.reduce((s, a) => s + a.durationMs, 0),
      slowestApiMs: s2Slowest.durationMs,
      slowestApiUrl: s2Slowest.url,
      resultPageUrl: page.url(),
    };

    console.log(`  ✅ Search "US100" completed in ${search2TimeMs}ms  (${search2ApiCalls.length} API calls)`);
    console.log(`     Navigated to: ${page.url()}`);
    for (const a of search2ApiCalls.slice(0, 8)) {
      const shortUrl = a.url.length > 70 ? '…' + a.url.slice(-69) : a.url;
      console.log(`     ${a.status < 400 ? '✅' : '❌'} [${a.method}] ${a.durationMs}ms | ${a.status} | ${shortUrl}`);
    }
    if (search2ApiCalls.length > 8) console.log(`     ... and ${search2ApiCalls.length - 8} more`);

    // Memory after search 2
    const memAfterSearch2 = await getMemoryMetrics(page);
    if (memAfterSearch2) {
      memorySnapshots.push({ stage: 'After Search "US100"', usedMB: memAfterSearch2.usedJSHeapSizeMB, totalMB: memAfterSearch2.totalJSHeapSizeMB });
    }

    consoleTracker.stop();

    // ══════════════════════════════════════════════════════════════════════════
    //  BUILD & SAVE REPORT
    // ══════════════════════════════════════════════════════════════════════════

    const report: GlobalSearchPerfReport = {
      testName: 'Global Search → Shipment Details Performance Profiling',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - testStart,
      browser: browserName || 'unknown',
      homePageLoadMs,
      homePageNetworkIdleMs,
      homePageApiCalls,
      search1,
      detailPage,
      detailTabs: detailTabResults,
      shipmentInfoSections: sectionResults,
      backToHomeMs,
      backToHomeApiCalls,
      search2,
      apiSummary: buildApiSummary(allApiCalls),
      memorySnapshots,
      consoleErrors: consoleTracker.getErrors().map(e => e.text),
    };

    // Print to console
    printReport(report);

    // Save to disk
    saveReport(report);

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(110));
    console.log('  📊 PERFORMANCE SUMMARY');
    console.log('═'.repeat(110));
    console.log(`  Home page load          : ${homePageLoadMs}ms`);
    console.log(`  Search "US10020996682"   : ${search1.searchTimeMs}ms  (${search1.apiCalls.length} APIs)`);
    console.log(`  Detail page data visible: ${detailPage.dataVisibleTimeMs}ms`);
    console.log(`  Tab switches avg        : ${Math.round(detailTabResults.reduce((s, t) => s + t.dataLoadTimeMs, 0) / (detailTabResults.length || 1))}ms`);
    console.log(`  Section expands avg     : ${Math.round(sectionResults.reduce((s, r) => s + r.expandTimeMs, 0) / (sectionResults.length || 1))}ms`);
    console.log(`  Back to Home            : ${backToHomeMs}ms`);
    console.log(`  Search "US100"          : ${search2.searchTimeMs}ms  (${search2.apiCalls.length} APIs)`);
    console.log(`  Total API calls         : ${allApiCalls.length}`);
    console.log(`  Total test duration     : ${((Date.now() - testStart) / 1000).toFixed(1)}s`);
    console.log('═'.repeat(110) + '\n');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  HELPER FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Clicks a detail-page tab and records the switch time, data load, & API calls.
 */
async function profileDetailTab(
  page: import('@playwright/test').Page,
  tabName: DetailTabName,
): Promise<TabSwitchResult> {
  const tracker = createNetworkTracker(page);
  tracker.start();
  const switchStart = Date.now();

  // Find the tab — try role-based first, then text match
  const tab = page.getByRole('tab', { name: new RegExp(escapeRegex(tabName), 'i') });
  const tabExists = await tab.isVisible({ timeout: 5_000 }).catch(() => false);

  if (tabExists) {
    await tab.click();
  } else {
    // Fallback: text match
    const fallback = page.locator(`text="${tabName}"`).first();
    const fbExists = await fallback.isVisible({ timeout: 5_000 }).catch(() => false);
    if (fbExists) {
      await fallback.click();
    } else {
      // Try case-insensitive partial match
      const partial = page.locator(`text=/${escapeRegex(tabName)}/i`).first();
      await partial.click({ timeout: 10_000 }).catch(() => {});
    }
  }

  const switchTimeMs = Date.now() - switchStart;

  // Wait for data load — use a short initial wait to detect if APIs fire,
  // then only wait for networkidle if there was actual network activity.
  const dataStart = Date.now();
  let hadNetworkActivity = false;
  try {
    await page.waitForResponse(
      resp => (resp.request().resourceType() === 'xhr' || resp.request().resourceType() === 'fetch') && resp.status() < 500,
      { timeout: 2_000 }, // Short wait — if no API fires in 2s, data is client-side
    );
    hadNetworkActivity = true;
  } catch { /* data is cached / client-side tab switch */ }

  if (hadNetworkActivity) {
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(500);
  } else {
    await page.waitForTimeout(500); // brief settle for client-side render
  }

  const dataLoadTimeMs = Date.now() - dataStart;
  tracker.stop();

  const apiCalls = toApiRecords(tracker.getRequests());
  const totalApiTimeMs = apiCalls.reduce((s, a) => s + a.durationMs, 0);
  const s = slowestApi(apiCalls);

  return {
    tabName,
    switchTimeMs,
    dataLoadTimeMs,
    apiCalls,
    totalApiTimeMs,
    slowestApiMs: s.durationMs,
    slowestApiUrl: s.url,
  };
}

/**
 * Expands a dropdown/accordion section in the Shipment Information tab
 * and records timing + API calls.
 */
async function profileSectionExpand(
  page: import('@playwright/test').Page,
  sectionName: SectionName,
): Promise<SectionExpandResult> {
  const tracker = createNetworkTracker(page);
  tracker.start();
  const expandStart = Date.now();

  let isExpanded = false;

  try {
    // Use .or() chaining for Playwright-compatible locator resolution
    const sectionHeader = page.locator(`[role="button"]:has-text("${sectionName}")`)
      .or(page.locator(`button:has-text("${sectionName}")`))
      .or(page.locator(`a[role="tab"]:has-text("${sectionName}")`))
      .or(page.locator(`summary:has-text("${sectionName}")`))
      .or(page.locator(`h3:has-text("${sectionName}")`))
      .or(page.locator(`h4:has-text("${sectionName}")`))
      .or(page.locator(`h5:has-text("${sectionName}")`))
      .or(page.getByText(sectionName, { exact: true }));

    const headerVisible = await sectionHeader.first().isVisible({ timeout: 5_000 }).catch(() => false);

    if (headerVisible) {
      await sectionHeader.first().scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(200);
      await sectionHeader.first().click({ timeout: 5_000 });
      await page.waitForTimeout(600);

      // Detect if the section actually expanded:
      // 1. Check aria-expanded attribute on the header or nearby element
      // 2. Look for newly visible content panel adjacent to the header
      const ariaExpanded = await sectionHeader.first().getAttribute('aria-expanded').catch(() => null);
      if (ariaExpanded === 'true') {
        isExpanded = true;
      } else {
        // PrimeNG accordion: check the parent/sibling for expanded state
        const parentExpanded = await sectionHeader.first()
          .locator('xpath=ancestor::*[contains(@class,"accordion")]')
          .first()
          .evaluate(el => el.classList.contains('ui-accordion-content-wrapper-overflown') === false)
          .catch(() => null);
        if (parentExpanded !== null) {
          isExpanded = true;
        } else {
          // If click was successful and header was visible, assume expanded
          isExpanded = true;
        }
      }

      // Wait briefly for any API call triggered by expansion
      try {
        await page.waitForResponse(
          resp => (resp.request().resourceType() === 'xhr' || resp.request().resourceType() === 'fetch') && resp.status() < 500,
          { timeout: 2_000 },
        );
      } catch { /* section may expand client-side only */ }

      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    } else {
      // Try a more aggressive text search as last resort
      const textMatch = page.getByText(sectionName).first();
      const textVisible = await textMatch.isVisible({ timeout: 3_000 }).catch(() => false);
      if (textVisible) {
        await textMatch.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
        await textMatch.click({ timeout: 5_000 });
        await page.waitForTimeout(600);
        isExpanded = true;
      }
    }
  } catch (err) {
    isExpanded = false;
  }

  const expandTimeMs = Date.now() - expandStart;
  tracker.stop();
  const apiCalls = toApiRecords(tracker.getRequests());

  return {
    sectionName,
    expandTimeMs,
    isExpanded,
    apiCalls,
  };
}

/** Escape special regex characters */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
