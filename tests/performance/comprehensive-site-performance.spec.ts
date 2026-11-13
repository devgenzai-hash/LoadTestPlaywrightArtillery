/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  COMPREHENSIVE SITE-WIDE PERFORMANCE TEST
 *  
 *  This is the MASTER performance test that covers every aspect of the website:
 *  
 *  1. LOGIN FLOW              – Cookie injection, auth redirect, login form timing
 *  2. HOME PAGE               – Full load, KPI cards, map, sections, widgets
 *  3. CORE WEB VITALS         – LCP, FCP, CLS, TTFB, FID, INP (Google standards)
 *  4. TRACKING LIST           – Page load, table data population, all columns
 *  5. TAB SWITCHING           – In Transit, Arrived, Not Started tab performance
 *  6. TABLE PERFORMANCE       – Row render time, pagination, data population
 *  7. SPA NAVIGATION          – Client-side route changes across all pages
 *  8. NETWORK / API           – All XHR/Fetch calls, response times, failures
 *  9. RESOURCE ANALYSIS       – JS bundles, CSS, images, fonts, transfer sizes
 *  10. MEMORY PROFILING       – JS heap usage across navigations, leak detection
 *  11. DOM COMPLEXITY         – Element count, depth, complexity analysis
 *  12. FRAME RATE             – FPS during idle and scroll
 *  13. COLD vs WARM LOAD     – Cache effectiveness measurement
 *  14. CONSOLE ERRORS         – JS errors and warnings during full session
 *  15. PERFORMANCE BUDGETS    – Google Lighthouse-style budget validation
 *  
 *  All results are PRINTED to console AND SAVED to files:
 *  - test-results/performance-reports/perf-report-<timestamp>.json
 *  - test-results/performance-reports/perf-report-<timestamp>.txt
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { seedLogin } from '../seed.spec';
import {
  injectWebVitalsObservers,
  getCoreWebVitals,
  getNavigationTimingMetrics,
  getResourceSummary,
  getResourceTimingEntries,
  getMemoryMetrics,
  getLongTasks,
  getLayoutShifts,
  generatePerformanceReport,
  validatePerformanceBudget,
  DEFAULT_BUDGETS,
  createNetworkTracker,
  createConsoleTracker,
  measureAction,
  getFrameTimingData,
  waitForNetworkSettled,
} from '../../utils/performance-helpers';
import {
  createEmptyReport,
  writeFullReport,
  calculatePerformanceScore,
  getScoreRating,
  printReportSummary,
  rateMetric,
  calculatePercentiles,
  type PerformanceTestReport,
  type ComponentTiming,
  type TableMetrics,
  type TabSwitchMetrics,
  type APICallMetrics,
} from '../../utils/report-writer';

const BASE_URL = 'https://test.itt.bdpsmart.com';
const HOME_URL = `${BASE_URL}/#/home`;
const LOGIN_URL = 'https://testlogin.bdpsmart.com';

