import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { seedLogin } from '../seed.spec';

const BASE_URL = 'https://sdmstage.bdpsmart.com';
const HOME_URL = `${BASE_URL}/arrival`;

// ---------------------------------------------------------------------------
// Output location — everything (CSVs + downloaded files) goes here, flat.
// All identifying info (module/tab/level) lives in the filename itself.
// ---------------------------------------------------------------------------
const OUTPUT_ROOT = path.join(__dirname, 'event-manager-output');

// ---------------------------------------------------------------------------
// SWITCH: set to true to re-enable the Download-button flow for every tab.
// Column Settings extraction always runs regardless of this switch.
// ---------------------------------------------------------------------------
const ENABLE_DOWNLOADS = true;

// ---------------------------------------------------------------------------
// Module / tab map (mirrors what you described)
// ---------------------------------------------------------------------------
const CARRIER_RELEASE_KPIS = [
  'Incomplete Documents',
  'Request Pending Auto',
  'Request Pending Manual',
  'Authorisation Pending', // NOTE: actual DOM text is "Authorisation" (British spelling), not "Authorization"
  'Authorised',
];

const CUSTOMS_KPIS = [
  'Incomplete Documents',
  'Request Pending',
  'Request Submitted',
  'Pending Clearance',
  'Clearance Completed',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeName(s: string): string {
  return s.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
}

// Turns "in transit" / "Upcoming Shipments" into "IntTransit"-style PascalCase
// words with no spaces/underscores, e.g. "Upcoming Shipments" -> "UpcomingShipments".
function pascalWords(s: string): string {
  return s
    .trim()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

// Same as pascalWords but the first word starts lowercase, e.g. "Shipment Level" -> "shipmentLevel".
function camelWords(s: string): string {
  const p = pascalWords(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

// Builds the "ModuleTab" identifier used across both CSV and download filenames,
// e.g. moduleTabId('Arrival', 'In Transit') -> "ArrivalIntransit"
//      moduleTabId('Customs', 'Upcoming Shipments') -> "CustomsUpcomingShipments"
function moduleTabId(moduleName: string, tabName: string): string {
  return `${pascalWords(moduleName)}${pascalWords(tabName)}`;
}

function log(msg: string) {
  const ts = new Date().toISOString().split('T')[1].replace('Z', '');
  console.log(`[${ts}] ${msg}`);
}

/**
 * Waits for the results table/grid to finish loading.
 * We don't know your exact spinner markup, so this tries several common
 * PrimeNG / Angular patterns defensively and never throws — it just logs
 * what it found (or didn't) and moves on. Replace the selector list with
 * your real loader class if you have one, for tighter waits.
 */
async function waitForTableLoad(page: Page, label: string) {
  log(`⏳ [${label}] Waiting for network idle...`);
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
        log(`   [${label}] Found loader "${sel}" — waiting for it to disappear...`);
        await loader.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {
          log(`   [${label}] Loader "${sel}" did not hide within timeout — continuing.`);
        });
      }
    } catch {
      // selector not present at all — fine, ignore
    }
  }

  // Small settle buffer for late-rendering rows/animations.
  await page.waitForTimeout(1000);
  log(`✅ [${label}] Table considered loaded.`);
}

/**
 * Opens "Column Settings", extracts the column names (same logic as your
 * BeautifulSoup version: span.col-settings-label text, in DOM order),
 * writes them to a CSV, then closes the popover.
 */
async function extractColumnSettings(page: Page, moduleName: string, tabName: string) {
  const label = `${moduleName} / ${tabName}`;
  log(`🔧 [${label}] Opening Column Settings...`);

  const columnSettingsBtn = page.getByRole('button', { name: 'Column Settings' });

  try {
    await columnSettingsBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await columnSettingsBtn.click();

    const popover = page.locator('div.p-popover-content');
    await popover.waitFor({ state: 'visible', timeout: 15_000 });

    // Pull column labels directly from the DOM (equivalent to your
    // BeautifulSoup `soup.select("span.col-settings-label")` in order).
    const columns: string[] = await popover.evaluate((el) => {
      return Array.from(el.querySelectorAll('span.col-settings-label'))
        .map((span) => (span.textContent || '').trim())
        .filter((t) => t.length > 0);
    });

    log(`   [${label}] Found ${columns.length} column(s) in Column Settings.`);
    if (columns.length === 0) {
      log(`   [WARNING] [${label}] No columns found — check the popover markup/selector.`);
    }

    const csvFileName = `UIcolumns${moduleTabId(moduleName, tabName)}.csv`;
    const csvPath = path.join(OUTPUT_ROOT, csvFileName);
    const csvContent = ['column_name', ...columns.map((c) => `"${c.replace(/"/g, '""')}"`)].join('\n');
    fs.writeFileSync(csvPath, csvContent, 'utf-8');
    log(`💾 [${label}] Wrote column CSV → ${csvPath}`);

    // Close the popover (Escape is the safest generic way with PrimeNG overlays).
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  } catch (err) {
    log(`❌ [ERROR] [${label}] Column Settings extraction failed: ${(err as Error).message}`);
  }
}

/**
 * Clicks Download, then downloads BOTH "Shipment Level" and "Container Level"
 * files, saving each with a name that identifies the module/tab/level.
 */
