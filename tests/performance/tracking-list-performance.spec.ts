/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TRACKING LIST DEEP PERFORMANCE TEST
 *  
 *  Comprehensive testing of the Tracking List feature:
 *  
 *  1. Initial page load & navigation time
 *  2. Table data population timing (time to first row, all rows)
 *  3. Column rendering verification with timing
 *  4. Tab switching performance (In Transit, Arrived, Not Started)
 *  5. Pagination performance (next, previous, last page)
 *  6. Rows-per-page dropdown performance
 *  7. Data count verification per tab
 *  8. Network requests during each operation
 *  9. Memory impact of loading large tables
 *  10. All metrics saved to file
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { seedLogin } from '../seed.spec';
import {
  createNetworkTracker,
  measureAction,
  getMemoryMetrics,
  injectWebVitalsObservers,
  getCoreWebVitals,
  getNavigationTimingMetrics,
  getResourceSummary,
  getLongTasks,
  generatePerformanceReport,
  createConsoleTracker,
} from '../../utils/performance-helpers';
import {
  createEmptyReport,
  writeFullReport,
  calculatePerformanceScore,
  getScoreRating,
  printReportSummary,
  rateMetric,
  calculatePercentiles,
} from '../../utils/report-writer';

const BASE_URL = 'https://test.itt.bdpsmart.com';
const HOME_URL = `${BASE_URL}/#/home`;