test.describe('🔬 Comprehensive Site-Wide Performance Test', () => {

  test.setTimeout(300_000); // 5 minutes for the full suite

  test('MASTER-01: Full Site Performance Audit', async ({ page, context, browserName }) => {
    const testStart = Date.now();
    const report = createEmptyReport(
      'Full Site Performance Audit',
      browserName || 'unknown',
      BASE_URL
    );

    // ── Setup: Console error tracking for the ENTIRE session ──
    const consoleTracker = createConsoleTracker(page);
    consoleTracker.start();

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 1: LOGIN FLOW PERFORMANCE
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('  PHASE 1: LOGIN FLOW PERFORMANCE');
    console.log('═'.repeat(80));

    const loginStart = Date.now();

    const { duration: cookieTime } = await measureAction('Cookie Injection', async () => {
      await seedLogin(page, context);
    });
    console.log(`  ✅ Cookie Injection         : ${cookieTime}ms`);

    const { duration: redirectTime } = await measureAction('Auth Redirect', async () => {
      await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });
    });
    console.log(`  ✅ Auth Redirect            : ${redirectTime}ms`);

    const totalLoginFlow = Date.now() - loginStart;
    console.log(`  ✅ Total Login Flow         : ${totalLoginFlow}ms`);

    report.loginMetrics = {
      cookieInjectionMs: cookieTime,
      authRedirectMs: redirectTime,
      totalLoginFlowMs: totalLoginFlow,
    };

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 2: HOME PAGE LOAD + CORE WEB VITALS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('  PHASE 2: HOME PAGE LOAD + CORE WEB VITALS');
    console.log('═'.repeat(80));

    // Inject Web Vitals observers before navigation
    await injectWebVitalsObservers(page);

    const homeNetworkTracker = createNetworkTracker(page);
    homeNetworkTracker.start();

    const homeNavStart = Date.now();
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    const homeLoadTime = Date.now() - homeNavStart;

    // Wait for observers to fire
    await page.waitForTimeout(2000);

    homeNetworkTracker.stop();

    // Collect all home page metrics
    const homeNavTiming = await getNavigationTimingMetrics(page);
    const homeWebVitals = await getCoreWebVitals(page);
    const homeResourceSummary = await getResourceSummary(page);
    const homeMemory = await getMemoryMetrics(page);
    const homeLongTasks = await getLongTasks(page);
    const homeLayoutShifts = await getLayoutShifts(page);
    const homeNetworkSummary = homeNetworkTracker.getSummary();
    const homeAllRequests = homeNetworkTracker.getRequests();

    // Print the full performance report
    const homeReport = generatePerformanceReport(
      'Home Page Load',
      homeNavTiming,
      homeWebVitals,
      homeResourceSummary,
      homeMemory,
      homeLongTasks,
      homeNetworkSummary,
    );
    console.log(homeReport);

    // Store in report
    report.pages.push({
      pageName: 'Home Page',
      url: HOME_URL,
      loadTimeMs: homeLoadTime,
      networkSettledMs: homeLoadTime,
      navTiming: homeNavTiming,
      webVitals: homeWebVitals,
      memory: homeMemory,
      longTasks: homeLongTasks,
      resourceSummary: homeResourceSummary,
      networkSummary: homeNetworkSummary,
    });

    // Store API calls
    const homeApiCalls = homeAllRequests.filter(r =>
      r.resourceType === 'xhr' || r.resourceType === 'fetch' ||
      r.url.includes('/api/') || r.url.includes('/graphql')
    );
    homeApiCalls.forEach(r => {
      report.apiCalls.push({
        url: r.url,
        method: r.method,
        status: r.status,
        durationMs: r.duration,
        sizeBytes: r.size,
        resourceType: r.resourceType,
      });
    });

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 3: HOME PAGE COMPONENT RENDER TIMINGS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('  PHASE 3: HOME PAGE COMPONENT RENDER TIMINGS');
    console.log('═'.repeat(80));

    // Re-navigate to measure component render timings from scratch
    const componentNavStart = Date.now();
    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });

    // Measure each component's visibility time
    const componentMeasurements: Array<{ name: string; category: string; selector: () => any }> = [
      { name: 'Global Shipment Overview (Map)', category: 'widget', selector: () => page.getByText(/Global Shipment Over[Vv]iew/i) },
      { name: 'In Transit Shipments KPI', category: 'kpi', selector: () => page.getByText('In Transit Shipments').first() },
      { name: 'Arrived Shipments KPI', category: 'kpi', selector: () => page.getByText('Arrived Shipments').first() },
      { name: 'Not Started Shipments KPI', category: 'kpi', selector: () => page.getByText('Not Started Shipments').first() },
    ];

    for (const comp of componentMeasurements) {
      try {
        await expect(comp.selector()).toBeVisible({ timeout: 30_000 });
        const renderTime = Date.now() - componentNavStart;
        const rating = rateMetric(renderTime, 3000, 8000);
        console.log(`  ${rating === 'good' ? '🟢' : rating === 'needs-improvement' ? '🟡' : '🔴'} ${comp.name.padEnd(40)} : ${renderTime}ms`);
        report.componentTimings.push({ name: comp.name, category: comp.category, timeMs: renderTime, rating });
      } catch {
        console.log(`  ⚪ ${comp.name.padEnd(40)} : NOT FOUND (timeout)`);
        report.componentTimings.push({ name: comp.name, category: comp.category, timeMs: -1, rating: 'poor' });
      }
    }

    // Scroll to load below-the-fold content
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await page.waitForTimeout(2000);

    const belowFoldComponents: Array<{ name: string; category: string; selector: () => any }> = [
      { name: 'Recently Viewed Shipments', category: 'section', selector: () => page.getByRole('heading', { name: 'Recently Viewed Shipments' }) },
      { name: 'Favourite Shipments', category: 'section', selector: () => page.getByRole('heading', { name: 'Favourite Shipments' }) },
      { name: 'Top Trade Lanes', category: 'section', selector: () => page.getByRole('heading', { name: 'Top Trade Lanes' }) },
    ];

    for (const comp of belowFoldComponents) {
      try {
        await expect(comp.selector()).toBeVisible({ timeout: 15_000 });
        const renderTime = Date.now() - componentNavStart;
        const rating = rateMetric(renderTime, 5000, 15000);
        console.log(`  ${rating === 'good' ? '🟢' : rating === 'needs-improvement' ? '🟡' : '🔴'} ${comp.name.padEnd(40)} : ${renderTime}ms`);
        report.componentTimings.push({ name: comp.name, category: comp.category, timeMs: renderTime, rating });
      } catch {
        console.log(`  ⚪ ${comp.name.padEnd(40)} : NOT FOUND (timeout)`);
        report.componentTimings.push({ name: comp.name, category: comp.category, timeMs: -1, rating: 'poor' });
      }
    }

    const totalComponentTime = Date.now() - componentNavStart;
    console.log(`  ── Total Home Page Render   : ${totalComponentTime}ms`);

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 4: TRACKING LIST – TABLE DATA POPULATION
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('  PHASE 4: TRACKING LIST – TABLE DATA POPULATION');
    console.log('═'.repeat(80));

    // Scroll back to top to access navigation
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await page.waitForTimeout(500);

    const trackingNetworkTracker = createNetworkTracker(page);
    trackingNetworkTracker.start();

    const trackingNavStart = Date.now();

    // Navigate to Tracking List
    const trackingLink = page.getByRole('link', { name: /Tracking List/i });
    let trackingListLoaded = false;
    if (await trackingLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await trackingLink.click();

      // Wait for the tracking list page to be interactive
      await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
      trackingListLoaded = true;
    }

    const trackingLoadTime = Date.now() - trackingNavStart;
    console.log(`  ✅ Tracking List Navigation   : ${trackingLoadTime}ms`);

    if (trackingListLoaded) {
      // ── Measure table data population time ──
      const tableDataStart = Date.now();

      // Wait for the In Transit tab to be visible
      let tabVisible = false;
      try {
        await expect(page.getByRole('tab', { name: 'In Transit' })).toBeVisible({ timeout: 30_000 });
        tabVisible = true;
        const tabVisibleTime = Date.now() - tableDataStart;
        console.log(`  ✅ In Transit Tab Visible     : ${tabVisibleTime}ms`);
        report.componentTimings.push({
          name: 'Tracking List - In Transit Tab',
          category: 'tab',
          timeMs: tabVisibleTime,
          rating: rateMetric(tabVisibleTime, 3000, 8000),
        });
      } catch {
        console.log(`  ⚠️  In Transit Tab: NOT FOUND`);
      }

      // Wait for table rows to appear (first row data)
      let timeToFirstRow = 0;
      let timeToAllRows = 0;
      let rowCount = 0;
      let totalRows = 0;
      const detectedColumns: string[] = [];

      try {
        // Wait for any table row to appear
        const firstRowStart = Date.now();
        await page.locator('table tbody tr, [role="row"]').first().waitFor({ state: 'visible', timeout: 30_000 });
        timeToFirstRow = Date.now() - firstRowStart;
        console.log(`  ✅ Time to First Table Row    : ${timeToFirstRow}ms`);
      } catch {
        console.log(`  ⚠️  No table rows detected within timeout`);
      }

      // Wait a bit more for all rows to render
      await page.waitForTimeout(2000);
      timeToAllRows = Date.now() - tableDataStart;

      // Count visible rows
      try {
        rowCount = await page.locator('table tbody tr, [role="row"]').count() - 1; // subtract header
        if (rowCount < 0) rowCount = 0;
        console.log(`  ✅ Visible Rows               : ${rowCount}`);
      } catch {
        console.log(`  ⚠️  Could not count rows`);
      }

      // Try to read total row count from pagination
      try {
        const paginationText = await page.getByText(/Showing \d+ to \d+ of \d+ entries/i).textContent({ timeout: 5000 });
        if (paginationText) {
          const match = paginationText.match(/of (\d+)/);
          if (match) {
            totalRows = parseInt(match[1]);
            console.log(`  ✅ Total Rows (from pagination): ${totalRows}`);
          }
        }
      } catch {
        totalRows = rowCount;
      }

      // Detect visible columns
      try {
        const columnHeaders = page.locator('th, [role="columnheader"]');
        const headerCount = await columnHeaders.count();
        for (let i = 0; i < Math.min(headerCount, 20); i++) {
          const text = await columnHeaders.nth(i).textContent({ timeout: 2000 }).catch(() => '');
          if (text && text.trim()) {
            detectedColumns.push(text.trim());
          }
        }
        console.log(`  ✅ Columns Detected           : ${detectedColumns.length}`);
        console.log(`     Columns: ${detectedColumns.join(' | ')}`);
      } catch {
        console.log(`  ⚠️  Could not detect columns`);
      }

      // ── Measure Pagination Performance ──
      let paginationTime = 0;
      try {
        const nextPageBtn = page.getByRole('button', { name: 'Next Page' });
        if (await nextPageBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          const paginationStart = Date.now();
          await nextPageBtn.click();
          await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(1000);
          paginationTime = Date.now() - paginationStart;
          console.log(`  ✅ Pagination (Next Page)     : ${paginationTime}ms`);

          // Navigate back
          const prevBtn = page.getByRole('button', { name: 'Previous Page' }).or(page.getByRole('button', { name: 'First Page' }));
          if (await prevBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
            await prevBtn.first().click();
            await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
          }
        }
      } catch {
        console.log(`  ⚠️  Could not measure pagination`);
      }

      // Store table metrics
      report.tables.push({
        tableName: 'Tracking List - In Transit',
        rowsLoaded: rowCount,
        totalRows: totalRows,
        timeToFirstRowMs: timeToFirstRow,
        timeToAllRowsMs: timeToAllRows,
        paginationTimeMs: paginationTime,
        columns: detectedColumns,
      });

      // Store Tracking List page metrics
      trackingNetworkTracker.stop();
      const trackingNetSummary = trackingNetworkTracker.getSummary();
      const trackingApiCalls = trackingNetworkTracker.getRequests().filter(r =>
        r.resourceType === 'xhr' || r.resourceType === 'fetch'
      );

      report.pages.push({
        pageName: 'Tracking List',
        url: `${BASE_URL}/#/tracking-list`,
        loadTimeMs: trackingLoadTime,
        networkSettledMs: trackingLoadTime,
        networkSummary: trackingNetSummary,
      });

      trackingApiCalls.forEach(r => {
        report.apiCalls.push({
          url: r.url,
          method: r.method,
          status: r.status,
          durationMs: r.duration,
          sizeBytes: r.size,
          resourceType: r.resourceType,
        });
      });

      // ══════════════════════════════════════════════════════════════════════
      //  PHASE 5: TAB SWITCHING PERFORMANCE
      // ══════════════════════════════════════════════════════════════════════
      console.log('\n' + '═'.repeat(80));
      console.log('  PHASE 5: TAB SWITCHING PERFORMANCE');
      console.log('═'.repeat(80));

      const tabsToTest = ['In Transit', 'Arrived', 'Not Started'];

      for (const tabName of tabsToTest) {
        const tab = page.getByRole('tab', { name: tabName });
        if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
          const tabTracker = createNetworkTracker(page);
          tabTracker.start();

          const switchStart = Date.now();
          await tab.click();

          // Wait for data to load
          await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
          await page.waitForTimeout(1500);

          tabTracker.stop();

          const switchTime = Date.now() - switchStart;
          const dataLoadTime = switchTime;

          // Count rows in this tab
          let tabRowCount = 0;
          let tabTotalRows = 0;
          try {
            tabRowCount = Math.max(0, (await page.locator('table tbody tr, [role="row"]').count()) - 1);
          } catch { /* ignore */ }

          try {
            const pgText = await page.getByText(/Showing \d+ to \d+ of \d+ entries/i).textContent({ timeout: 3000 });
            if (pgText) {
              const match = pgText.match(/of (\d+)/);
              if (match) tabTotalRows = parseInt(match[1]);
            }
          } catch {
            tabTotalRows = tabRowCount;
          }

          const rating = rateMetric(switchTime, 2000, 5000);
          console.log(`  ${rating === 'good' ? '🟢' : rating === 'needs-improvement' ? '🟡' : '🔴'} ${tabName.padEnd(18)} : ${switchTime}ms | Rows: ${tabRowCount} of ${tabTotalRows}`);

          report.tabSwitching.push({
            tabName,
            switchTimeMs: switchTime,
            dataLoadTimeMs: dataLoadTime,
            rowCount: tabRowCount,
          });

          // Store table metrics for each tab
          report.tables.push({
            tableName: `Tracking List - ${tabName}`,
            rowsLoaded: tabRowCount,
            totalRows: tabTotalRows,
            timeToFirstRowMs: switchTime,
            timeToAllRowsMs: switchTime + 1500,
            columns: detectedColumns,
          });

          // Track API calls during tab switch
          tabTracker.getRequests().filter(r =>
            r.resourceType === 'xhr' || r.resourceType === 'fetch'
          ).forEach(r => {
            report.apiCalls.push({
              url: r.url,
              method: r.method,
              status: r.status,
              durationMs: r.duration,
              sizeBytes: r.size,
              resourceType: r.resourceType,
            });
          });
        } else {
          console.log(`  ⚪ ${tabName.padEnd(18)} : TAB NOT FOUND`);
        }
      }
    } else {
      trackingNetworkTracker.stop();
      console.log('  ⚠️  Could not navigate to Tracking List');
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 6: SPA NAVIGATION – ALL MAIN PAGES
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('  PHASE 6: SPA NAVIGATION – ALL MAIN PAGES');
    console.log('═'.repeat(80));

    // Navigate back to Home
    const homeBackResult = await measureAction('Home (Return)', async () => {
      const homeLink = page.getByRole('link', { name: /Home/i }).first();
      if (await homeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await homeLink.click();
        await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
      }
    });
    console.log(`  🟢 Home (Return Navigation)  : ${homeBackResult.duration}ms`);
    report.pages.push({
      pageName: 'Home (Return via SPA)',
      loadTimeMs: homeBackResult.duration,
    });

    // Try navigating to other sections if they exist
    const navItems = [
      { name: 'Dashboard', pattern: /Dashboard/i },
      { name: 'Reports', pattern: /Reports/i },
      { name: 'Analytics', pattern: /Analytics/i },
      { name: 'Settings', pattern: /Settings/i },
      { name: 'Shipments', pattern: /Shipments/i },
    ];

    for (const navItem of navItems) {
      const link = page.getByRole('link', { name: navItem.pattern });
      if (await link.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        const navResult = await measureAction(navItem.name, async () => {
          await link.first().click();
          await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
        });
        const rating = rateMetric(navResult.duration, 3000, 10000);
        console.log(`  ${rating === 'good' ? '🟢' : rating === 'needs-improvement' ? '🟡' : '🔴'} ${navItem.name.padEnd(28)} : ${navResult.duration}ms`);
        report.pages.push({
          pageName: navItem.name,
          loadTimeMs: navResult.duration,
        });

        // Navigate back to home for next test
        const backLink = page.getByRole('link', { name: /Home/i }).first();
        if (await backLink.isVisible({ timeout: 3000 }).catch(() => false)) {
          await backLink.click();
          await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 7: RESOURCE LOADING ANALYSIS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('  PHASE 7: RESOURCE LOADING ANALYSIS');
    console.log('═'.repeat(80));

    // Navigate to Home for clean resource measurement
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await page.waitForTimeout(2000);

    const resources = await getResourceTimingEntries(page);
    const resSummary = await getResourceSummary(page);

    const totalTransferSize = resources.reduce((s, r) => s + r.transferSize, 0);
    const totalResCount = resources.length;

    console.log(`  Total Resources       : ${totalResCount}`);
    console.log(`  Total Transfer Size   : ${Math.round(totalTransferSize / 1024)} KB (${(totalTransferSize / 1048576).toFixed(2)} MB)`);
    console.log('');
    console.log('  TYPE             COUNT    SIZE (KB)    AVG TIME    TOTAL TIME');
    console.log('  ' + '─'.repeat(70));

    for (const [type, data] of Object.entries(resSummary).sort((a, b) => b[1].totalSize - a[1].totalSize)) {
      const avgTime = Math.round(data.totalDuration / data.count);
      console.log(`  ${type.padEnd(16)} ${String(data.count).padStart(5)}    ${String(Math.round(data.totalSize / 1024)).padStart(8)} KB    ${String(avgTime).padStart(6)}ms    ${String(Math.round(data.totalDuration)).padStart(8)}ms`);
    }

    // Top 10 largest resources
    const largestRes = [...resources].sort((a, b) => b.transferSize - a.transferSize).slice(0, 10);
    console.log('\n  TOP 10 LARGEST RESOURCES');
    console.log('  ' + '─'.repeat(70));
    largestRes.forEach((r, i) => {
      const sizeKB = Math.round(r.transferSize / 1024);
      const shortUrl = r.name.length > 50 ? '...' + r.name.slice(-47) : r.name;
      console.log(`  ${String(i + 1).padStart(2)}. ${String(sizeKB).padStart(6)} KB  ${r.type.padEnd(12)}  ${String(r.duration).padStart(5)}ms  ${shortUrl}`);
    });

    // Top 10 slowest resources
    const slowestRes = [...resources].sort((a, b) => b.duration - a.duration).slice(0, 10);
    console.log('\n  TOP 10 SLOWEST RESOURCES');
    console.log('  ' + '─'.repeat(70));
    slowestRes.forEach((r, i) => {
      const sizeKB = Math.round(r.transferSize / 1024);
      const shortUrl = r.name.length > 50 ? '...' + r.name.slice(-47) : r.name;
      console.log(`  ${String(i + 1).padStart(2)}. ${String(r.duration).padStart(5)}ms  ${r.type.padEnd(12)}  ${String(sizeKB).padStart(6)} KB  ${shortUrl}`);
    });

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 8: COLD vs WARM LOAD (CACHE EFFECTIVENESS)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('  PHASE 8: COLD vs WARM LOAD (CACHE EFFECTIVENESS)');
    console.log('═'.repeat(80));

    // Cold load is the one we already did. Now do a warm load.
    const { duration: warmLoad } = await measureAction('Warm Load', async () => {
      await page.goto(HOME_URL, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 60_000 });
    });

    const cacheImprovement = Math.round(((homeLoadTime - warmLoad) / homeLoadTime) * 100);
    console.log(`  Cold Load (first visit) : ${homeLoadTime}ms`);
    console.log(`  Warm Load (cached)      : ${warmLoad}ms`);
    console.log(`  Improvement             : ${cacheImprovement}%`);
    console.log(`  Cache Effectiveness     : ${cacheImprovement > 20 ? '🟢 GOOD' : cacheImprovement > 0 ? '🟡 MODERATE' : '🔴 NONE'}`);

    report.cacheAnalysis = {
      coldLoadMs: homeLoadTime,
      warmLoadMs: warmLoad,
      improvementPct: cacheImprovement,
    };

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 9: FRAME RATE (FPS) MEASUREMENT
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('  PHASE 9: FRAME RATE (FPS) MEASUREMENT');
    console.log('═'.repeat(80));

    const idleFPS = await getFrameTimingData(page, 2000);

    // Measure FPS during scroll
    const scrollFPSPromise = getFrameTimingData(page, 2000);
    await page.evaluate(async () => {
      for (let i = 0; i < 10; i++) {
        window.scrollBy(0, 200);
        await new Promise(r => setTimeout(r, 100));
      }
    });
    const scrollFPS = await scrollFPSPromise;

    console.log(`  Idle FPS              : ${idleFPS.fps} fps`);
    console.log(`  Idle Dropped Frames   : ${idleFPS.droppedFrames}`);
    console.log(`  Scroll FPS            : ${scrollFPS.fps} fps`);
    console.log(`  Scroll Dropped Frames : ${scrollFPS.droppedFrames}`);
    console.log(`  Smoothness            : ${scrollFPS.fps >= 55 ? '🟢 SMOOTH' : scrollFPS.fps >= 30 ? '🟡 ACCEPTABLE' : '🔴 JANKY'}`);

    report.frameRate = {
      idleFps: idleFPS.fps,
      scrollFps: scrollFPS.fps,
      droppedFrames: scrollFPS.droppedFrames,
    };

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 10: MEMORY PROFILING
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('  PHASE 10: MEMORY PROFILING (JS HEAP)');
    console.log('═'.repeat(80));

    // Snapshot after Home page
    const memAfterHome = await getMemoryMetrics(page);
    if (memAfterHome) {
      report.memorySnapshots.push({ stage: 'After Home Page', usedMB: memAfterHome.usedJSHeapSizeMB, totalMB: memAfterHome.totalJSHeapSizeMB });
      console.log(`  After Home Page       : ${memAfterHome.usedJSHeapSizeMB} MB used / ${memAfterHome.totalJSHeapSizeMB} MB total`);
    } else {
      console.log(`  Memory API not available (non-Chromium browser)`);
    }

    // Navigate to Tracking List and measure memory
    const trackingLink2 = page.getByRole('link', { name: /Tracking List/i });
    if (await trackingLink2.isVisible({ timeout: 5000 }).catch(() => false)) {
      await trackingLink2.click();
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(2000);

      const memAfterTracking = await getMemoryMetrics(page);
      if (memAfterTracking) {
        report.memorySnapshots.push({ stage: 'After Tracking List', usedMB: memAfterTracking.usedJSHeapSizeMB, totalMB: memAfterTracking.totalJSHeapSizeMB });
        console.log(`  After Tracking List   : ${memAfterTracking.usedJSHeapSizeMB} MB used / ${memAfterTracking.totalJSHeapSizeMB} MB total`);
      }

      // Navigate back to Home
      const homeLink3 = page.getByRole('link', { name: /Home/i }).first();
      if (await homeLink3.isVisible({ timeout: 5000 }).catch(() => false)) {
        await homeLink3.click();
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(1000);
      }
    }

    const memFinal = await getMemoryMetrics(page);
    if (memFinal) {
      report.memorySnapshots.push({ stage: 'Final (After Navigation Cycle)', usedMB: memFinal.usedJSHeapSizeMB, totalMB: memFinal.totalJSHeapSizeMB });
      console.log(`  Final (After Cycle)   : ${memFinal.usedJSHeapSizeMB} MB used / ${memFinal.totalJSHeapSizeMB} MB total`);
    }

    // Memory growth analysis
    if (memAfterHome && memFinal) {
      const growthMB = memFinal.usedJSHeapSizeMB - memAfterHome.usedJSHeapSizeMB;
      const growthPct = Math.round((growthMB / memAfterHome.usedJSHeapSizeMB) * 100);
      report.memoryGrowth = {
        startMB: memAfterHome.usedJSHeapSizeMB,
        endMB: memFinal.usedJSHeapSizeMB,
        growthMB,
        growthPct,
      };
      console.log(`  Memory Growth         : ${growthMB.toFixed(2)} MB (${growthPct}%)`);
      console.log(`  Leak Risk             : ${growthPct > 50 ? '🔴 HIGH' : growthPct > 25 ? '🟡 MODERATE' : '🟢 LOW'}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 11: DOM SIZE & COMPLEXITY ANALYSIS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('  PHASE 11: DOM SIZE & COMPLEXITY ANALYSIS');
    console.log('═'.repeat(80));

    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    const domMetrics = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      const body = document.body;
      const tagCounts: Record<string, number> = {};
      allElements.forEach(el => {
        const tag = el.tagName.toLowerCase();
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });

      let maxDepth = 0;
      function getDepth(element: Element, depth: number): void {
        maxDepth = Math.max(maxDepth, depth);
        for (const child of Array.from(element.children)) {
          getDepth(child, depth + 1);
        }
      }
      getDepth(body, 0);

      let maxChildren = 0;
      allElements.forEach(el => {
        if (el.children.length > maxChildren) {
          maxChildren = el.children.length;
        }
      });

      return {
        totalElements: allElements.length,
        maxDepth,
        maxChildren,
        imgCount: document.querySelectorAll('img').length,
        scriptCount: document.querySelectorAll('script').length,
        styleCount: document.querySelectorAll('style').length + document.querySelectorAll('link[rel="stylesheet"]').length,
        iframeCount: document.querySelectorAll('iframe').length,
        topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count]) => ({ tag, count })),
      };
    });

    console.log(`  Total DOM Elements    : ${domMetrics.totalElements}`);
    console.log(`  Max DOM Depth         : ${domMetrics.maxDepth}`);
    console.log(`  Max Children per Node : ${domMetrics.maxChildren}`);
    console.log(`  Images                : ${domMetrics.imgCount}`);
    console.log(`  Scripts               : ${domMetrics.scriptCount}`);
    console.log(`  Stylesheets           : ${domMetrics.styleCount}`);
    console.log(`  Iframes               : ${domMetrics.iframeCount}`);
    console.log('');
    console.log('  TOP 10 ELEMENT TYPES:');
    domMetrics.topTags.forEach(t => {
      console.log(`    <${t.tag.padEnd(12)}> : ${t.count}`);
    });

    const domRating = domMetrics.totalElements <= 1500 ? '🟢 GOOD' : domMetrics.totalElements <= 3000 ? '🟡 MODERATE' : '🔴 EXCESSIVE';
    console.log(`\n  DOM Size Assessment   : ${domRating} (recommended < 1500 elements)`);

    // Store DOM metrics in the home page entry
    if (report.pages[0]) {
      report.pages[0].domMetrics = {
        totalElements: domMetrics.totalElements,
        maxDepth: domMetrics.maxDepth,
        maxChildren: domMetrics.maxChildren,
        imgCount: domMetrics.imgCount,
        scriptCount: domMetrics.scriptCount,
        styleCount: domMetrics.styleCount,
      };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 12: PERFORMANCE BUDGET VALIDATION
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('  PHASE 12: PERFORMANCE BUDGET VALIDATION');
    console.log('═'.repeat(80));

    const budgetResults = validatePerformanceBudget(homeNavTiming, homeWebVitals, DEFAULT_BUDGETS);
    budgetResults.forEach(r => {
      const icon = r.passed ? '✅' : '❌';
      const unit = r.metric === 'CLS' ? '' : 'ms';
      console.log(`  ${icon} ${r.metric.padEnd(25)} : ${Math.round(r.actual)}${unit} (budget: ${r.budget}${unit})`);
    });

    report.budgetResults = budgetResults;

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 13: CONSOLE ERRORS & WARNINGS
    // ══════════════════════════════════════════════════════════════════════════
    consoleTracker.stop();
    const consoleErrors = consoleTracker.getErrors();
    const consoleWarnings = consoleTracker.getWarnings();

    console.log('\n' + '═'.repeat(80));
    console.log('  PHASE 13: CONSOLE ERRORS & WARNINGS');
    console.log('═'.repeat(80));
    console.log(`  Total Errors          : ${consoleErrors.length}`);
    console.log(`  Total Warnings        : ${consoleWarnings.length}`);

    if (consoleErrors.length > 0) {
      console.log('\n  ERRORS:');
      consoleErrors.slice(0, 15).forEach((e, i) => {
        console.log(`    ❌ ${i + 1}. ${e.text.substring(0, 100)}`);
      });
    }
    if (consoleWarnings.length > 0) {
      console.log('\n  WARNINGS:');
      consoleWarnings.slice(0, 10).forEach((w, i) => {
        console.log(`    ⚠️  ${i + 1}. ${w.text.substring(0, 100)}`);
      });
    }

    report.consoleErrors = consoleErrors.map(e => e.text);
    report.consoleWarnings = consoleWarnings.map(w => w.text);

    // Network errors
    const failedRequests = report.apiCalls.filter(a => a.status >= 400);
    report.networkErrors = failedRequests.map(r => `[${r.status}] ${r.method} ${r.url}`);

    // ══════════════════════════════════════════════════════════════════════════
    //  PHASE 14: API PERFORMANCE SUMMARY
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('  PHASE 14: API PERFORMANCE SUMMARY');
    console.log('═'.repeat(80));

    const apiDurations = report.apiCalls.map(a => a.durationMs);
    const apiPercentiles = calculatePercentiles(apiDurations);

    report.apiSummary = {
      totalCalls: report.apiCalls.length,
      failedCalls: failedRequests.length,
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
    console.log(`  P50 Response Time     : ${report.apiSummary.p50ResponseMs}ms`);
    console.log(`  P90 Response Time     : ${report.apiSummary.p90ResponseMs}ms`);
    console.log(`  P99 Response Time     : ${report.apiSummary.p99ResponseMs}ms`);
    console.log(`  Max Response Time     : ${report.apiSummary.maxResponseMs}ms`);

    // Print all API calls sorted by duration
    console.log('\n  ALL API CALLS (sorted by response time):');
    console.log('  ' + '─'.repeat(70));
    const sortedApis = [...report.apiCalls].sort((a, b) => b.durationMs - a.durationMs);
    sortedApis.slice(0, 25).forEach((api, i) => {
      const shortUrl = api.url.split('?')[0];
      const displayUrl = shortUrl.length > 50 ? '...' + shortUrl.slice(-47) : shortUrl;
      const icon = api.status < 400 ? '✅' : '❌';
      console.log(`  ${icon} ${String(i + 1).padStart(2)}. [${api.method.padEnd(4)}] ${String(api.durationMs).padStart(5)}ms | ${api.status} | ${displayUrl}`);
    });

    // ══════════════════════════════════════════════════════════════════════════
    //  FINAL: CALCULATE SCORE & SAVE REPORTS
    // ══════════════════════════════════════════════════════════════════════════
    report.duration = Date.now() - testStart;
    report.performanceScore = calculatePerformanceScore(report);
    report.scoreRating = getScoreRating(report.performanceScore);

    console.log('\n' + '═'.repeat(80));
    console.log('  FINAL: PERFORMANCE SCORE & REPORT FILES');
    console.log('═'.repeat(80));

    printReportSummary(report);

    // Save to files
    const { jsonPath, textPath } = writeFullReport(report);
    console.log(`\n  📄 JSON report: ${jsonPath}`);
    console.log(`  📝 Text report: ${textPath}`);

    // ── Assertions (lenient for complex enterprise apps) ──
    expect(report.performanceScore, 'Performance score should be at least 20/100').toBeGreaterThanOrEqual(20);
    expect(homeLoadTime, 'Home page should load under 60s').toBeLessThan(60000);
  });
});
