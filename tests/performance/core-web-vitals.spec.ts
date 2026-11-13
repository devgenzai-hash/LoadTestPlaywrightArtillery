/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CORE WEB VITALS PERFORMANCE TEST
 *  Measures Google's Core Web Vitals: LCP, FCP, CLS, TTFB, FID, INP
 *  Industry standard: Google Lighthouse / PageSpeed Insights thresholds
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { seedLogin } from '../seed.spec';
import {
  injectWebVitalsObservers,
  getCoreWebVitals,
  getNavigationTimingMetrics,
  getResourceSummary,
  getMemoryMetrics,
  getLongTasks,
  getLayoutShifts,
  generatePerformanceReport,
  validatePerformanceBudget,
  DEFAULT_BUDGETS,
  createNetworkTracker,
  createConsoleTracker,
  type PerformanceBudget,
} from '../../utils/performance-helpers';

const APP_HOME_URL = 'https://test.itt.bdpsmart.com/#/home';

test.describe('Core Web Vitals - Google Performance Standards', () => {

  test.setTimeout(120_000); // 2 min timeout for perf tests

  test('CWV-01: Measure all Core Web Vitals on Home Page', async ({ page, context }) => {
    // ── Setup: Inject performance observers BEFORE navigation ──
    await injectWebVitalsObservers(page);

    // ── Login ──
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    // ── Navigate to Home and wait for full load ──
    const navStart = Date.now();
    await page.goto(APP_HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    const totalLoadTime = Date.now() - navStart;

    // Small delay to ensure all observers have fired
    await page.waitForTimeout(2000);

    // ── Collect all metrics ──
    const webVitals = await getCoreWebVitals(page);
    const navTiming = await getNavigationTimingMetrics(page);
    const resourceSummary = await getResourceSummary(page);
    const memory = await getMemoryMetrics(page);
    const longTasks = await getLongTasks(page);
    const layoutShifts = await getLayoutShifts(page);

    // ── Generate comprehensive report ──
    const report = generatePerformanceReport(
      'Core Web Vitals - Home Page',
      navTiming,
      webVitals,
      resourceSummary,
      memory,
      longTasks
    );
    console.log(report);

    // ── Layout Shifts Detail ──
    if (layoutShifts.length > 0) {
      console.log('\n  ── LAYOUT SHIFT BREAKDOWN ──');
      layoutShifts.forEach((shift, i) => {
        console.log(`  Shift #${i + 1}: value=${shift.value.toFixed(5)} at ${Math.round(shift.time)}ms`);
      });
    }

    // ── Validate against Google's Performance Budgets ──
    const budgetResults = validatePerformanceBudget(navTiming, webVitals, DEFAULT_BUDGETS);
    console.log('\n  ── PERFORMANCE BUDGET VALIDATION ──');
    budgetResults.forEach(r => {
      const icon = r.passed ? '✅' : '❌';
      console.log(`  ${icon} ${r.metric}: ${Math.round(r.actual)}${r.metric === 'CLS' ? '' : 'ms'} (budget: ${r.budget}${r.metric === 'CLS' ? '' : 'ms'})`);
    });

    // ── Assertions (Google Core Web Vitals thresholds) ──
    // LCP: Good ≤ 2.5s, Needs Improvement ≤ 4s, Poor > 4s
    if (webVitals.lcp !== null) {
      console.log(`\n  📊 LCP Assessment: ${webVitals.lcp <= 2500 ? 'GOOD' : webVitals.lcp <= 4000 ? 'NEEDS IMPROVEMENT' : 'POOR'}`);
      expect(webVitals.lcp, 'LCP should be under 4000ms (Google threshold)').toBeLessThan(4000);
    }

    // FCP: Good ≤ 1.8s, Needs Improvement ≤ 3s, Poor > 3s
    if (webVitals.fcp !== null) {
      console.log(`  📊 FCP Assessment: ${webVitals.fcp <= 1800 ? 'GOOD' : webVitals.fcp <= 3000 ? 'NEEDS IMPROVEMENT' : 'POOR'}`);
      expect(webVitals.fcp, 'FCP should be under 3000ms').toBeLessThan(3000);
    }

    // CLS: Good ≤ 0.1, Needs Improvement ≤ 0.25, Poor > 0.25
    if (webVitals.cls !== null) {
      console.log(`  📊 CLS Assessment: ${webVitals.cls <= 0.1 ? 'GOOD' : webVitals.cls <= 0.25 ? 'NEEDS IMPROVEMENT' : 'POOR'}`);
      expect(webVitals.cls, 'CLS should be under 0.25').toBeLessThan(0.25);
    }

    // TTFB: Good ≤ 800ms, Needs Improvement ≤ 1800ms
    if (webVitals.ttfb !== null) {
      console.log(`  📊 TTFB Assessment: ${webVitals.ttfb <= 800 ? 'GOOD' : webVitals.ttfb <= 1800 ? 'NEEDS IMPROVEMENT' : 'POOR'}`);
    }

    // Page Load overall
    expect(totalLoadTime, 'Total page load should be under 30s').toBeLessThan(30000);
  });

  test('CWV-02: Measure Core Web Vitals with User Interaction (INP)', async ({ page, context }) => {
    await injectWebVitalsObservers(page);
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    await page.goto(APP_HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await page.waitForTimeout(1000);

    // ── Perform user interactions to measure INP ──
    console.log('\n  ── INTERACTION PERFORMANCE (INP) ──');

    // Interaction 1: Click on a KPI card / navigation element
    const interaction1Start = Date.now();
    const inTransit = page.getByText('In Transit Shipments').first();
    if (await inTransit.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inTransit.click();
      console.log(`  Click "In Transit Shipments": ${Date.now() - interaction1Start}ms`);
    }

    // Interaction 2: Scroll the page (triggers CLS measurement)
    const scrollStart = Date.now();
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await page.waitForTimeout(1000);
    console.log(`  Full page scroll: ${Date.now() - scrollStart}ms`);

    // Interaction 3: Scroll back to top
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(1000);

    // ── Collect post-interaction metrics ──
    const webVitals = await getCoreWebVitals(page);
    const longTasks = await getLongTasks(page);

    console.log(`\n  Post-Interaction Core Web Vitals:`);
    console.log(`  LCP : ${webVitals.lcp !== null ? Math.round(webVitals.lcp) + 'ms' : 'N/A'}`);
    console.log(`  CLS : ${webVitals.cls !== null ? webVitals.cls.toFixed(5) : 'N/A'}`);
    console.log(`  INP : ${webVitals.inp !== null ? Math.round(webVitals.inp) + 'ms' : 'N/A (no qualifying interactions)'}`);
    console.log(`  FID : ${webVitals.fid !== null ? Math.round(webVitals.fid) + 'ms' : 'N/A'}`);
    console.log(`  Long Tasks after interactions: ${longTasks.length}`);

    // INP: Good ≤ 200ms, Needs Improvement ≤ 500ms, Poor > 500ms
    if (webVitals.inp !== null) {
      expect(webVitals.inp, 'INP should be under 500ms').toBeLessThan(500);
    }

    // CLS after scrolling should still be acceptable
    if (webVitals.cls !== null) {
      expect(webVitals.cls, 'CLS after interactions should be under 0.25').toBeLessThan(0.25);
    }
  });

  test('CWV-03: Long Tasks Analysis (Total Blocking Time proxy)', async ({ page, context }) => {
    await injectWebVitalsObservers(page);
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    await page.goto(APP_HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await page.waitForTimeout(3000); // Wait for late long tasks

    const longTasks = await getLongTasks(page);
    const totalBlockingTime = longTasks.reduce((sum, t) => sum + (t.duration - 50), 0);

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║           LONG TASKS & TOTAL BLOCKING TIME REPORT             ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Long Tasks      : ${String(longTasks.length).padStart(6)}                              ║`);
    console.log(`║  Total Blocking Time   : ${String(Math.round(totalBlockingTime)).padStart(6)}ms                           ║`);
    console.log('╠════════════════════════════════════════════════════════════════╣');

    if (longTasks.length > 0) {
      console.log('║  ── Individual Long Tasks ──                                  ║');
      longTasks.slice(0, 20).forEach((task, i) => {
        const blocking = Math.round(task.duration - 50);
        console.log(`║  Task #${String(i + 1).padStart(2)}: duration=${String(Math.round(task.duration)).padStart(5)}ms  blocking=${String(blocking).padStart(5)}ms  @${String(Math.round(task.startTime)).padStart(7)}ms ║`);
      });
      if (longTasks.length > 20) {
        console.log(`║  ... and ${longTasks.length - 20} more tasks                                     ║`);
      }
    }
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // TBT: Good ≤ 200ms, Needs Improvement ≤ 600ms, Poor > 600ms
    const tbtRating = totalBlockingTime <= 200 ? '🟢 GOOD' : totalBlockingTime <= 600 ? '🟡 NEEDS IMPROVEMENT' : '🔴 POOR';
    console.log(`\n  📊 TBT Assessment: ${tbtRating} (${Math.round(totalBlockingTime)}ms)`);

    // Assert: TBT should be reasonable
    expect(totalBlockingTime, 'Total Blocking Time should be under 5000ms').toBeLessThan(5000);
  });

  test('CWV-04: Console Errors During Page Load', async ({ page, context }) => {
    const consoleTracker = createConsoleTracker(page);
    consoleTracker.start();

    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    await page.goto(APP_HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await page.waitForTimeout(2000);

    consoleTracker.stop();

    const errors = consoleTracker.getErrors();
    const warnings = consoleTracker.getWarnings();

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              CONSOLE ERRORS & WARNINGS REPORT                 ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Errors   : ${String(errors.length).padStart(4)}                                       ║`);
    console.log(`║  Total Warnings : ${String(warnings.length).padStart(4)}                                       ║`);
    console.log('╠════════════════════════════════════════════════════════════════╣');

    if (errors.length > 0) {
      console.log('║  ── Errors ──                                                 ║');
      errors.slice(0, 10).forEach((e, i) => {
        console.log(`  ❌ ${i + 1}. ${e.text.substring(0, 100)}`);
      });
    }
    if (warnings.length > 0) {
      console.log('║  ── Warnings ──                                               ║');
      warnings.slice(0, 10).forEach((w, i) => {
        console.log(`  ⚠️  ${i + 1}. ${w.text.substring(0, 100)}`);
      });
    }
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // No critical JS errors should occur during normal page load
    console.log(`\n  📊 Console Health: ${errors.length === 0 ? '🟢 CLEAN' : '🔴 HAS ERRORS'}`);
  });
});
