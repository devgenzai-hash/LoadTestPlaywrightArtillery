/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DATA MANAGEMENT → EVENT MANAGER — PERFORMANCE TEST
 *
 *  End-to-end performance profiling flow:
 *
 *  1. Login → Home Page — record page load time
 *  2. Click "Data Management" in the nav → open dropdown
 *  3. Click "Event Manager" from the dropdown → record navigation time
 *  4. Search comma-separated shipment numbers in the search box
 *     • If a single shipment is searched → result is displayed directly
 *       → record time to display result + all API timings
 *     • If multiple shipments are searched → multiple blocks appear
 *       → record time for blocks to appear
 *       → click each block → record time to fetch & display detail
 *  5. Capture all API calls, timings, memory snapshots, console errors
 *  6. Pretty-print full report & save JSON + TXT to EventManagerPerf/
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

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CONFIGURABLE SHIPMENT NUMBERS — Modify this array as needed            ║
// ║  Shipments will be searched as a comma-separated string.                ║
// ║  • Single entry  → direct result display                               ║
// ║  • Multiple      → blocks appear; each is clicked to load details      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
const SHIPMENT_NUMBERS: string[] = [
  'US10021070277',
  '1147510570',
];

// ── Constants ────────────────────────────────────────────────────────────────

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

interface ShipmentBlockResult {
  shipmentNumber: string;
  blockClickTimeMs: number;
  detailLoadTimeMs: number;
  networkIdleMs: number;
  apiCalls: ApiCallRecord[];
  totalApiTimeMs: number;
  slowestApiMs: number;
  slowestApiUrl: string;
}

interface EventManagerPerfReport {
  testName: string;
  timestamp: string;
  durationMs: number;
  browser: string;

  // Shipments searched
  shipmentNumbers: string[];
  searchString: string;

  // Home page
  homePageLoadMs: number;

  // Navigation: Data Management → Event Manager
  dataManagementClickMs: number;
  eventManagerNavMs: number;
  eventManagerPageLoadMs: number;

  // Search execution
  searchInputTimeMs: number;
  searchExecutionMs: number;
  searchResultDisplayMs: number;
  searchNetworkIdleMs: number;
  searchApiCalls: ApiCallRecord[];

  // Result mode
  resultMode: 'single' | 'multiple';

  // Single-result direct display timing (only if single)
  singleResultLoadMs: number;

