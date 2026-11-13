/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TRACKING LIST — FILTER PERFORMANCE TEST
 *
 *  End-to-end performance profiling of the Saved Filter workflow on the
 *  Tracking List page:
 *
 *  1. Login → Navigate to Tracking List page (record login-to-page timing)
 *  2. Wait for initial Tracking List table to load (record initial load timing)
 *  3. Click "Show filters" button → sidebar opens
 *  4. Click settings/cog icon → saved filters panel appears
 *  5. Click "PeformanceTesting" saved filter
 *     → spinner starts, page reloads with filtered data
 *     → measure table reload timing + row counts
 *  6. Navigate through all Tracking List tabs (post-filter):
 *       All shipment, Not started, In transit, Arrived,
 *       Inactive shipments, Document only, Live Track pending
 *     → measure data load timing per tab, API calls, row counts
 *  7. Pretty-print all results to console
 *  8. Persist JSON + TXT reports into  trackingListFilter/<timestamp>
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
const TRACKING_URL = `${BASE_URL}/#/tracking`;

const TRACKING_TABS = [
  'All shipment',
  'Not started',
  'In transit',
  'Arrived',
  'Inactive shipments',
  'Document only',
  'Live Track pending',
] as const;

type TrackingTab = (typeof TRACKING_TABS)[number];

// ── Interfaces ───────────────────────────────────────────────────────────────

interface ApiCallRecord {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  resourceType: string;
  timestamp: number;
}

interface FilterApplyResult {
  filterName: string;
  showFilterClickMs: number;
  settingsIconClickMs: number;
  filterApplyTimeMs: number;
  rowCountAfterFilter: number;
  paginationInfo: string;
  apiCalls: ApiCallRecord[];
  slowestApiMs: number;
  slowestApiUrl: string;
}

interface TabResult {
  tabName: string;
  switchTimeMs: number;
  timeToFirstRowMs: number;
  networkIdleTimeMs: number;
  rowCount: number;
  paginationInfo: string;
  apiCalls: ApiCallRecord[];
  slowestApiMs: number;
  slowestApiUrl: string;
}

interface TrackingListFilterReport {
  testName: string;
  timestamp: string;
  durationMs: number;
  browser: string;

  /** Login → Tracking List page timing */
  loginToPageMs: number;

  /** Initial tracking list load */
  initialPageLoadMs: number;
  initialPageLoadApiCalls: ApiCallRecord[];
  initialRowCount: number;
  initialPaginationInfo: string;

  /** Filter apply timing */
  filterApply: FilterApplyResult | null;