async function downloadBothLevels(page: Page, moduleName: string, tabName: string) {
  const label = `${moduleName} / ${tabName}`;

  if (!ENABLE_DOWNLOADS) {
    log(`⏸️  [${label}] Downloads are currently switched OFF (ENABLE_DOWNLOADS = false) — skipping.`);
    return;
  }

  const levels: Array<'Shipment Level' | 'Container Level'> = ['Shipment Level', 'Container Level'];

  for (const level of levels) {
    log(`⬇️  [${label}] Requesting "${level}" download...`);
    try {
      const downloadBtn = page.getByRole('button', { name: 'Download' });
      await downloadBtn.waitFor({ state: 'visible', timeout: 15_0000 });
      await downloadBtn.click();

      const menuItem = page.getByRole('menuitem', { name: level });
      await menuItem.waitFor({ state: 'visible', timeout: 15_0000 });

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60_0000 }),
        menuItem.click(),
      ]);

      const originalName = download.suggestedFilename();
      const ext = path.extname(originalName) || '.xlsx';
      const newName = `downloadedfile${moduleTabId(moduleName, tabName)}_${camelWords(level)}${ext}`;
      const destPath = path.join(OUTPUT_ROOT, newName);

      await download.saveAs(destPath);
      log(`✅ [${label}] "${level}" saved as → ${destPath}`);

      // Small buffer so the UI settles before we potentially reopen the menu.
      await page.waitForTimeout(500);
    } catch (err) {
      log(`❌ [ERROR] [${label}] Download failed for "${level}": ${(err as Error).message}`);
    }
  }
}

/**
 * Full per-tab routine: wait for table, extract columns, download both levels.
 */
async function processTab(page: Page, moduleName: string, tabName: string) {
  const label = `${moduleName} / ${tabName}`;
  log(`\n========== ▶ START: ${label} ==========`);
  try {
    await waitForTableLoad(page, label);
    await extractColumnSettings(page, moduleName, tabName);
    await downloadBothLevels(page, moduleName, tabName);
    log(`========== ✔ DONE: ${label} ==========\n`);
  } catch (err) {
    log(`========== ✖ FAILED: ${label} — ${(err as Error).message} ==========\n`);
  }
}

/**
 * Runs a step and NEVER lets it kill the test. Any error (locator not found,
 * timeout, download not firing, tab missing, etc.) is caught, logged clearly,
 * and execution moves on to the next step/tab.
 */
async function safeRun(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    log(`❌ [ERROR] "${label}" failed — SKIPPING and moving on. Reason: ${(err as Error).message}`);
  }
}
async function clickKpiCard(page: Page, title: string) {
  log(`🖱️  Clicking KPI card: "${title}"`);
  const kpiCard = page.locator('app-kpi-card').filter({
    has: page.locator('span.kpi-title', { hasText: title }),
  });
  await kpiCard.first().waitFor({ state: 'visible', timeout: 20_000 });
  await kpiCard.first().click();
  await page.waitForTimeout(10000);
}

/**
 * Clicks a top-level module nav span (e.g. "Carrier Release", "Customs").
 */
async function clickModuleNav(page: Page, moduleLabel: string) {
  log(`🖱️  Switching to module: "${moduleLabel}"`);
  await page.locator('span', { hasText: moduleLabel }).first().click();
  await page.waitForTimeout(10000);
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe('📦 Data Management → Event Manager Performance Profiling', () => {
  test.setTimeout(480_000); // 8 minutes

  test('EMP-01: Event Manager search & result display — full performance profile', async ({
    page,
    context,
  }) => {
    const testStart = Date.now();
    fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await page.waitForTimeout(1500);

    // -------------------------------------------------------------------
    // ARRIVAL MODULE
    // -------------------------------------------------------------------
    // 1) We land directly on "In Transit" — process it first.
    await safeRun('Arrival / In Transit', async () => {
      await processTab(page, 'Arrival', 'In Transit');
    });

    // 2) Click "Arrived Shipments (0)" tab.
    await safeRun('Arrival / Arrived — click tab + process', async () => {
      log('🖱️  Clicking "Arrived Shipments" tab');
      await page.locator('p-tab', { hasText: 'Arrived Shipments' }).click();
      await page.waitForTimeout(1000);
      await processTab(page, 'Arrival', 'Arrived');
    });

    // -------------------------------------------------------------------
    // CARRIER RELEASE MODULE
    // -------------------------------------------------------------------
    await safeRun('Carrier Release / Upcoming Shipments — nav + process', async () => {
      await clickModuleNav(page, 'Carrier Release');
      // Lands on "Upcoming Shipments" by default.
      await processTab(page, 'CarrierRelease', 'Upcoming Shipments');
    });

    for (const kpi of CARRIER_RELEASE_KPIS) {
      await safeRun(`Carrier Release / ${kpi} — click KPI + process`, async () => {
        await clickKpiCard(page, kpi);
        await processTab(page, 'CarrierRelease', kpi);
      });
    }

    // -------------------------------------------------------------------
    // CUSTOMS MODULE
    // -------------------------------------------------------------------
    await safeRun('Customs / Upcoming Shipments — nav + process', async () => {
      await clickModuleNav(page, 'Customs');
      // Lands on "Upcoming Shipments" by default.
      await processTab(page, 'Customs', 'Upcoming Shipments');
    });

    for (const kpi of CUSTOMS_KPIS) {
      await safeRun(`Customs / ${kpi} — click KPI + process`, async () => {
        await clickKpiCard(page, kpi);
        await processTab(page, 'Customs', kpi);
      });
    }

    // -------------------------------------------------------------------
    const totalSeconds = ((Date.now() - testStart) / 1000).toFixed(1);
    log(`\n🏁 ALL MODULES COMPLETE — total runtime: ${totalSeconds}s`);
    log(`📁 All output (column CSVs${ENABLE_DOWNLOADS ? ' + downloaded files' : ''}) written to: ${OUTPUT_ROOT}`);
    if (!ENABLE_DOWNLOADS) {
      log(`⏸️  Note: downloads were switched OFF this run. Set ENABLE_DOWNLOADS = true at the top of the file to re-enable.`);
    }
  });
});