  // Multiple-result block timings (only if multiple)
  blocksAppearTimeMs: number;
  blockCount: number;
  blockResults: ShipmentBlockResult[];

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
    slowCalls: durations.filter(d => d > 3000).length,
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

function buildTextReport(r: EventManagerPerfReport): string {
  const HR = '═'.repeat(110);
  const hr = '─'.repeat(110);
  const lines: string[] = [];
  const w = (s = '') => lines.push(s);

  w();
  w(`╔${HR}╗`);
  w(`║${'DATA MANAGEMENT → EVENT MANAGER PERFORMANCE REPORT'.padStart(80).padEnd(110)}║`);
  w(`╠${HR}╣`);
  w(`║  Timestamp       : ${r.timestamp.padEnd(89)}║`);
  w(`║  Browser         : ${r.browser.padEnd(89)}║`);
  w(`║  Duration        : ${((r.durationMs / 1000).toFixed(1) + 's').padEnd(89)}║`);
  w(`║  Shipments       : ${r.searchString.padEnd(89)}║`);
  w(`║  Result Mode     : ${r.resultMode.padEnd(89)}║`);
  w(`╠${HR}╣`);

  // ── HOME PAGE ──
  w(`║  ── 1. HOME PAGE LOAD ──`.padEnd(111) + '║');
  w(`║  ${ratingIcon(r.homePageLoadMs)} Page load time       : ${String(r.homePageLoadMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║${''.padEnd(110)}║`);

  // ── DATA MANAGEMENT → EVENT MANAGER NAVIGATION ──
  w(`╠${HR}╣`);
  w(`║  ── 2. DATA MANAGEMENT → EVENT MANAGER NAVIGATION ──`.padEnd(111) + '║');
  w(`║  ${ratingIcon(r.dataManagementClickMs, 500, 2000)} Data Management click     : ${String(r.dataManagementClickMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║  ${ratingIcon(r.eventManagerNavMs)} Event Manager click       : ${String(r.eventManagerNavMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║  ${ratingIcon(r.eventManagerPageLoadMs)} Event Manager page load   : ${String(r.eventManagerPageLoadMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║${''.padEnd(110)}║`);

  // ── SEARCH ──
  w(`╠${HR}╣`);
  w(`║  ── 3. SEARCH EXECUTION — "${r.searchString}" ──`.padEnd(111) + '║');
  w(`║  ${ratingIcon(r.searchInputTimeMs, 300, 1000)} Search input fill        : ${String(r.searchInputTimeMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║  ${ratingIcon(r.searchExecutionMs)} Search execution (click)  : ${String(r.searchExecutionMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║  ${ratingIcon(r.searchResultDisplayMs)} Result display time       : ${String(r.searchResultDisplayMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    Network idle time       : ${String(r.searchNetworkIdleMs).padStart(6)}ms`.padEnd(111) + '║');
  w(`║    Search API calls        : ${String(r.searchApiCalls.length).padStart(6)}`.padEnd(111) + '║');

  if (r.searchApiCalls.length > 0) {
    w(`║  ${hr.slice(0, 108)}║`);
    w(`║  ${'METHOD'.padEnd(8)} ${'STATUS'.padStart(6)}  ${'DURATION'.padStart(10)}  URL`.padEnd(111) + '║');
    w(`║  ${hr.slice(0, 108)}║`);
    for (const a of r.searchApiCalls.slice(0, 20)) {
      const shortUrl = a.url.length > 72 ? '…' + a.url.slice(-71) : a.url;
      const icon = a.status < 400 ? '✅' : '❌';
      w(`║  ${icon} ${a.method.padEnd(8)} ${String(a.status).padStart(6)}  ${String(a.durationMs).padStart(8)}ms  ${shortUrl}`.padEnd(111) + '║');
    }
    if (r.searchApiCalls.length > 20)
      w(`║  ... and ${r.searchApiCalls.length - 20} more API calls`.padEnd(111) + '║');
  }
  w(`║${''.padEnd(110)}║`);

  // ── RESULTS ──
  w(`╠${HR}╣`);
  if (r.resultMode === 'single') {
    w(`║  ── 4. SINGLE RESULT — DIRECT DISPLAY ──`.padEnd(111) + '║');
    w(`║  ${ratingIcon(r.singleResultLoadMs)} Result load time      : ${String(r.singleResultLoadMs).padStart(6)}ms`.padEnd(111) + '║');
  } else {
    w(`║  ── 4. MULTIPLE RESULTS — SHIPMENT BLOCKS ──`.padEnd(111) + '║');
    w(`║  ${ratingIcon(r.blocksAppearTimeMs)} Blocks appear time    : ${String(r.blocksAppearTimeMs).padStart(6)}ms`.padEnd(111) + '║');
    w(`║    Block count              : ${String(r.blockCount).padStart(6)}`.padEnd(111) + '║');
    w(`║${''.padEnd(110)}║`);

    if (r.blockResults.length > 0) {
      w(`║  ${'SHIPMENT'.padEnd(25)} ${'BLOCK CLICK'.padStart(12)}  ${'DETAIL LOAD'.padStart(12)}  ${'NET IDLE'.padStart(10)}  ${'APIs'.padStart(5)}  ${'SLOWEST'.padStart(9)}  RATING`.padEnd(111) + '║');
      w(`║  ${hr.slice(0, 108)}║`);
      for (const b of r.blockResults) {
        w(`║  ${ratingIcon(b.detailLoadTimeMs)} ${b.shipmentNumber.padEnd(23)} ${String(b.blockClickTimeMs).padStart(10)}ms  ${String(b.detailLoadTimeMs).padStart(10)}ms  ${String(b.networkIdleMs).padStart(8)}ms  ${String(b.apiCalls.length).padStart(5)}  ${String(b.slowestApiMs).padStart(7)}ms`.padEnd(111) + '║');
      }
    }
  }
  w(`║${''.padEnd(110)}║`);

  // ── AGGREGATE API SUMMARY ──
  w(`╠${HR}╣`);
  w(`║  ── AGGREGATE API STATISTICS ──`.padEnd(111) + '║');
  w(`║  Total API calls   : ${String(r.apiSummary.totalCalls).padStart(6)}`.padEnd(111) + '║');
  w(`║  Failed calls      : ${String(r.apiSummary.failedCalls).padStart(6)}`.padEnd(111) + '║');
  w(`║  Slow calls (>3s)  : ${String(r.apiSummary.slowCalls).padStart(6)}`.padEnd(111) + '║');
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

function saveReport(report: EventManagerPerfReport) {
  const ts = getTimestamp();
  const outDir = path.resolve(__dirname, '..', '..', 'EventManagerPerf');
  ensureDir(outDir);

  const jsonFile = path.join(outDir, `event-manager-perf-${ts}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), 'utf-8');

  const txtFile = path.join(outDir, `event-manager-perf-${ts}.txt`);
  fs.writeFileSync(txtFile, buildTextReport(report), 'utf-8');

  console.log(`\n  📄 JSON report saved → ${jsonFile}`);
  console.log(`  📝 Text report saved → ${txtFile}`);
}

function printReport(r: EventManagerPerfReport) {
  console.log(buildTextReport(r));
}

// ═════════════════════════════════════════════════════════════════════════════
//  TEST
// ═════════════════════════════════════════════════════════════════════════════

test.describe('📦 Data Management → Event Manager Performance Profiling', () => {

  test.setTimeout(480_000); // 8 minutes

  test('EMP-01: Event Manager search & result display — full performance profile', async ({ page, context, browserName }) => {

    const testStart = Date.now();
    const allApiCalls: ApiCallRecord[] = [];
    const memorySnapshots: Array<{ stage: string; usedMB: number; totalMB: number }> = [];

    // Console error tracker
    const consoleTracker = createConsoleTracker(page);
    consoleTracker.start();

    const searchString = SHIPMENT_NUMBERS.join(',');

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 1 — LOGIN & HOME PAGE LOAD
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(110));
    console.log('  DATA MANAGEMENT → EVENT MANAGER PERFORMANCE PROFILING');
    console.log('  Shipments: ' + searchString);
    console.log('═'.repeat(110));
    console.log('\n  ⏳ Step 1/5 — Logging in & loading Home Page …');

    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    const homeTracker = createNetworkTracker(page);
    homeTracker.start();
    const homeLoadStart = Date.now();

    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await page.waitForTimeout(1500);
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

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 2 — NAVIGATE TO DATA MANAGEMENT → EVENT MANAGER
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 2/5 — Navigating to Data Management → Event Manager …');

    // --- Click "Data Management" to open its submenu (PrimeNG menubar) ---
    const dmClickStart = Date.now();

    // Target the exact PrimeNG menubar item link containing "Data Management"
    const dataManagementMenu = page.locator('span.p-menubar-item-label:text-is("Data Management")');

    await expect(dataManagementMenu).toBeVisible({ timeout: 15_000 });

    // Click "Data Management" to open the dropdown submenu
    await dataManagementMenu.click();
    await page.waitForTimeout(1500); // wait for PrimeNG submenu dropdown to animate open
    const dataManagementClickMs = Date.now() - dmClickStart;

    console.log(`  ✅ Data Management dropdown opened in ${dataManagementClickMs}ms`);

    // --- Now "Event Manager" should be visible in the open submenu ---
    const emNavTracker = createNetworkTracker(page);
    emNavTracker.start();
    const emNavStart = Date.now();

    // Target the Event Manager link using its unique href (resolves to "#/3pl/event-manager")
    // This avoids ambiguity since there may be multiple "Event Manager" labels in different submenus
    const eventManagerLink = page.locator('a[href*="event-manager"]');

    // Wait for the submenu item to appear after clicking Data Management
    await expect(eventManagerLink).toBeVisible({ timeout: 10_000 });
    await eventManagerLink.click();
    const eventManagerNavMs = Date.now() - emNavStart;

    // Wait for Event Manager page to fully load
    const emPageLoadStart = Date.now();
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const eventManagerPageLoadMs = Date.now() - emPageLoadStart;

    emNavTracker.stop();
    const emNavApiCalls = toApiRecords(emNavTracker.getRequests());
    allApiCalls.push(...emNavApiCalls);

    // Memory after navigation
    const memAfterNav = await getMemoryMetrics(page);
    if (memAfterNav) {
      memorySnapshots.push({ stage: 'After Event Manager Load', usedMB: memAfterNav.usedJSHeapSizeMB, totalMB: memAfterNav.totalJSHeapSizeMB });
    }

    console.log(`  ✅ Event Manager page loaded — nav=${eventManagerNavMs}ms  pageLoad=${eventManagerPageLoadMs}ms  (${emNavApiCalls.length} API calls)`);
    console.log(`     Page URL: ${page.url()}`);

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 3 — SEARCH SHIPMENT(S)
    // ══════════════════════════════════════════════════════════════════════════
    console.log(`\n  ⏳ Step 3/5 — Searching for "${searchString}" …`);

    // Find the search box
    const searchBox = page.getByRole('textbox', { name: /search/i }).first()
      .or(page.locator('input[type="search"], input[placeholder*="Search" i], input[placeholder*="search" i], input[class*="search" i]').first());

    await expect(searchBox).toBeVisible({ timeout: 15_000 });

    // Fill the search box
    const searchInputStart = Date.now();
    await searchBox.click();
    await searchBox.fill(searchString);
    await page.waitForTimeout(300);
    const searchInputTimeMs = Date.now() - searchInputStart;

    // Click the search icon / button
    const searchTracker = createNetworkTracker(page);
    searchTracker.start();
    const searchExecStart = Date.now();

    // Try to find the search icon/button - could be a button, icon, or SVG near the search box
    const searchButton = page.locator('button:has(svg), button:has(i), [class*="search-icon"], [class*="search-btn"], button[aria-label*="search" i], [role="button"]:near(input)').first()
      .or(page.getByRole('button', { name: /search/i }).first());

    const searchBtnVisible = await searchButton.isVisible({ timeout: 5_000 }).catch(() => false);

    if (searchBtnVisible) {
      await searchButton.click();
    } else {
      // Fallback: press Enter in the search box
      await searchBox.press('Enter');
    }

    const searchExecutionMs = Date.now() - searchExecStart;

    // Wait for search API response(s)
    try {
      await page.waitForResponse(
        resp => (resp.request().resourceType() === 'xhr' || resp.request().resourceType() === 'fetch') && resp.status() < 500,
        { timeout: 30_000 },
      );
    } catch { /* may resolve immediately */ }

    // Wait for results to appear — this is the result display time
    const resultDisplayStart = Date.now();
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const searchResultDisplayMs = Date.now() - resultDisplayStart;

    const searchNetIdleStart = Date.now();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    const searchNetworkIdleMs = Date.now() - searchNetIdleStart;

    searchTracker.stop();
    const searchApiCalls = toApiRecords(searchTracker.getRequests());
    allApiCalls.push(...searchApiCalls);

    const searchSlowest = slowestApi(searchApiCalls);
    console.log(`  ✅ Search executed — exec=${searchExecutionMs}ms  resultDisplay=${searchResultDisplayMs}ms  (${searchApiCalls.length} API calls)`);
    if (searchSlowest.durationMs > 0) {
      const shortUrl = searchSlowest.url.length > 70 ? '…' + searchSlowest.url.slice(-69) : searchSlowest.url;
      console.log(`     Slowest API: ${searchSlowest.durationMs}ms — ${shortUrl}`);
    }
    for (const a of searchApiCalls.slice(0, 10)) {
      const shortUrl = a.url.length > 70 ? '…' + a.url.slice(-69) : a.url;
      console.log(`     ${a.status < 400 ? '✅' : '❌'} [${a.method}] ${a.durationMs}ms | ${a.status} | ${shortUrl}`);
    }
    if (searchApiCalls.length > 10) console.log(`     ... and ${searchApiCalls.length - 10} more`);

    // Memory after search
    const memAfterSearch = await getMemoryMetrics(page);
    if (memAfterSearch) {
      memorySnapshots.push({ stage: 'After Search Execution', usedMB: memAfterSearch.usedJSHeapSizeMB, totalMB: memAfterSearch.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 4 — DETERMINE RESULT MODE & PROFILE
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 4/5 — Profiling search results …');

    let resultMode: 'single' | 'multiple' = 'single';
    let singleResultLoadMs = 0;
    let blocksAppearTimeMs = 0;
    let blockCount = 0;
    const blockResults: ShipmentBlockResult[] = [];

    // Detect if multiple shipment blocks appeared or single result is displayed
    // Look for multiple result blocks/cards/rows
    // Common patterns: cards, accordion blocks, table rows, list items with shipment info
    const resultBlocks = page.locator(
      '[class*="card"]:visible, [class*="block"]:visible, [class*="result-item"]:visible, ' +
      '[class*="shipment-card"]:visible, [class*="event-card"]:visible, ' +
      'table tbody tr:visible, [class*="accordion"]:visible, [class*="panel"]:visible'
    );

    await page.waitForTimeout(1000);

    // Try to count clickable result blocks
    const blockElements = await resultBlocks.count().catch(() => 0);

    // Determine if we got direct single result or multiple blocks
    // For single shipment search with direct result, there often won't be "blocks" to click
    if (SHIPMENT_NUMBERS.length === 1 || blockElements <= 1) {
      resultMode = 'single';
      console.log(`  📋 Single result mode detected`);

      // The result was already displayed after the search
      singleResultLoadMs = searchResultDisplayMs;

      console.log(`  ✅ Single result loaded in ${singleResultLoadMs}ms`);
    } else {
      resultMode = 'multiple';
      blocksAppearTimeMs = searchResultDisplayMs;

      // Try to find distinct clickable result blocks more specifically
      // Look for elements that could represent individual shipment results
      const shipmentBlocks = page.locator(
        '[class*="card"]:visible, [class*="result"]:visible, [class*="shipment"]:visible, ' +
        '[class*="event-item"]:visible, [class*="list-item"]:visible, ' +
        'table tbody tr:visible, [class*="accordion-tab"]:visible, [class*="p-accordion-tab"]:visible'
      );

      blockCount = await shipmentBlocks.count().catch(() => 0);
      console.log(`  📋 Multiple result mode — ${blockCount} blocks detected (appear in ${blocksAppearTimeMs}ms)`);

      // Click each block and measure detail loading time
      const maxBlocksToProfile = Math.min(blockCount, SHIPMENT_NUMBERS.length, 10); // Cap at 10

      for (let i = 0; i < maxBlocksToProfile; i++) {
        const block = shipmentBlocks.nth(i);
        const blockVisible = await block.isVisible({ timeout: 5_000 }).catch(() => false);
        if (!blockVisible) continue;

        const blockTracker = createNetworkTracker(page);
        blockTracker.start();
        const blockClickStart = Date.now();

        // Try to get shipment number text from the block
        const blockText = await block.innerText().catch(() => `Block ${i + 1}`);
        const shipmentLabel = SHIPMENT_NUMBERS[i] || blockText.substring(0, 30).trim();

        try {
          await block.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
          await block.click({ timeout: 10_000 });
        } catch {
          console.log(`     ⚠️ Could not click block ${i + 1}`);
          blockTracker.stop();
          continue;
        }

        const blockClickTimeMs = Date.now() - blockClickStart;

        // Wait for detail to load after clicking the block
        const detailStart = Date.now();
        try {
          await page.waitForResponse(
            resp => (resp.request().resourceType() === 'xhr' || resp.request().resourceType() === 'fetch') && resp.status() < 500,
            { timeout: 15_000 },
          );
        } catch { /* detail may load client-side */ }

        const netIdleStart = Date.now();
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const networkIdleMs = Date.now() - netIdleStart;
        const detailLoadTimeMs = Date.now() - detailStart;

        blockTracker.stop();
        const blockApiCalls = toApiRecords(blockTracker.getRequests());
        allApiCalls.push(...blockApiCalls);
        const bSlowest = slowestApi(blockApiCalls);

        const blockResult: ShipmentBlockResult = {
          shipmentNumber: shipmentLabel,
          blockClickTimeMs,
          detailLoadTimeMs,
          networkIdleMs,
          apiCalls: blockApiCalls,
          totalApiTimeMs: blockApiCalls.reduce((s, a) => s + a.durationMs, 0),
          slowestApiMs: bSlowest.durationMs,
          slowestApiUrl: bSlowest.url,
        };

        blockResults.push(blockResult);

        console.log(
          `    ${ratingIcon(detailLoadTimeMs)} Block ${i + 1} (${shipmentLabel.substring(0, 20)}) — ` +
          `click=${blockClickTimeMs}ms  detail=${detailLoadTimeMs}ms  ` +
          `apis=${blockApiCalls.length}  slowest=${bSlowest.durationMs}ms`
        );
      }
    }

    // Memory after results
    const memAfterResults = await getMemoryMetrics(page);
    if (memAfterResults) {
      memorySnapshots.push({ stage: 'After Result Profiling', usedMB: memAfterResults.usedJSHeapSizeMB, totalMB: memAfterResults.totalJSHeapSizeMB });
    }

    consoleTracker.stop();

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 5 — BUILD & SAVE REPORT
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 5/5 — Building report …');

    const report: EventManagerPerfReport = {
      testName: 'Data Management → Event Manager Performance Profiling',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - testStart,
      browser: browserName || 'unknown',

      shipmentNumbers: SHIPMENT_NUMBERS,
      searchString,

      homePageLoadMs,

      dataManagementClickMs,
      eventManagerNavMs,
      eventManagerPageLoadMs,

      searchInputTimeMs,
      searchExecutionMs,
      searchResultDisplayMs,
      searchNetworkIdleMs,
      searchApiCalls,

      resultMode,
      singleResultLoadMs,
      blocksAppearTimeMs,
      blockCount,
      blockResults,

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
    console.log('  📊 EVENT MANAGER PERFORMANCE SUMMARY');
    console.log('═'.repeat(110));
    console.log(`  Home page load            : ${homePageLoadMs}ms`);
    console.log(`  Data Mgmt dropdown click  : ${dataManagementClickMs}ms`);
    console.log(`  Event Manager nav         : ${eventManagerNavMs}ms`);
    console.log(`  Event Manager page load   : ${eventManagerPageLoadMs}ms`);
    console.log(`  Search input              : ${searchInputTimeMs}ms`);
    console.log(`  Search execution          : ${searchExecutionMs}ms`);
    console.log(`  Result display            : ${searchResultDisplayMs}ms`);
    if (resultMode === 'single') {
      console.log(`  Single result load        : ${singleResultLoadMs}ms`);
    } else {
      console.log(`  Blocks appear time        : ${blocksAppearTimeMs}ms  (${blockCount} blocks)`);
      for (const b of blockResults) {
        console.log(`    ${b.shipmentNumber.substring(0, 20).padEnd(22)} click=${b.blockClickTimeMs}ms  detail=${b.detailLoadTimeMs}ms`);
      }
    }
    console.log(`  Total API calls           : ${allApiCalls.length}`);
    console.log(`  Total test duration       : ${((Date.now() - testStart) / 1000).toFixed(1)}s`);
    console.log('═'.repeat(110) + '\n');
  });
});