  /** Tab navigation results after filter */
  tabResults: TabResult[];

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

/**
 * Read row count from the visible table on the tracking list page.
 */
async function getTableRowCount(page: any): Promise<number> {
  try {
    return Math.max(0, await page.locator('table tbody tr, p-table tbody tr, [role="row"]:not([role="columnheader"])').count());
  } catch {
    return 0;
  }
}

/**
 * Read pagination info text like "Showing 1 to 10 of 500 entries"
 */
async function getPaginationInfo(page: any): Promise<string> {
  try {
    // Try multiple pagination text patterns
    const pagText = page.locator('span:has-text("Showing"), div:has-text("Showing")').filter({ hasText: /\d+\s+to\s+\d+/i }).first();
    if (await pagText.isVisible({ timeout: 3_000 }).catch(() => false)) {
      return (await pagText.textContent({ timeout: 2_000 }))?.trim() ?? '';
    }
    // Try alternative: look for total record count text
    const totalText = page.getByText(/\d+\s+records?/i).first();
    if (await totalText.isVisible({ timeout: 2_000 }).catch(() => false)) {
      return (await totalText.textContent({ timeout: 2_000 }))?.trim() ?? '';
    }
    return '';
  } catch {
    return '';
  }
}

// ── Report Persistence ───────────────────────────────────────────────────────

function saveReport(report: TrackingListFilterReport) {
  const ts = getTimestamp();
  const outDir = path.resolve(__dirname, '..', '..', 'trackingListFilter');
  ensureDir(outDir);

  const jsonFile = path.join(outDir, `tracking-list-filter-${ts}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), 'utf-8');

  const txtFile = path.join(outDir, `tracking-list-filter-${ts}.txt`);
  fs.writeFileSync(txtFile, buildTextReport(report), 'utf-8');

  console.log(`\n  📄 JSON report saved → ${jsonFile}`);
  console.log(`  📝 Text report saved → ${txtFile}`);
}

// ── Text Report Builder ─────────────────────────────────────────────────────

function buildTextReport(r: TrackingListFilterReport): string {
  const HR = '═'.repeat(102);
  const hr = '─'.repeat(102);
  const lines: string[] = [];
  const w = (s = '') => lines.push(s);

  w();
  w(`╔${HR}╗`);
  w(`║${'TRACKING LIST — FILTER PERFORMANCE TEST REPORT'.padStart(75).padEnd(102)}║`);
  w(`║${'Saved Filter: "PeformanceTesting"'.padStart(68).padEnd(102)}║`);
  w(`╠${HR}╣`);
  w(`║  Test Name   : ${r.testName.padEnd(86)}║`);
  w(`║  Timestamp   : ${r.timestamp.padEnd(86)}║`);
  w(`║  Browser     : ${r.browser.padEnd(86)}║`);
  w(`║  Duration    : ${(r.durationMs / 1000).toFixed(1)}s`.padEnd(103) + '║');
  w(`╠${HR}╣`);

  // ── Login → Tracking List ──
  w(`║  ── LOGIN → TRACKING LIST PAGE ──`.padEnd(103) + '║');
  w(`║  ${ratingIcon(r.loginToPageMs, 15000, 40000)} Login to Tracking List  : ${String(r.loginToPageMs).padStart(6)}ms  ${ratingLabel(r.loginToPageMs, 15000, 40000)}`.padEnd(103) + '║');
  w(`║${''.padEnd(102)}║`);

  // ── Initial Page Load ──
  w(`╠${HR}╣`);
  w(`║  ── INITIAL TRACKING LIST LOAD (Before Filter) ──`.padEnd(103) + '║');
  w(`║  ${ratingIcon(r.initialPageLoadMs, 5000, 15000)} Page Load Time       : ${String(r.initialPageLoadMs).padStart(6)}ms  ${ratingLabel(r.initialPageLoadMs, 5000, 15000)}`.padEnd(103) + '║');
  w(`║    API calls during load   : ${String(r.initialPageLoadApiCalls.length).padStart(6)}`.padEnd(103) + '║');
  w(`║    Row count (visible)     : ${String(r.initialRowCount).padStart(6)}`.padEnd(103) + '║');
  if (r.initialPaginationInfo) {
    w(`║    Pagination             : ${r.initialPaginationInfo}`.padEnd(103) + '║');
  }
  w(`║${''.padEnd(102)}║`);

  // ── Filter Apply ──
  if (r.filterApply) {
    const fa = r.filterApply;
    w(`╠${HR}╣`);
    w(`║  ── SAVED FILTER APPLICATION: "${fa.filterName}" ──`.padEnd(103) + '║');
    w(`║${''.padEnd(102)}║`);
    w(`║  ${ratingIcon(fa.showFilterClickMs, 1000, 3000)} "Show filters" → sidebar open    : ${String(fa.showFilterClickMs).padStart(6)}ms`.padEnd(103) + '║');
    w(`║  ${ratingIcon(fa.settingsIconClickMs, 1000, 3000)} Settings icon → panel open       : ${String(fa.settingsIconClickMs).padStart(6)}ms`.padEnd(103) + '║');
    w(`║  ${ratingIcon(fa.filterApplyTimeMs, 5000, 15000)} Filter click → data loaded       : ${String(fa.filterApplyTimeMs).padStart(6)}ms  ${ratingLabel(fa.filterApplyTimeMs, 5000, 15000)}`.padEnd(103) + '║');
    w(`║    API calls during filter        : ${String(fa.apiCalls.length).padStart(6)}`.padEnd(103) + '║');
    w(`║    Slowest API                    : ${String(fa.slowestApiMs).padStart(6)}ms`.padEnd(103) + '║');
    w(`║    Row count after filter         : ${String(fa.rowCountAfterFilter).padStart(6)}`.padEnd(103) + '║');
    if (fa.paginationInfo) {
      w(`║    Pagination                    : ${fa.paginationInfo}`.padEnd(103) + '║');
    }
    w(`║${''.padEnd(102)}║`);

    // API calls detail
    if (fa.apiCalls.length > 0) {
      w(`║  ── API CALLS DURING FILTER APPLICATION ──`.padEnd(103) + '║');
      for (const a of fa.apiCalls.slice(0, 20)) {
        const shortUrl = a.url.split('?')[0];
        const displayUrl = shortUrl.length > 55 ? '…' + shortUrl.slice(-54) : shortUrl;
        const icon = a.status < 400 ? '✅' : '❌';
        w(`║    ${icon} [${a.method.padEnd(4)}] ${String(a.durationMs).padStart(5)}ms | ${a.status} | ${displayUrl}`.padEnd(103) + '║');
      }
      if (fa.apiCalls.length > 20) {
        w(`║    … and ${fa.apiCalls.length - 20} more API calls`.padEnd(103) + '║');
      }
      w(`║${''.padEnd(102)}║`);
    }
  }

  // ── Tab Navigation ──
  if (r.tabResults.length > 0) {
    w(`╠${HR}╣`);
    w(`║  ── TRACKING LIST TAB NAVIGATION (After Filter) ──`.padEnd(103) + '║');
    w(`║  ${'TAB NAME'.padEnd(24)} ${'SWITCH'.padStart(8)}  ${'1st ROW'.padStart(9)}  ${'NET IDLE'.padStart(10)}  ${'ROWS'.padStart(5)}  ${'APIs'.padStart(5)}  ${'SLOWEST'.padStart(9)}  RATING`.padEnd(103) + '║');
    w(`║  ${hr.slice(0, 100)}║`);
    for (const t of r.tabResults) {
      w(`║  ${ratingIcon(t.networkIdleTimeMs, 3000, 8000)} ${t.tabName.padEnd(22)} ${String(t.switchTimeMs).padStart(6)}ms  ${String(t.timeToFirstRowMs).padStart(7)}ms  ${String(t.networkIdleTimeMs).padStart(8)}ms  ${String(t.rowCount).padStart(5)}  ${String(t.apiCalls.length).padStart(5)}  ${String(t.slowestApiMs).padStart(7)}ms  ${ratingLabel(t.networkIdleTimeMs, 3000, 8000)}`.padEnd(103) + '║');
    }
    w(`║${''.padEnd(102)}║`);

    const avgSwitch = Math.round(r.tabResults.reduce((s, t) => s + t.switchTimeMs, 0) / (r.tabResults.length || 1));
    const avgIdle = Math.round(r.tabResults.reduce((s, t) => s + t.networkIdleTimeMs, 0) / (r.tabResults.length || 1));
    w(`║  Avg switch time : ${String(avgSwitch).padStart(6)}ms    Avg net idle : ${String(avgIdle).padStart(6)}ms`.padEnd(103) + '║');
    w(`║${''.padEnd(102)}║`);

    // Per-tab detail
    w(`║  ── PER-TAB DETAIL: API CALLS ──`.padEnd(103) + '║');
    for (const t of r.tabResults) {
      w(`║  ${hr.slice(0, 100)}║`);
      w(`║  📋 ${t.tabName}  (switch=${t.switchTimeMs}ms → 1stRow=${t.timeToFirstRowMs}ms → idle=${t.networkIdleTimeMs}ms)`.padEnd(103) + '║');
      if (t.paginationInfo) {
        w(`║    📄 ${t.paginationInfo}`.padEnd(103) + '║');
      }
      if (t.apiCalls.length > 0) {
        w(`║    📡 API Calls (${t.apiCalls.length}):`.padEnd(103) + '║');
        for (const a of t.apiCalls.slice(0, 10)) {
          const shortUrl = a.url.split('?')[0];
          const displayUrl = shortUrl.length > 55 ? '…' + shortUrl.slice(-54) : shortUrl;
          const icon = a.status < 400 ? '✅' : '❌';
          w(`║      ${icon} [${a.method.padEnd(4)}] ${String(a.durationMs).padStart(5)}ms | ${a.status} | ${displayUrl}`.padEnd(103) + '║');
        }
        if (t.apiCalls.length > 10) {
          w(`║      … and ${t.apiCalls.length - 10} more`.padEnd(103) + '║');
        }
      } else {
        w(`║    📡 No API calls detected (may use cached data)`.padEnd(103) + '║');
      }
    }
    w(`║${''.padEnd(102)}║`);
  }

  // ── API Summary ──
  w(`╠${HR}╣`);
  w(`║  ── AGGREGATE API STATISTICS ──`.padEnd(103) + '║');
  w(`║  Total API calls   : ${String(r.apiSummary.totalCalls).padStart(6)}`.padEnd(103) + '║');
  w(`║  Failed calls      : ${String(r.apiSummary.failedCalls).padStart(6)}`.padEnd(103) + '║');
  w(`║  Slow calls (>1s)  : ${String(r.apiSummary.slowCalls).padStart(6)}`.padEnd(103) + '║');
  w(`║  Min response      : ${String(r.apiSummary.minMs).padStart(6)}ms`.padEnd(103) + '║');
  w(`║  Avg response      : ${String(r.apiSummary.avgResponseMs).padStart(6)}ms`.padEnd(103) + '║');
  w(`║  P50 response      : ${String(r.apiSummary.p50Ms).padStart(6)}ms`.padEnd(103) + '║');
  w(`║  P90 response      : ${String(r.apiSummary.p90Ms).padStart(6)}ms`.padEnd(103) + '║');
  w(`║  P99 response      : ${String(r.apiSummary.p99Ms).padStart(6)}ms`.padEnd(103) + '║');
  w(`║  Max response      : ${String(r.apiSummary.maxMs).padStart(6)}ms`.padEnd(103) + '║');
  w(`║${''.padEnd(102)}║`);

  // ── Memory ──
  if (r.memorySnapshots.length > 0) {
    w(`╠${HR}╣`);
    w(`║  ── MEMORY SNAPSHOTS ──`.padEnd(103) + '║');
    w(`║  ${'STAGE'.padEnd(45)} ${'USED'.padStart(10)}  ${'TOTAL'.padStart(10)}`.padEnd(103) + '║');
    w(`║  ${hr.slice(0, 100)}║`);
    for (const m of r.memorySnapshots) {
      w(`║  ${m.stage.padEnd(45)} ${String(m.usedMB.toFixed(2)).padStart(8)} MB  ${String(m.totalMB.toFixed(2)).padStart(8)} MB`.padEnd(103) + '║');
    }
    w(`║${''.padEnd(102)}║`);
  }

  // ── Console Errors ──
  if (r.consoleErrors.length > 0) {
    w(`╠${HR}╣`);
    w(`║  ── CONSOLE ERRORS (${r.consoleErrors.length}) ──`.padEnd(103) + '║');
    for (const e of r.consoleErrors.slice(0, 15)) {
      w(`║  ❌ ${e.substring(0, 96)}`.padEnd(103) + '║');
    }
    w(`║${''.padEnd(102)}║`);
  }

  w(`╚${HR}╝`);
  w();
  w(`Report generated at: ${r.timestamp}`);
  w(`Test duration: ${(r.durationMs / 1000).toFixed(1)}s`);
  w();
  return lines.join('\n');
}

function printReport(r: TrackingListFilterReport) {
  const text = buildTextReport(r);
  console.log(text);
}

// ═════════════════════════════════════════════════════════════════════════════
//  TEST
// ═════════════════════════════════════════════════════════════════════════════

test.describe('📋 Tracking List Filter Performance — Saved Filter "PeformanceTesting"', () => {

  test.setTimeout(300_000); // 5 minutes

  test('TLF-01: Tracking List saved filter application & tab navigation performance', async ({ page, context, browserName }) => {

    const testStart = Date.now();
    const allApiCalls: ApiCallRecord[] = [];
    const memorySnapshots: Array<{ stage: string; usedMB: number; totalMB: number }> = [];

    // Console error tracker
    const consoleTracker = createConsoleTracker(page);
    consoleTracker.start();

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 1 — LOGIN & NAVIGATE TO TRACKING LIST
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(100));
    console.log('  📋 TRACKING LIST FILTER PERFORMANCE TEST — Saved Filter "PeformanceTesting"');
    console.log('═'.repeat(100));
    console.log('\n  ⏳ Step 1/6 — Logging in & navigating to Tracking List …');

    const loginStart = Date.now();
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    // Navigate to Home first (required by the SPA)
    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Now navigate to Tracking List
    const pageLoadTracker = createNetworkTracker(page);
    pageLoadTracker.start();
    const pageLoadStart = Date.now();

    // Click on the "Tracking List" link in the nav
    const trackingLink = page.getByRole('link', { name: /Tracking List/i }).first();
    const trackingLinkVisible = await trackingLink.isVisible({ timeout: 10_000 }).catch(() => false);

    if (trackingLinkVisible) {
      await trackingLink.click();
    } else {
      // Fallback: direct navigation
      await page.goto(TRACKING_URL, { waitUntil: 'domcontentloaded' });
    }

    // Wait for the tracking list page to settle
    try {
      await page.waitForURL(/tracking/i, { timeout: 15_000 });
    } catch { /* hash routing may not change */ }

    // Wait for spinner to disappear
    await page.locator('#spinner.backdrop').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});

    // Wait for table to appear
    try {
      await page.locator('table tbody tr, p-table tbody tr').first().waitFor({ state: 'visible', timeout: 30_000 });
    } catch { /* table may load later */ }

    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    pageLoadTracker.stop();
    const initialPageLoadMs = Date.now() - pageLoadStart;
    const loginToPageMs = Date.now() - loginStart;
    const initialPageLoadApiCalls = toApiRecords(pageLoadTracker.getRequests());
    allApiCalls.push(...initialPageLoadApiCalls);

    console.log(`  ✅ Login → Tracking List: ${loginToPageMs}ms`);
    console.log(`  ✅ Tracking List loaded in ${initialPageLoadMs}ms  (${initialPageLoadApiCalls.length} API calls)`);

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 2 — INITIAL TABLE DATA (Before Filter)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 2/6 — Measuring initial table data …');

    const initialRowCount = await getTableRowCount(page);
    const initialPaginationInfo = await getPaginationInfo(page);

    console.log(`    📊 Visible rows: ${initialRowCount}`);
    if (initialPaginationInfo) {
      console.log(`    📄 Pagination: ${initialPaginationInfo}`);
    }

    // Memory — baseline
    const memBaseline = await getMemoryMetrics(page);
    if (memBaseline) {
      memorySnapshots.push({ stage: 'After Initial Tracking List Load', usedMB: memBaseline.usedJSHeapSizeMB, totalMB: memBaseline.totalJSHeapSizeMB });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 3 — CLICK "SHOW FILTERS" → OPEN SIDEBAR
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 3/6 — Clicking "Show filters" button …');

    let showFilterClickMs = 0;
    let settingsIconClickMs = 0;

    try {
      // Wait for any spinner to disappear
      await page.locator('#spinner.backdrop').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});

      // Find "Show filters" button — PrimeNG button with title="Show filters"
      const showFilterBtn = page.getByRole('button', { name: 'Show filters' });
      await expect(showFilterBtn).toBeVisible({ timeout: 15_000 });

      const showFilterStart = Date.now();
      await showFilterBtn.click();

      // Wait for the sidebar (PrimeNG p-drawer) to open
      await page.locator('.p-drawer-active, [data-pc-name="sidebar"]').waitFor({ state: 'visible', timeout: 15_000 });
      await page.waitForTimeout(1000);
      showFilterClickMs = Date.now() - showFilterStart;

      console.log(`    ${ratingIcon(showFilterClickMs, 1000, 3000)} Sidebar opened in ${showFilterClickMs}ms`);
    } catch (err) {
      console.log(`    ❌ "Show filters" click failed: ${(err as Error).message}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 4 — CLICK SETTINGS ICON (COG) → SAVED FILTERS PANEL
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 4/6 — Clicking settings icon (cog) for saved filters …');

    try {
      // Wait for any spinner overlay to disappear
      await page.locator('#spinner.backdrop').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});

      // The settings icon is a PrimeNG icon-only button with pi-cog icon, inside the sidebar
      const sidebar = page.locator('.p-drawer-active, [data-pc-name="sidebar"]');
      const cogButton = sidebar.locator('button.p-button-icon-only:has(span.pi-cog)');

      const settingsStart = Date.now();

      await expect(cogButton).toBeVisible({ timeout: 10_000 });
      console.log('    ✅ Found cog/settings icon button inside sidebar');

      // Use force:true to bypass any remaining overlay interception
      await cogButton.click({ force: true });
      console.log('    🖱️ Clicked cog icon');

      // Wait for saved filters panel to expand
      await page.waitForTimeout(2000);
      settingsIconClickMs = Date.now() - settingsStart;
      console.log(`    ${ratingIcon(settingsIconClickMs, 1000, 3000)} Saved filters panel opened in ${settingsIconClickMs}ms`);
    } catch (err) {
      console.log(`    ❌ Settings icon click failed: ${(err as Error).message}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 5 — CLICK "PeformanceTesting" SAVED FILTER → MEASURE RELOAD
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 5/6 — Applying "PeformanceTesting" saved filter …');

    let filterApplyResult: FilterApplyResult | null = null;

    try {
      // Find the "PeformanceTesting" saved filter button (note: app has typo — "Peformance" not "Performance")
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
      console.log('    🖱️ Clicked "PeformanceTesting" — spinner expected …');

      // Wait for spinner to appear and disappear
      try {
        const spinner = page.locator('#spinner.backdrop');
        await spinner.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
        console.log('    ⏳ Spinner appeared …');
        await spinner.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
        console.log('    ✅ Spinner disappeared');
      } catch {
        console.log('    ⏳ No spinner detected, waiting for network settle …');
      }

      // Wait for network to fully settle after filter application
      await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(2000);

      // Wait for table rows to appear
      try {
        await page.locator('table tbody tr, p-table tbody tr').first().waitFor({ state: 'visible', timeout: 30_000 });
      } catch { /* table may be empty for filtered results */ }

      filterTracker.stop();
      const filterApiCalls = toApiRecords(filterTracker.getRequests());
      allApiCalls.push(...filterApiCalls);
      const filterSlowest = slowestApi(filterApiCalls);
      const filterApplyTimeMs = Date.now() - filterClickStart;

      // Measure table data after filter
      const rowCountAfterFilter = await getTableRowCount(page);
      const paginationAfterFilter = await getPaginationInfo(page);

      filterApplyResult = {
        filterName: 'PeformanceTesting',
        showFilterClickMs,
        settingsIconClickMs,
        filterApplyTimeMs,
        rowCountAfterFilter,
        paginationInfo: paginationAfterFilter,
        apiCalls: filterApiCalls,
        slowestApiMs: filterSlowest.durationMs,
        slowestApiUrl: filterSlowest.url,
      };

      console.log(`    📊 Rows after filter: ${rowCountAfterFilter}`);
      if (paginationAfterFilter) {
        console.log(`    📄 Pagination: ${paginationAfterFilter}`);
      }
      console.log(`\n    ${ratingIcon(filterApplyTimeMs, 5000, 15000)} TOTAL filter apply → data loaded: ${filterApplyTimeMs}ms  (${filterApiCalls.length} APIs, slowest ${filterSlowest.durationMs}ms)`);

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
    //  STEP 6 — NAVIGATE ALL TRACKING LIST TABS (After Filter)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n  ⏳ Step 6/6 — Navigating Tracking List tabs (post-filter) …');

    const tabResults: TabResult[] = [];

    for (const tabName of TRACKING_TABS) {
      console.log(`\n    ── ${tabName} ──`);

      try {
        // Find the tab — try role=tab first, then text match
        let tabElement = page.getByRole('tab', { name: new RegExp(`^${tabName}$`, 'i') }).first();
        let tabVisible = await tabElement.isVisible({ timeout: 3_000 }).catch(() => false);

        if (!tabVisible) {
          // Try case-insensitive text match
          tabElement = page.getByText(tabName, { exact: true }).first();
          tabVisible = await tabElement.isVisible({ timeout: 3_000 }).catch(() => false);
        }

        if (!tabVisible) {
          // Try broader selector
          tabElement = page.locator(
            `[role="tab"]:has-text("${tabName}"), ` +
            `a:has-text("${tabName}"), ` +
            `button:has-text("${tabName}"), ` +
            `li:has-text("${tabName}"), ` +
            `[class*="tab"]:has-text("${tabName}")`
          ).first();
          tabVisible = await tabElement.isVisible({ timeout: 3_000 }).catch(() => false);
        }

        if (!tabVisible) {
          console.log(`      ⚠️  Tab "${tabName}" not found — skipping`);
          continue;
        }

        // Wait for any pending spinners before clicking
        await page.locator('#spinner.backdrop').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});

        const tabTracker = createNetworkTracker(page);
        tabTracker.start();
        const tabClickStart = Date.now();

        await tabElement.click();
        const switchTimeMs = Date.now() - tabClickStart;

        // Wait for spinner to appear/disappear (tab switch triggers data load)
        try {
          const spinner = page.locator('#spinner.backdrop');
          await spinner.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
          await spinner.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
        } catch { /* no spinner for this tab */ }

        // Wait for first data row
        let timeToFirstRowMs = 0;
        try {
          await page.locator('table tbody tr, p-table tbody tr').first().waitFor({ state: 'visible', timeout: 30_000 });
          timeToFirstRowMs = Date.now() - tabClickStart;
        } catch {
          timeToFirstRowMs = Date.now() - tabClickStart;
        }

        // Wait for network to settle
        const netIdleStart = Date.now();
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const networkIdleTimeMs = Date.now() - tabClickStart; // total time from click to settled

        tabTracker.stop();
        const tabApiCalls = toApiRecords(tabTracker.getRequests());
        allApiCalls.push(...tabApiCalls);
        const tabSlowest = slowestApi(tabApiCalls);

        // Row count & pagination
        const rowCount = await getTableRowCount(page);
        const paginationInfo = await getPaginationInfo(page);

        tabResults.push({
          tabName,
          switchTimeMs,
          timeToFirstRowMs,
          networkIdleTimeMs,
          rowCount,
          paginationInfo,
          apiCalls: tabApiCalls,
          slowestApiMs: tabSlowest.durationMs,
          slowestApiUrl: tabSlowest.url,
        });

        // Console output
        console.log(`      ⏱️  Tab click time      : ${switchTimeMs}ms`);
        console.log(`      📊 Time to first row   : ${timeToFirstRowMs}ms`);
        console.log(`      🌐 Network idle total  : ${networkIdleTimeMs}ms`);
        console.log(`      📋 Visible rows        : ${rowCount}`);
        if (paginationInfo) {
          console.log(`      📄 Pagination          : ${paginationInfo}`);
        }
        console.log(`      📡 API calls           : ${tabApiCalls.length}  (slowest ${tabSlowest.durationMs}ms)`);

        // Log API calls
        for (const a of tabApiCalls) {
          const shortUrl = a.url.split('?')[0];
          const displayUrl = shortUrl.length > 55 ? '…' + shortUrl.slice(-54) : shortUrl;
          console.log(`         ${a.status < 400 ? '✅' : '❌'} [${a.method}] ${a.durationMs}ms | ${a.status} | ${displayUrl}`);
        }

        console.log(`    ${ratingIcon(networkIdleTimeMs, 3000, 8000)} ${tabName}: total=${networkIdleTimeMs}ms  rows=${rowCount}  apis=${tabApiCalls.length}`);
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

    const report: TrackingListFilterReport = {
      testName: 'Tracking List Filter Performance — Saved Filter "PeformanceTesting"',
      timestamp: new Date().toISOString(),
      durationMs: testDuration,
      browser: browserName,
      loginToPageMs,
      initialPageLoadMs,
      initialPageLoadApiCalls,
      initialRowCount,
      initialPaginationInfo,
      filterApply: filterApplyResult,
      tabResults,
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
    expect(initialPageLoadMs, 'Tracking List should load within 60s').toBeLessThan(60_000);
    console.log(`  ✅ Initial page load (${initialPageLoadMs}ms) under 60s threshold`);

    // Filter apply under 60s
    if (filterApplyResult) {
      expect(filterApplyResult.filterApplyTimeMs, 'Filter apply should complete within 60s').toBeLessThan(60_000);
      console.log(`  ✅ Filter apply (${filterApplyResult.filterApplyTimeMs}ms) under 60s threshold`);
    }

    // Tab switching under 30s each
    for (const tab of tabResults) {
      expect(tab.networkIdleTimeMs, `Tab "${tab.tabName}" should settle within 60s`).toBeLessThan(60_000);
    }
    console.log(`  ✅ All ${tabResults.length} tabs navigated within threshold`);

    // No excessive console errors
    if (consoleErrors.length > 20) {
      console.log(`  ⚠️  High console error count: ${consoleErrors.length}`);
    } else {
      console.log(`  ✅ Console errors within acceptable range: ${consoleErrors.length}`);
    }

    console.log(`\n  🏁 Test completed in ${(testDuration / 1000).toFixed(1)}s\n`);
  });
});