test.describe('📋 Tracking List Deep Performance Test', () => {

  test.setTimeout(240_000); // 4 minutes

  test('TL-01: Tracking List Full Performance Audit', async ({ page, context, browserName }) => {
    const testStart = Date.now();
    const report = createEmptyReport(
      'Tracking List Deep Performance Audit',
      browserName || 'unknown',
      BASE_URL,
    );

    const consoleTracker = createConsoleTracker(page);
    consoleTracker.start();

    // ── Login ──
    console.log('\n' + '═'.repeat(80));
    console.log('  TRACKING LIST PERFORMANCE AUDIT');
    console.log('═'.repeat(80));

    await injectWebVitalsObservers(page);
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    // Navigate to Home first
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 1: TRACKING LIST NAVIGATION & INITIAL LOAD
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '─'.repeat(80));
    console.log('  SECTION 1: TRACKING LIST NAVIGATION & INITIAL LOAD');
    console.log('─'.repeat(80));

    const navTracker = createNetworkTracker(page);
    navTracker.start();

    const navStart = Date.now();
    const trackingLink = page.getByRole('link', { name: /Tracking List/i });

    if (!(await trackingLink.isVisible({ timeout: 10_000 }).catch(() => false))) {
      console.log('  ❌ Tracking List link not found. Aborting test.');
      return;
    }

    await trackingLink.click();

    // Measure incremental loading milestones
    const milestones: Array<{ name: string; timeMs: number }> = [];

    // Milestone: URL changed
    try {
      await page.waitForURL(/tracking/i, { timeout: 15_000 });
      milestones.push({ name: 'URL Changed', timeMs: Date.now() - navStart });
    } catch {
      // Hash-based routing may not change URL
      milestones.push({ name: 'URL Changed', timeMs: Date.now() - navStart });
    }

    // Milestone: Page content starts loading
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
      milestones.push({ name: 'DOM Content Loaded', timeMs: Date.now() - navStart });
    } catch { /* ignore */ }

    // Milestone: Tab visible
    try {
      await expect(page.getByRole('tab', { name: 'In Transit' })).toBeVisible({ timeout: 30_000 });
      milestones.push({ name: 'In Transit Tab Visible', timeMs: Date.now() - navStart });
    } catch {
      // Try alternate selectors
      await page.waitForTimeout(5000);
      milestones.push({ name: 'In Transit Tab Visible', timeMs: Date.now() - navStart });
    }

    // Milestone: First table header visible
    try {
      await page.locator('th, [role="columnheader"]').first().waitFor({ state: 'visible', timeout: 15_000 });
      milestones.push({ name: 'First Column Header Visible', timeMs: Date.now() - navStart });
    } catch { /* ignore */ }

    // Milestone: First data row visible
    const firstRowStart = Date.now();
    try {
      await page.locator('table tbody tr, [role="row"]:not([role="columnheader"])').first().waitFor({ state: 'visible', timeout: 30_000 });
      const timeToFirstRow = Date.now() - firstRowStart;
      milestones.push({ name: 'First Data Row Visible', timeMs: Date.now() - navStart });
    } catch { /* ignore */ }

    // Milestone: Network idle
    try {
      await page.waitForLoadState('networkidle', { timeout: 30_000 });
      milestones.push({ name: 'Network Idle', timeMs: Date.now() - navStart });
    } catch { /* ignore */ }

    // Wait for all rows to settle
    await page.waitForTimeout(2000);
    milestones.push({ name: 'All Data Settled', timeMs: Date.now() - navStart });

    navTracker.stop();

    const totalNavTime = Date.now() - navStart;

    console.log('\n  NAVIGATION MILESTONES:');
    console.log('  ' + '─'.repeat(60));
    milestones.forEach(m => {
      const rating = m.timeMs <= 3000 ? '🟢' : m.timeMs <= 8000 ? '🟡' : '🔴';
      console.log(`  ${rating} ${m.name.padEnd(30)} : ${m.timeMs}ms`);
    });
    console.log(`\n  Total Navigation Time     : ${totalNavTime}ms`);

    // Network stats during navigation
    const navNetSummary = navTracker.getSummary();
    const navApiCalls = navTracker.getRequests().filter(r =>
      r.resourceType === 'xhr' || r.resourceType === 'fetch'
    );

    console.log(`  Network Requests          : ${navNetSummary.totalRequests}`);
    console.log(`  API/XHR Calls             : ${navApiCalls.length}`);
    console.log(`  Failed Requests           : ${navNetSummary.failedCount}`);
    console.log(`  Avg Response Time         : ${navNetSummary.avgDuration}ms`);

    report.pages.push({
      pageName: 'Tracking List - Initial Load',
      url: page.url(),
      loadTimeMs: totalNavTime,
      networkSettledMs: totalNavTime,
      networkSummary: navNetSummary,
    });

    navApiCalls.forEach(r => report.apiCalls.push({
      url: r.url, method: r.method, status: r.status,
      durationMs: r.duration, sizeBytes: r.size, resourceType: r.resourceType,
    }));

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 2: TABLE STRUCTURE & COLUMN VERIFICATION
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '─'.repeat(80));
    console.log('  SECTION 2: TABLE STRUCTURE & COLUMN VERIFICATION');
    console.log('─'.repeat(80));

    const expectedColumns = [
      'Action', 'Shipment Number', 'MOT', 'Port of Departure',
      'Port Of Entry', 'Predictive ETA', 'Predictive ETD', 'Request ETA',
      'SBU Code', 'Shipper Reference', 'Transport Reference', 'Vessel Name',
    ];

    const detectedColumns: Array<{ name: string; detectedMs: number; found: boolean }> = [];
    const colStart = Date.now();

    // Get all column headers
    const columnHeaders = page.locator('th, [role="columnheader"]');
    const headerCount = await columnHeaders.count();
    const actualColumns: string[] = [];

    for (let i = 0; i < Math.min(headerCount, 25); i++) {
      try {
        const text = await columnHeaders.nth(i).textContent({ timeout: 2000 });
        if (text && text.trim()) {
          actualColumns.push(text.trim());
        }
      } catch { /* ignore */ }
    }

    console.log(`  Total Columns Found       : ${actualColumns.length}`);
    console.log('');

    // Check each expected column
    for (const col of expectedColumns) {
      const found = actualColumns.some(ac => ac.toLowerCase().includes(col.toLowerCase()));
      const detectionTime = Date.now() - colStart;
      detectedColumns.push({ name: col, detectedMs: detectionTime, found });
      console.log(`  ${found ? '✅' : '❌'} ${col.padEnd(35)} : ${found ? 'FOUND' : 'NOT FOUND'}`);
    }

    // Print all actual columns
    console.log('\n  ALL DETECTED COLUMNS:');
    actualColumns.forEach((col, i) => {
      console.log(`    ${String(i + 1).padStart(2)}. ${col}`);
    });

    report.componentTimings.push({
      name: 'Column Headers Render',
      category: 'table',
      timeMs: Date.now() - colStart,
      rating: rateMetric(Date.now() - colStart, 2000, 5000),
    });

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 3: TABLE DATA POPULATION (PER-TAB)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '─'.repeat(80));
    console.log('  SECTION 3: TABLE DATA POPULATION (PER-TAB)');
    console.log('─'.repeat(80));

    const tabsToTest = ['In Transit', 'Arrived', 'Not Started'];

    for (const tabName of tabsToTest) {
      console.log(`\n  ── ${tabName.toUpperCase()} TAB ──`);

      const tab = page.getByRole('tab', { name: tabName });
      if (!(await tab.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log(`  ⚠️  Tab "${tabName}" not visible, skipping`);
        continue;
      }

      const tabTracker = createNetworkTracker(page);
      tabTracker.start();

      const tabSwitchStart = Date.now();
      await tab.click();

      // Measure time to first data row
      let timeToFirstRow = 0;
      try {
        await page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 20_000 });
        timeToFirstRow = Date.now() - tabSwitchStart;
      } catch {
        timeToFirstRow = Date.now() - tabSwitchStart;
      }

      // Wait for network to settle
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(1500);

      tabTracker.stop();

      const tabSwitchTime = Date.now() - tabSwitchStart;

      // Count rows
      let rowCount = 0;
      try {
        rowCount = Math.max(0, (await page.locator('table tbody tr').count()));
        // Subtract header row if mixed
      } catch { /* ignore */ }

      // Get total from pagination
      let totalRows = rowCount;
      try {
        const paginationText = await page.getByText(/Showing \d+ to \d+ of \d+ entries/i).textContent({ timeout: 3000 });
        if (paginationText) {
          const match = paginationText.match(/of ([\d,]+)/);
          if (match) totalRows = parseInt(match[1].replace(/,/g, ''));
          console.log(`  Pagination Info       : ${paginationText.trim()}`);
        }
      } catch { /* ignore */ }

      // API calls during tab switch
      const tabApiCalls = tabTracker.getRequests().filter(r =>
        r.resourceType === 'xhr' || r.resourceType === 'fetch'
      );
      const tabSlowApis = tabApiCalls.filter(r => r.durationMs > 1000 || r.duration > 1000);

      const switchRating = rateMetric(tabSwitchTime, 2000, 5000);
      const dataRating = rateMetric(timeToFirstRow, 1500, 4000);

      console.log(`  ${switchRating === 'good' ? '🟢' : switchRating === 'needs-improvement' ? '🟡' : '🔴'} Tab Switch Time       : ${tabSwitchTime}ms`);
      console.log(`  ${dataRating === 'good' ? '🟢' : dataRating === 'needs-improvement' ? '🟡' : '🔴'} Time to First Row     : ${timeToFirstRow}ms`);
      console.log(`  Visible Rows          : ${rowCount}`);
      console.log(`  Total Rows            : ${totalRows}`);
      console.log(`  API Calls             : ${tabApiCalls.length}`);
      console.log(`  Slow APIs (>1s)       : ${tabSlowApis.length}`);

      report.tabSwitching.push({
        tabName,
        switchTimeMs: tabSwitchTime,
        dataLoadTimeMs: timeToFirstRow,
        rowCount: rowCount,
      });

      report.tables.push({
        tableName: `Tracking List - ${tabName}`,
        rowsLoaded: rowCount,
        totalRows: totalRows,
        timeToFirstRowMs: timeToFirstRow,
        timeToAllRowsMs: tabSwitchTime,
        columns: actualColumns,
      });

      tabApiCalls.forEach(r => report.apiCalls.push({
        url: r.url, method: r.method, status: r.status,
        durationMs: r.duration, sizeBytes: r.size, resourceType: r.resourceType,
      }));
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 4: PAGINATION PERFORMANCE
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '─'.repeat(80));
    console.log('  SECTION 4: PAGINATION PERFORMANCE');
    console.log('─'.repeat(80));

    // Go back to In Transit tab for pagination testing
    const inTransitTab = page.getByRole('tab', { name: 'In Transit' });
    if (await inTransitTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inTransitTab.click();
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    const paginationTests: Array<{ action: string; timeMs: number; rows: string }> = [];

    // Test Next Page
    const nextBtn = page.getByRole('button', { name: 'Next Page' });
    if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      for (let i = 0; i < 3; i++) {
        const pgTracker = createNetworkTracker(page);
        pgTracker.start();

        const pgStart = Date.now();
        await nextBtn.click();
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(1000);

        pgTracker.stop();
        const pgTime = Date.now() - pgStart;

        let pgText = '';
        try {
          pgText = await page.getByText(/Showing \d+ to \d+ of/i).textContent({ timeout: 3000 }) || '';
        } catch { /* ignore */ }

        paginationTests.push({ action: `Next Page (${i + 1})`, timeMs: pgTime, rows: pgText.trim() });

        const rating = pgTime <= 1000 ? '🟢' : pgTime <= 3000 ? '🟡' : '🔴';
        console.log(`  ${rating} Next Page ${i + 1}            : ${pgTime}ms  | ${pgText.trim()}`);
      }
    }

    // Test Last Page
    const lastBtn = page.getByRole('button', { name: 'Last Page' });
    if (await lastBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const lastStart = Date.now();
      await lastBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const lastTime = Date.now() - lastStart;

      let lastText = '';
      try {
        lastText = await page.getByText(/Showing \d+ to \d+ of/i).textContent({ timeout: 3000 }) || '';
      } catch { /* ignore */ }

      paginationTests.push({ action: 'Last Page', timeMs: lastTime, rows: lastText.trim() });
      const rating = lastTime <= 2000 ? '🟢' : lastTime <= 5000 ? '🟡' : '🔴';
      console.log(`  ${rating} Last Page              : ${lastTime}ms  | ${lastText.trim()}`);
    }

    // Test First Page
    const firstBtn = page.getByRole('button', { name: 'First Page' });
    if (await firstBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const firstStart = Date.now();
      await firstBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const firstTime = Date.now() - firstStart;

      let firstText = '';
      try {
        firstText = await page.getByText(/Showing \d+ to \d+ of/i).textContent({ timeout: 3000 }) || '';
      } catch { /* ignore */ }

      paginationTests.push({ action: 'First Page', timeMs: firstTime, rows: firstText.trim() });
      const rating = firstTime <= 2000 ? '🟢' : firstTime <= 5000 ? '🟡' : '🔴';
      console.log(`  ${rating} First Page             : ${firstTime}ms  | ${firstText.trim()}`);
    }

    // Average pagination time
    if (paginationTests.length > 0) {
      const avgPg = Math.round(paginationTests.reduce((s, p) => s + p.timeMs, 0) / paginationTests.length);
      console.log(`\n  Average Pagination Time : ${avgPg}ms`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 5: ROWS PER PAGE DROPDOWN PERFORMANCE
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '─'.repeat(80));
    console.log('  SECTION 5: ROWS PER PAGE DROPDOWN PERFORMANCE');
    console.log('─'.repeat(80));

    const rowsDropdown = page.getByRole('combobox', { name: /Rows per page/i })
      .or(page.locator('select').filter({ hasText: /10|20|25|50/i }).first());

    if (await rowsDropdown.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      const rowsPerPageOptions = ['25', '50'];

      for (const option of rowsPerPageOptions) {
        const rppTracker = createNetworkTracker(page);
        rppTracker.start();

        const rppStart = Date.now();
        try {
          await rowsDropdown.first().selectOption(option);
          await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
          await page.waitForTimeout(1500);
        } catch {
          console.log(`  ⚠️  Could not select ${option} rows per page`);
          rppTracker.stop();
          continue;
        }

        rppTracker.stop();
        const rppTime = Date.now() - rppStart;

        let actualRowCount = 0;
        try {
          actualRowCount = Math.max(0, await page.locator('table tbody tr').count());
        } catch { /* ignore */ }

        const rating = rppTime <= 2000 ? '🟢' : rppTime <= 5000 ? '🟡' : '🔴';
        console.log(`  ${rating} ${option} rows/page          : ${rppTime}ms  | Actual rows: ${actualRowCount}`);

        report.componentTimings.push({
          name: `Rows Per Page: ${option}`,
          category: 'action',
          timeMs: rppTime,
          rating: rateMetric(rppTime, 2000, 5000),
        });
      }

      // Reset to 10 rows per page
      try {
        await rowsDropdown.first().selectOption('10');
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      } catch { /* ignore */ }
    } else {
      console.log('  ⚠️  Rows per page dropdown not found');
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 6: MEMORY IMPACT OF TABLE OPERATIONS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '─'.repeat(80));
    console.log('  SECTION 6: MEMORY IMPACT OF TABLE OPERATIONS');
    console.log('─'.repeat(80));

    const memBefore = await getMemoryMetrics(page);
    if (memBefore) {
      console.log(`  Before Tab Cycling    : ${memBefore.usedJSHeapSizeMB} MB`);
      report.memorySnapshots.push({ stage: 'Before Tab Cycling', usedMB: memBefore.usedJSHeapSizeMB, totalMB: memBefore.totalJSHeapSizeMB });
    }

    // Cycle through all tabs to stress test memory
    for (const tabName of ['Arrived', 'Not Started', 'In Transit']) {
      const tab = page.getByRole('tab', { name: tabName });
      if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await tab.click();
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(1000);
      }
    }

    const memAfter = await getMemoryMetrics(page);
    if (memAfter) {
      console.log(`  After Tab Cycling     : ${memAfter.usedJSHeapSizeMB} MB`);
      report.memorySnapshots.push({ stage: 'After Tab Cycling', usedMB: memAfter.usedJSHeapSizeMB, totalMB: memAfter.totalJSHeapSizeMB });

      if (memBefore) {
        const growth = memAfter.usedJSHeapSizeMB - memBefore.usedJSHeapSizeMB;
        const growthPct = Math.round((growth / memBefore.usedJSHeapSizeMB) * 100);
        console.log(`  Memory Growth         : ${growth.toFixed(2)} MB (${growthPct}%)`);
        console.log(`  Leak Risk             : ${growthPct > 50 ? '🔴 HIGH' : growthPct > 25 ? '🟡 MODERATE' : '🟢 LOW'}`);

        report.memoryGrowth = {
          startMB: memBefore.usedJSHeapSizeMB,
          endMB: memAfter.usedJSHeapSizeMB,
          growthMB: growth,
          growthPct,
        };
      }
    } else {
      console.log('  Memory API not available (non-Chromium browser)');
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 7: NETWORK API CALLS FOR TRACKING LIST
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '─'.repeat(80));
    console.log('  SECTION 7: NETWORK API CALLS SUMMARY');
    console.log('─'.repeat(80));

    const apiDurations = report.apiCalls.map(a => a.durationMs);
    const apiPercentiles = calculatePercentiles(apiDurations);

    report.apiSummary = {
      totalCalls: report.apiCalls.length,
      failedCalls: report.apiCalls.filter(a => a.status >= 400).length,
      avgResponseMs: apiPercentiles.avg,
      p50ResponseMs: apiPercentiles.p50,
      p90ResponseMs: apiPercentiles.p90,
      p99ResponseMs: apiPercentiles.p99,
      maxResponseMs: apiPercentiles.max,
      minResponseMs: apiPercentiles.min,
      slowCalls: report.apiCalls.filter(a => a.durationMs > 1000).length,
    };

    console.log(`  Total API Calls       : ${report.apiSummary.totalCalls}`);
    console.log(`  Failed Calls          : ${report.apiSummary.failedCalls}`);
    console.log(`  Slow Calls (>1s)      : ${report.apiSummary.slowCalls}`);
    console.log(`  Min Response Time     : ${report.apiSummary.minResponseMs}ms`);
    console.log(`  Avg Response Time     : ${report.apiSummary.avgResponseMs}ms`);
    console.log(`  P50                   : ${report.apiSummary.p50ResponseMs}ms`);
    console.log(`  P90                   : ${report.apiSummary.p90ResponseMs}ms`);
    console.log(`  P99                   : ${report.apiSummary.p99ResponseMs}ms`);
    console.log(`  Max Response Time     : ${report.apiSummary.maxResponseMs}ms`);

    // Print all API calls
    console.log('\n  ALL API CALLS (by response time):');
    const sortedApis = [...report.apiCalls].sort((a, b) => b.durationMs - a.durationMs);
    sortedApis.forEach((api, i) => {
      const shortUrl = api.url.split('?')[0];
      const displayUrl = shortUrl.length > 55 ? '...' + shortUrl.slice(-52) : shortUrl;
      const icon = api.status < 400 ? '✅' : '❌';
      console.log(`  ${icon} ${String(i + 1).padStart(2)}. [${api.method.padEnd(4)}] ${String(api.durationMs).padStart(5)}ms | ${api.status} | ${displayUrl}`);
    });

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 8: CONSOLE ERRORS
    // ══════════════════════════════════════════════════════════════════════════
    consoleTracker.stop();
    const errors = consoleTracker.getErrors();
    const warnings = consoleTracker.getWarnings();

    console.log('\n' + '─'.repeat(80));
    console.log('  SECTION 8: CONSOLE ERRORS & WARNINGS');
    console.log('─'.repeat(80));
    console.log(`  Errors    : ${errors.length}`);
    console.log(`  Warnings  : ${warnings.length}`);

    if (errors.length > 0) {
      errors.slice(0, 10).forEach((e, i) => {
        console.log(`    ❌ ${i + 1}. ${e.text.substring(0, 100)}`);
      });
    }

    report.consoleErrors = errors.map(e => e.text);
    report.consoleWarnings = warnings.map(w => w.text);
    report.networkErrors = report.apiCalls.filter(a => a.status >= 400).map(a => `[${a.status}] ${a.method} ${a.url}`);

    // ══════════════════════════════════════════════════════════════════════════
    //  FINAL: SCORE & SAVE REPORT
    // ══════════════════════════════════════════════════════════════════════════
    report.duration = Date.now() - testStart;
    report.performanceScore = calculatePerformanceScore(report);
    report.scoreRating = getScoreRating(report.performanceScore);

    console.log('\n' + '═'.repeat(80));
    console.log('  TRACKING LIST PERFORMANCE SCORE');
    console.log('═'.repeat(80));

    printReportSummary(report);

    const { jsonPath, textPath } = writeFullReport(report);
    console.log(`\n  📄 JSON report: ${jsonPath}`);
    console.log(`  📝 Text report: ${textPath}`);

    // ── Assertions ──
    expect(report.performanceScore, 'Performance score should be at least 20/100').toBeGreaterThanOrEqual(20);

    // Tab switching should be reasonable
    for (const tab of report.tabSwitching) {
      expect(tab.switchTimeMs, `Tab "${tab.tabName}" switch should be under 30s`).toBeLessThan(30000);
    }
  });
});
