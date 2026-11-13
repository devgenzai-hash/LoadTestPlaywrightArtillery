/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MULTI-PAGE SPA NAVIGATION PERFORMANCE TEST
 *  Measures client-side routing performance, tab switching,
 *  page transitions, and cross-page performance consistency
 *  Industry standard: SPA routing benchmarks, Time-to-Interactive
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { seedLogin } from '../seed.spec';
import {
  measureAction,
  createNetworkTracker,
  getMemoryMetrics,
  injectWebVitalsObservers,
  getCoreWebVitals,
  getNavigationTimingMetrics,
  getResourceSummary,
  getLongTasks,
  generatePerformanceReport,
} from '../../utils/performance-helpers';

const BASE_URL = 'https://test.itt.bdpsmart.com';
const HOME_URL = `${BASE_URL}/#/home`;

test.describe('Multi-Page SPA Navigation Performance', () => {

  test.setTimeout(180_000); // 3 min for multi-page tests

  test('SPA-01: Navigation Timing Across All Main Pages', async ({ page, context }) => {
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    const pageTimings: Array<{ name: string; loadTime: number; networkSettled: number }> = [];

    // ── Navigate to Home ──
    const homeResult = await measureAction('Home Page', async () => {
      await page.goto(HOME_URL, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 60_000 });
    });
    pageTimings.push({ name: 'Home Page', loadTime: homeResult.duration, networkSettled: homeResult.duration });

    // ── Navigate to Tracking List ──
    const trackingResult = await measureAction('Tracking List', async () => {
      const trackingLink = page.getByRole('link', { name: /Tracking List/i });
      if (await trackingLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await trackingLink.click();
        await page.waitForLoadState('networkidle', { timeout: 60_000 });
      }
    });
    pageTimings.push({ name: 'Tracking List', loadTime: trackingResult.duration, networkSettled: trackingResult.duration });

    // ── Navigate back to Home via menu ──
    const homeBackResult = await measureAction('Home (Back)', async () => {
      const homeLink = page.getByRole('link', { name: /Home/i }).first();
      if (await homeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await homeLink.click();
        await page.waitForLoadState('networkidle', { timeout: 60_000 });
      }
    });
    pageTimings.push({ name: 'Home (Return)', loadTime: homeBackResult.duration, networkSettled: homeBackResult.duration });

    // ── Report ──
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║            SPA NAVIGATION TIMING - ALL PAGES                      ║');
    console.log('╠════════════════════════════════════════════════════════════════════╣');
    console.log('║  PAGE                      LOAD TIME    NETWORK SETTLED           ║');
    console.log('║──────────────────────────────────────────────────────────────────  ║');

    pageTimings.forEach(p => {
      const rating = p.loadTime <= 3000 ? '🟢' : p.loadTime <= 5000 ? '🟡' : '🔴';
      console.log(`║  ${rating} ${p.name.padEnd(24)} ${String(p.loadTime).padStart(6)}ms    ${String(p.networkSettled).padStart(6)}ms           ║`);
    });

    const avgLoad = Math.round(pageTimings.reduce((sum, p) => sum + p.loadTime, 0) / pageTimings.length);
    console.log('║──────────────────────────────────────────────────────────────────  ║');
    console.log(`║  Average Load Time       : ${String(avgLoad).padStart(6)}ms                              ║`);
    console.log('╚════════════════════════════════════════════════════════════════════╝');
  });

  test('SPA-02: Client-Side Route Change Performance', async ({ page, context }) => {
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    // ── Measure SPA route changes using Performance Mark/Measure API ──
    const routeChanges: Array<{ from: string; to: string; duration: number; apiCalls: number }> = [];

    // Helper to measure route change
    async function measureRouteChange(name: string, action: () => Promise<void>): Promise<number> {
      const tracker = createNetworkTracker(page);
      tracker.start();
      const start = Date.now();

      await action();
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

      tracker.stop();
      const duration = Date.now() - start;
      const apiCalls = tracker.getRequests().filter(r => r.resourceType === 'xhr' || r.resourceType === 'fetch').length;

      routeChanges.push({
        from: 'current',
        to: name,
        duration,
        apiCalls,
      });
      return duration;
    }

    // ── Route change: Home → Tracking List ──
    await measureRouteChange('Tracking List', async () => {
      const link = page.getByRole('link', { name: /Tracking List/i });
      if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
        await link.click();
      }
    });

    // ── Wait for page to be interactable, then go back ──
    await page.waitForTimeout(2000);

    // ── Route change: Tracking List → Home ──
    await measureRouteChange('Home', async () => {
      const link = page.getByRole('link', { name: /Home/i }).first();
      if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
        await link.click();
      }
    });

    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║           CLIENT-SIDE ROUTE CHANGE PERFORMANCE                    ║');
    console.log('╠════════════════════════════════════════════════════════════════════╣');
    console.log('║  DESTINATION               DURATION    API CALLS                  ║');
    console.log('║──────────────────────────────────────────────────────────────────  ║');

    routeChanges.forEach(r => {
      const rating = r.duration <= 1000 ? '🟢' : r.duration <= 3000 ? '🟡' : '🔴';
      console.log(`║  ${rating} ${r.to.padEnd(24)} ${String(r.duration).padStart(6)}ms     ${String(r.apiCalls).padStart(4)}                  ║`);
    });

    console.log('╚════════════════════════════════════════════════════════════════════╝');

    // SPA route changes should be faster than full page loads
    routeChanges.forEach(r => {
      expect(r.duration, `Route to ${r.to} should complete under 15s`).toBeLessThan(15000);
    });
  });

  test('SPA-03: Tracking List Tab Switching Performance', async ({ page, context }) => {
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    // Navigate to Tracking List
    const trackingLink = page.getByRole('link', { name: /Tracking List/i });
    if (await trackingLink.isVisible({ timeout: 10000 }).catch(() => false)) {
      await trackingLink.click();
      await page.waitForLoadState('networkidle', { timeout: 60_000 });
    }

    // ── Measure tab switching within Tracking List ──
    const tabTimings: Array<{ tab: string; duration: number }> = [];

    const tabs = ['In Transit', 'Arrived', 'Not Started'];

    for (const tabName of tabs) {
      const tab = page.getByRole('tab', { name: tabName });
      if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
        const start = Date.now();
        await tab.click();
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(1000); // Wait for data render
        const duration = Date.now() - start;

        tabTimings.push({ tab: tabName, duration });
      }
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║         TRACKING LIST TAB SWITCHING PERFORMANCE               ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║  TAB                   SWITCH TIME                            ║');
    console.log('║──────────────────────────────────────────────────────────────  ║');

    tabTimings.forEach(t => {
      const rating = t.duration <= 500 ? '🟢' : t.duration <= 2000 ? '🟡' : '🔴';
      console.log(`║  ${rating} ${t.tab.padEnd(20)} ${String(t.duration).padStart(6)}ms                          ║`);
    });

    if (tabTimings.length > 0) {
      const avgSwitch = Math.round(tabTimings.reduce((sum, t) => sum + t.duration, 0) / tabTimings.length);
      console.log('║──────────────────────────────────────────────────────────────  ║');
      console.log(`║  Average Switch Time : ${String(avgSwitch).padStart(6)}ms                          ║`);
    }
    console.log('╚════════════════════════════════════════════════════════════════╝');
  });

  test('SPA-04: Memory Leak Detection Across Navigations', async ({ page, context }) => {
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    const memoryReadings: Array<{ step: string; usedMB: number }> = [];

    // ── Navigate back and forth multiple times to detect leaks ──
    for (let i = 0; i < 3; i++) {
      // Go to Home
      await page.goto(HOME_URL, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 60_000 });
      await page.waitForTimeout(1000);

      const memHome = await getMemoryMetrics(page);
      if (memHome) {
        memoryReadings.push({ step: `Home #${i + 1}`, usedMB: memHome.usedJSHeapSizeMB });
      }

      // Navigate to Tracking List
      const trackingLink = page.getByRole('link', { name: /Tracking List/i });
      if (await trackingLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await trackingLink.click();
        await page.waitForLoadState('networkidle', { timeout: 60_000 });
        await page.waitForTimeout(1000);

        const memTracking = await getMemoryMetrics(page);
        if (memTracking) {
          memoryReadings.push({ step: `Tracking #${i + 1}`, usedMB: memTracking.usedJSHeapSizeMB });
        }
      }
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║         MEMORY LEAK DETECTION - NAVIGATION CYCLES             ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');

    let prevMB = 0;
    memoryReadings.forEach(m => {
      const diff = prevMB > 0 ? m.usedMB - prevMB : 0;
      const diffStr = diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);
      const icon = diff > 5 ? '🔴' : diff > 2 ? '🟡' : '🟢';
      console.log(`║  ${icon} ${m.step.padEnd(18)} : ${String(m.usedMB.toFixed(2)).padStart(8)} MB  (${diffStr.padStart(7)} MB)   ║`);
      prevMB = m.usedMB;
    });

    if (memoryReadings.length >= 4) {
      const firstHome = memoryReadings.find(m => m.step.includes('Home #1'))?.usedMB || 0;
      const lastHome = memoryReadings.filter(m => m.step.includes('Home')).pop()?.usedMB || 0;
      const growth = lastHome - firstHome;
      const growthPct = firstHome > 0 ? Math.round((growth / firstHome) * 100) : 0;

      console.log('║──────────────────────────────────────────────────────────────  ║');
      console.log(`║  Memory Growth (Home→Home): ${String(growth.toFixed(2)).padStart(7)} MB (${growthPct}%)            ║`);
      const leakRating = growthPct > 50 ? '🔴 PROBABLE LEAK' : growthPct > 25 ? '🟡 WATCH' : '🟢 HEALTHY';
      console.log(`║  Assessment              : ${leakRating.padEnd(28)}       ║`);
    }

    console.log('╚════════════════════════════════════════════════════════════════╝');
  });

  test('SPA-05: Comprehensive Performance Scorecard', async ({ page, context }) => {
    await injectWebVitalsObservers(page);
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    const networkTracker = createNetworkTracker(page);
    networkTracker.start();

    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await page.waitForTimeout(3000);

    networkTracker.stop();

    // ── Collect everything ──
    const webVitals = await getCoreWebVitals(page);
    const navTiming = await getNavigationTimingMetrics(page);
    const resourceSummary = await getResourceSummary(page);
    const memory = await getMemoryMetrics(page);
    const longTasks = await getLongTasks(page);
    const networkSummary = networkTracker.getSummary();

    // ── Calculate Performance Score (Lighthouse-inspired) ──
    let score = 100;

    // LCP scoring (25% weight)
    if (webVitals.lcp !== null) {
      if (webVitals.lcp > 4000) score -= 25;
      else if (webVitals.lcp > 2500) score -= 12;
    }

    // FCP scoring (10% weight)
    if (webVitals.fcp !== null) {
      if (webVitals.fcp > 3000) score -= 10;
      else if (webVitals.fcp > 1800) score -= 5;
    }

    // CLS scoring (25% weight)
    if (webVitals.cls !== null) {
      if (webVitals.cls > 0.25) score -= 25;
      else if (webVitals.cls > 0.1) score -= 12;
    }

    // TBT scoring (30% weight)
    const totalBlockingTime = longTasks.reduce((sum, t) => sum + (t.duration - 50), 0);
    if (totalBlockingTime > 600) score -= 30;
    else if (totalBlockingTime > 200) score -= 15;

    // Speed Index proxy (10% weight)
    if (navTiming.domContentLoaded > 5000) score -= 10;
    else if (navTiming.domContentLoaded > 3000) score -= 5;

    score = Math.max(0, score);
    const scoreEmoji = score >= 90 ? '🟢' : score >= 50 ? '🟡' : '🔴';
    const scoreLabel = score >= 90 ? 'FAST' : score >= 50 ? 'MODERATE' : 'SLOW';

    // ── Full Report ──
    const report = generatePerformanceReport(
      'Comprehensive Performance Scorecard',
      navTiming,
      webVitals,
      resourceSummary,
      memory,
      longTasks,
      networkSummary,
    );
    console.log(report);

    console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                                                                              ║');
    console.log(`║                    ${scoreEmoji} PERFORMANCE SCORE: ${String(score).padStart(3)}/100 (${scoreLabel})                       ║`);
    console.log('║                                                                              ║');
    console.log('║  Score Breakdown:                                                            ║');
    console.log(`║  • LCP  (25%): ${webVitals.lcp !== null ? Math.round(webVitals.lcp) + 'ms' : 'N/A'}                                                       ║`);
    console.log(`║  • FCP  (10%): ${webVitals.fcp !== null ? Math.round(webVitals.fcp) + 'ms' : 'N/A'}                                                       ║`);
    console.log(`║  • CLS  (25%): ${webVitals.cls !== null ? webVitals.cls.toFixed(4) : 'N/A'}                                                        ║`);
    console.log(`║  • TBT  (30%): ${Math.round(totalBlockingTime)}ms                                                         ║`);
    console.log(`║  • DCL  (10%): ${Math.round(navTiming.domContentLoaded)}ms                                                         ║`);
    console.log('║                                                                              ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════════╝');

    // Overall score should be at least 30 (very lenient for complex apps)
    expect(score, 'Performance score should be at least 30/100').toBeGreaterThanOrEqual(30);
  });
});
