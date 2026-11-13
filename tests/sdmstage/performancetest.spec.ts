import { test, expect, Page, Request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { seedLogin } from '../seed.spec';

const BASE_URL = 'https://sdmstage.bdpsmart.com';
const HOME_URL = `${BASE_URL}/arrival`;

// ---------------------------------------------------------------------------
// Output — two CSVs land here:
//   1) performance-report.csv      -> Module, LoadTimeMs, DataCount, Status
//   2) api-performance-report.csv  -> Module, Method, URL, Status, DurationMs
// ---------------------------------------------------------------------------
const OUTPUT_ROOT = path.join(__dirname, 'event-manager-performance-output');

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function log(msg: string) {
  const ts = new Date().toISOString().split('T')[1].replace('Z', '');
  console.log(`[${ts}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Result buckets
// ---------------------------------------------------------------------------
interface PageResult {
  module: string;
  status: 'OK' | 'FAILED';
  loadTimeMs: number;
  dataCount: number | 'N/A';
  error?: string;
}

interface ApiCall {
  module: string;
  method: string;
  url: string;
  status: number | string;
  durationMs: number;
}

const pageResults: PageResult[] = [];
const apiCalls: ApiCall[] = [];

// Tracks which module is "active" right now so the global request listeners
// can tag every XHR/fetch call with the page it belongs to.
let currentModule = 'INITIAL_LOAD';

// ---------------------------------------------------------------------------
// Reusable selectors (same ones used in the earlier column-settings script)
// ---------------------------------------------------------------------------

/** Clicks a top-level module nav span, e.g. "Carrier Release", "Customs", "Delivery". */
async function clickModuleNav(page: Page, moduleLabel: string) {
  log(`🖱️  Switching to module: "${moduleLabel}"`);
  await page.locator('span', { hasText: moduleLabel }).first().click();
  await page.waitForTimeout(500);
}

/** Clicks a KPI card by its visible title text (app-kpi-card > span.kpi-title). */
async function clickKpiCard(page: Page, title: string) {
  log(`🖱️  Clicking KPI card: "${title}"`);
  const kpiCard = page.locator('app-kpi-card').filter({
    has: page.locator('span.kpi-title', { hasText: title }),
  });
  await kpiCard.first().waitFor({ state: 'visible', timeout: 20_000 });
  await kpiCard.first().click();
  await page.waitForTimeout(500);
}

/** Clicks a sub-tab, e.g. <p-tab>Draft</p-tab>, <p-tab>Awaiting Return</p-tab>. */
async function clickPTab(page: Page, tabLabel: string) {
  log(`🖱️  Clicking tab: "${tabLabel}"`);
  await page.locator('p-tab', { hasText: tabLabel }).first().click();
  await page.waitForTimeout(500);
}

/**
 * Waits for the results grid to finish loading. Tries several common
 * PrimeNG/Angular loader patterns defensively — never throws, just logs
 * what it found (or didn't) and moves on.
 */
async function waitForTableLoad(page: Page, label: string) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
  } catch {
    log(`   [${label}] networkidle timeout — continuing anyway.`);
  }

  const loaderSelectors = [
    '.p-datatable-loading-icon',
    '.p-datatable-loading-overlay',
    '.p-progressbar',
    '.p-progress-spinner',
    'app-loader',
    '.loading-spinner',
    '.loader',
  ];

  for (const sel of loaderSelectors) {
    const loader = page.locator(sel).first();
    try {
      const count = await loader.count();
      if (count > 0) {
        log(`   [${label}] Loader "${sel}" detected — waiting for it to disappear...`);
        await loader.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {
          log(`   [${label}] Loader "${sel}" did not hide within timeout — continuing.`);
        });
      }
    } catch {
      // selector not present — ignore
    }
  }

  // Wait for the pagination footer to actually render (proof data has painted),
  // without hard-failing if it's missing (e.g. an empty-state page).
  await page
    .locator('text=/Showing\\s+[\\d,]+\\s+to\\s+[\\d,]+\\s+of\\s+[\\d,]+\\s+entries/i')
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => {
      log(`   [${label}] Pagination footer text not found within timeout (may be an empty grid).`);
    });

  // Small settle buffer for any final re-render/animation.
  await page.waitForTimeout(500);
}

/** Reads "Showing X to Y of Z entries" from the footer and returns Z. */
async function getDataCount(page: Page, label: string): Promise<number | 'N/A'> {
  try {
    const bodyText = await page.locator('body').innerText();
    const match = bodyText.match(/Showing\s+[\d,]+\s+to\s+[\d,]+\s+of\s+([\d,]+)\s+entries/i);
    if (match) {
      return parseInt(match[1].replace(/,/g, ''), 10);
    }
    log(`   [WARNING] [${label}] Could not find "Showing X to Y of Z entries" text — data count unavailable.`);
    return 'N/A';
  } catch (err) {
    log(`   [WARNING] [${label}] Error reading data count: ${(err as Error).message}`);
    return 'N/A';
  }
}

/**
 * The core measurement wrapper. Runs `action` (whatever click(s) are needed
 * to land on this page/tab), then times how long the grid takes to fully
 * load, then reads the row count from the footer. NEVER throws — on any
 * failure it logs the error and records a FAILED row so the run continues.
 */
async function runStep(page: Page, moduleLabel: string, action: () => Promise<void>) {
  log(`\n========== ▶ START: ${moduleLabel} ==========`);
  currentModule = moduleLabel; // tags all API calls captured from here on
  const startTime = Date.now();

  try {
    await action();
    await waitForTableLoad(page, moduleLabel);
    const dataCount = await getDataCount(page, moduleLabel);
    const loadTimeMs = Date.now() - startTime;

    log(`⏱️  [${moduleLabel}] Page fully loaded in ${loadTimeMs} ms (${(loadTimeMs / 1000).toFixed(2)}s)`);
    log(`📊 [${moduleLabel}] Data count: ${dataCount}`);

    pageResults.push({ module: moduleLabel, status: 'OK', loadTimeMs, dataCount });
    log(`========== ✔ DONE: ${moduleLabel} ==========\n`);
  } catch (err) {
    const loadTimeMs = Date.now() - startTime;
    const errorMsg = (err as Error).message;
    log(`❌ [ERROR] [${moduleLabel}] failed after ${loadTimeMs} ms — SKIPPING, moving to next step. Reason: ${errorMsg}`);
    pageResults.push({ module: moduleLabel, status: 'FAILED', loadTimeMs, dataCount: 'N/A', error: errorMsg });
    log(`========== ✖ FAILED: ${moduleLabel} ==========\n`);
  }
}

// ---------------------------------------------------------------------------
// Step list — one entry per row you want in the CSV, in the exact order
// you land on them. `action` is just the click(s) needed to get there;
// timing/data-count capture is handled uniformly by runStep().
// ---------------------------------------------------------------------------
function buildSteps(page: Page): Array<{ module: string; action: () => Promise<void> }> {
  return [
    // ---------------- ARRIVAL ----------------
    { module: 'In Transit', action: async () => {} }, // default landing page after login
    { module: 'Arrived', action: async () => clickPTab(page, 'Arrived Shipments') },

    // ---------------- CARRIER RELEASE ----------------
    { module: 'Upcoming Shipments', action: async () => clickModuleNav(page, 'Carrier Release') },
    { module: 'Incomplete Documents', action: async () => clickKpiCard(page, 'Incomplete Documents') },
    { module: 'Request Pending Auto', action: async () => clickKpiCard(page, 'Request Pending Auto') },
    { module: 'Request Pending Manual', action: async () => clickKpiCard(page, 'Request Pending Manual') },
    // NOTE: actual DOM text is "Authorisation Pending" (British spelling), kept as given below for the CSV label.
    { module: 'Authorization Pending', action: async () => clickKpiCard(page, 'Authorisation Pending') },
    { module: 'Authorised', action: async () => clickKpiCard(page, 'Authorised') },

    // ---------------- CUSTOMS ----------------
    { module: 'Upcoming Shipments (Customs)', action: async () => clickModuleNav(page, 'Customs') },
    { module: 'Incomplete Documents (Customs)', action: async () => clickKpiCard(page, 'Incomplete Documents') },
    { module: 'Request Pending', action: async () => clickKpiCard(page, 'Request Pending') },
    { module: 'Request Submitted', action: async () => clickKpiCard(page, 'Request Submitted') },
    { module: 'Pending Clearance', action: async () => clickKpiCard(page, 'Pending Clearance') },
    { module: 'Clearance Completed', action: async () => clickKpiCard(page, 'Clearance Completed') },

    // ---------------- DELIVERY ----------------
    { module: 'Pre-Arrival', action: async () => clickModuleNav(page, 'Delivery') },

    // Delivery Planning group (default sub-tab: Ready to Plan)
    { module: 'Ready to Plan', action: async () => clickKpiCard(page, 'Delivery Planning') },
    { module: 'Draft', action: async () => clickPTab(page, 'Draft') },
    { module: 'Awaiting Confirmation', action: async () => clickPTab(page, 'Awaiting Confirmation') },
    { module: 'Confirmed', action: async () => clickPTab(page, 'Confirmed') },
    { module: 'Revised', action: async () => clickPTab(page, 'Revised') },
    { module: 'Finalised', action: async () => clickPTab(page, 'Finalised') },

    // Delivery Booking group (default sub-tab: Sent)
    { module: 'Sent', action: async () => clickKpiCard(page, 'Delivery Booking') },
    { module: 'Accepted', action: async () => clickPTab(page, 'Accepted') },
    { module: 'Rejected', action: async () => clickPTab(page, 'Rejected') },
    { module: 'Cancelled', action: async () => clickPTab(page, 'Cancelled') },

    // Delivery Execution group (default sub-tab: In Progress)
    { module: 'In Progress', action: async () => clickKpiCard(page, 'Delivery Execution') },
    { module: 'Overdue', action: async () => clickPTab(page, 'Overdue') },
    { module: 'Completed', action: async () => clickPTab(page, 'Completed') },

    // Empty Return group (default sub-tab: Awaiting Return)
    { module: 'Awaiting Return', action: async () => clickKpiCard(page, 'Empty Return') },
    { module: 'Returned', action: async () => clickPTab(page, 'Returned') },
  ];
}

// ---------------------------------------------------------------------------
// Network/API timing capture — attached once, tags every XHR/fetch call
// with whichever module is "current" when the request completes.
// ---------------------------------------------------------------------------
function attachApiTimingCapture(page: Page) {
  const requestStartMap = new Map<Request, number>();

  page.on('request', (req) => {
    const type = req.resourceType();
    if (type === 'xhr' || type === 'fetch') {
      requestStartMap.set(req, Date.now());
    }
  });

  page.on('requestfinished', async (req) => {
    const type = req.resourceType();
    if (type !== 'xhr' && type !== 'fetch') return;
    const start = requestStartMap.get(req);
    if (start === undefined) return;
    requestStartMap.delete(req);

    const durationMs = Date.now() - start;
    let status: number | string = 'UNKNOWN';
    try {
      const res = await req.response();
      status = res ? res.status() : 'NO_RESPONSE';
    } catch {
      status = 'UNKNOWN';
    }

    apiCalls.push({ module: currentModule, method: req.method(), url: req.url(), status, durationMs });
    log(`   [API] [${currentModule}] ${req.method()} ${req.url()} → ${status} (${durationMs} ms)`);
  });

  page.on('requestfailed', (req) => {
    const type = req.resourceType();
    if (type !== 'xhr' && type !== 'fetch') return;
    const start = requestStartMap.get(req);
    requestStartMap.delete(req);
    const durationMs = start !== undefined ? Date.now() - start : -1;

    apiCalls.push({
      module: currentModule,
      method: req.method(),
      url: req.url(),
      status: 'FAILED',
      durationMs,
    });
    log(`   [API-FAILED] [${currentModule}] ${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown error'}`);
  });
}

// ---------------------------------------------------------------------------
// CSV writers
// ---------------------------------------------------------------------------
function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writePagePerformanceCsv() {
  const header = ['Module', 'LoadTimeMs', 'DataCount', 'Status'];
  const rows = pageResults.map((r) => [r.module, r.loadTimeMs, r.dataCount, r.status].map(csvEscape).join(','));
  const csv = [header.join(','), ...rows].join('\n');
  const filePath = path.join(OUTPUT_ROOT, 'performance-report.csv');
  fs.writeFileSync(filePath, csv, 'utf-8');
  log(`💾 Wrote page performance report → ${filePath}`);
}

function writeApiPerformanceCsv() {
  const header = ['Module', 'Method', 'URL', 'Status', 'DurationMs'];
  const rows = apiCalls.map((c) => [c.module, c.method, c.url, c.status, c.durationMs].map(csvEscape).join(','));
  const csv = [header.join(','), ...rows].join('\n');
  const filePath = path.join(OUTPUT_ROOT, 'api-performance-report.csv');
  fs.writeFileSync(filePath, csv, 'utf-8');
  log(`💾 Wrote API performance report → ${filePath} (${apiCalls.length} API call(s) captured)`);
}

// ---------------------------------------------------------------------------
// Final console summary
// ---------------------------------------------------------------------------
function printSummary() {
  log('\n\n================= 📋 FULL PERFORMANCE SUMMARY =================');

  console.table(
    pageResults.map((r) => ({
      Module: r.module,
      Status: r.status,
      'Load Time (ms)': r.loadTimeMs,
      'Data Count': r.dataCount,
    }))
  );

  const ok = pageResults.filter((r) => r.status === 'OK');
  const failed = pageResults.filter((r) => r.status === 'FAILED');

  if (ok.length > 0) {
    const slowest = ok.reduce((a, b) => (b.loadTimeMs > a.loadTimeMs ? b : a));
    const fastest = ok.reduce((a, b) => (b.loadTimeMs < a.loadTimeMs ? b : a));
    const avgMs = Math.round(ok.reduce((sum, r) => sum + r.loadTimeMs, 0) / ok.length);

    log(`✅ Pages loaded successfully: ${ok.length}/${pageResults.length}`);
    log(`🐢 Slowest page: "${slowest.module}" — ${slowest.loadTimeMs} ms`);
    log(`⚡ Fastest page: "${fastest.module}" — ${fastest.loadTimeMs} ms`);
    log(`📈 Average load time across all pages: ${avgMs} ms`);
  }

  if (failed.length > 0) {
    log(`❌ Pages that FAILED to load (${failed.length}):`);
    for (const f of failed) {
      log(`   - ${f.module}: ${f.error}`);
    }
  }

  if (apiCalls.length > 0) {
    const slowestApi = apiCalls.reduce((a, b) => (b.durationMs > a.durationMs ? b : a));
    log(`\n🐢 Slowest API call overall: [${slowestApi.module}] ${slowestApi.method} ${slowestApi.url} — ${slowestApi.durationMs} ms`);

    // Slowest API per module, for a quick "what's dragging this page down" view.
    const byModule = new Map<string, ApiCall>();
    for (const call of apiCalls) {
      const existing = byModule.get(call.module);
      if (!existing || call.durationMs > existing.durationMs) {
        byModule.set(call.module, call);
      }
    }
    log(`\n🔎 Slowest API per module:`);
    for (const [module, call] of byModule.entries()) {
      log(`   [${module}] ${call.method} ${call.url} — ${call.durationMs} ms (status ${call.status})`);
    }
  } else {
    log(`\n⚠️  No XHR/fetch API calls were captured. If your app uses a different resource type, adjust the filter in attachApiTimingCapture().`);
  }

  log('==================================================================\n');
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------
test.describe('⚡ Data Management → Event Manager FULL PERFORMANCE TEST', () => {
  test.setTimeout(900_000); // 15 minutes — this walks every module/tab

  test('PERF-01: Full page-load & API performance profile across all modules', async ({ page, context }) => {
    const suiteStart = Date.now();
    fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

    attachApiTimingCapture(page);

    log('🔐 Logging in...');
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    log(`🌐 Navigating to ${HOME_URL} and starting timers...`);
    currentModule = 'In Transit'; // capture the initial page-load's API calls under the right label
    const initialLoadStart = Date.now();
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await waitForTableLoad(page, 'In Transit');
    const initialDataCount = await getDataCount(page, 'In Transit');
    const initialLoadTimeMs = Date.now() - initialLoadStart;

    log(`⏱️  [In Transit] Initial page load: ${initialLoadTimeMs} ms`);
    log(`📊 [In Transit] Data count: ${initialDataCount}`);
    pageResults.push({ module: 'In Transit', status: 'OK', loadTimeMs: initialLoadTimeMs, dataCount: initialDataCount });

    // Remaining steps (skip index 0 — "In Transit" already measured above).
    const steps = buildSteps(page).slice(1);
    for (const step of steps) {
      await runStep(page, step.module, step.action);
    }

    const totalSeconds = ((Date.now() - suiteStart) / 1000).toFixed(1);
    log(`\n🏁 ALL ${pageResults.length} MODULES/TABS PROCESSED — total runtime: ${totalSeconds}s`);

    writePagePerformanceCsv();
    writeApiPerformanceCsv();
    printSummary();
  });
});
