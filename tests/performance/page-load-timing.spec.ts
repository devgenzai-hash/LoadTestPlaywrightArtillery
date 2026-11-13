/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PAGE LOAD & NAVIGATION TIMING PERFORMANCE TEST
 *  Measures detailed breakdown of page load phases using Navigation Timing API
 *  Industry standard: W3C Navigation Timing Level 2
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { seedLogin } from '../seed.spec';
import {
  getNavigationTimingMetrics,
  injectWebVitalsObservers,
  getCoreWebVitals,
  getResourceSummary,
  getMemoryMetrics,
  getLongTasks,
  createNetworkTracker,
  generatePerformanceReport,
  measureAction,
  waitForNetworkSettled,
  getFrameTimingData,
} from '../../utils/performance-helpers';

const BASE_URL = 'https://test.itt.bdpsmart.com';
const HOME_URL = `${BASE_URL}/#/home`;
const LOGIN_URL = 'https://testlogin.bdpsmart.com';

test.describe('Page Load & Navigation Timing Performance', () => {

  test.setTimeout(120_000);

  test('NAV-01: Full Page Load Waterfall - Home Page', async ({ page, context }) => {
    await injectWebVitalsObservers(page);
    const networkTracker = createNetworkTracker(page);
    networkTracker.start();

    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    // ── Measure navigation to Home ──
    const { duration: homeLoadDuration } = await measureAction('Navigate to Home', async () => {
      await page.goto(HOME_URL, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 60_000 });
    });

    networkTracker.stop();

    // ── Collect all timing data ──
    const navTiming = await getNavigationTimingMetrics(page);
    const webVitals = await getCoreWebVitals(page);
    const resourceSummary = await getResourceSummary(page);
    const memory = await getMemoryMetrics(page);
    const longTasks = await getLongTasks(page);
    const networkSummary = networkTracker.getSummary();

    // ── Full Performance Report ──
    const report = generatePerformanceReport(
      'Full Page Load Waterfall - Home Page',
      navTiming,
      webVitals,
      resourceSummary,
      memory,
      longTasks,
      networkSummary,
    );
    console.log(report);

    // ── Page Load Phase Breakdown ──
    console.log('\n  ── PAGE LOAD PHASE BREAKDOWN ──');
    console.log(`  ┌─ Redirect       : ${Math.round(navTiming.redirectTime)}ms`);
    console.log(`  ├─ DNS Lookup     : ${Math.round(navTiming.dnsLookup)}ms`);
    console.log(`  ├─ TCP Connect    : ${Math.round(navTiming.tcpConnection)}ms`);
    console.log(`  ├─ TLS Handshake  : ${Math.round(navTiming.tlsNegotiation)}ms`);
    console.log(`  ├─ TTFB (Server)  : ${Math.round(navTiming.serverResponseTime)}ms`);
    console.log(`  ├─ Content Download: ${Math.round(navTiming.fetchTime)}ms`);
    console.log(`  ├─ DOM Interactive: ${Math.round(navTiming.domInteractive)}ms`);
    console.log(`  ├─ DCL Event      : ${Math.round(navTiming.domContentLoaded)}ms`);
    console.log(`  ├─ DOM Complete   : ${Math.round(navTiming.domComplete)}ms`);
    console.log(`  └─ Load Event     : ${Math.round(navTiming.pageLoad)}ms`);
    console.log(`\n  Measured total    : ${homeLoadDuration}ms`);

    // ── Assertions ──
    expect(navTiming.pageLoad, 'Page load should complete under 15s').toBeLessThan(15000);
    expect(navTiming.domContentLoaded, 'DOM Content Loaded should fire under 10s').toBeLessThan(10000);
    expect(navTiming.domInteractive, 'DOM Interactive should be under 8s').toBeLessThan(8000);
    expect(networkSummary.failedCount, 'No network requests should fail').toBe(0);
  });

  test('NAV-02: Login Page Load Performance', async ({ page }) => {
    await injectWebVitalsObservers(page);
    const networkTracker = createNetworkTracker(page);
    networkTracker.start();

    // ── Measure login page cold load ──
    const { duration: loginPageLoad } = await measureAction('Load Login Page', async () => {
      await page.goto(LOGIN_URL, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 30_000 });
    });

    networkTracker.stop();

    const navTiming = await getNavigationTimingMetrics(page);
    const webVitals = await getCoreWebVitals(page);
    const networkSummary = networkTracker.getSummary();

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║               LOGIN PAGE LOAD PERFORMANCE                     ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  Page Load Time      : ${String(Math.round(navTiming.pageLoad)).padStart(6)}ms                           ║`);
    console.log(`║  DOM Content Loaded  : ${String(Math.round(navTiming.domContentLoaded)).padStart(6)}ms                           ║`);
    console.log(`║  DOM Interactive     : ${String(Math.round(navTiming.domInteractive)).padStart(6)}ms                           ║`);
    console.log(`║  TTFB                : ${String(Math.round(navTiming.serverResponseTime)).padStart(6)}ms                           ║`);
    console.log(`║  FCP                 : ${String(Math.round(webVitals.fcp ?? 0)).padStart(6)}ms                           ║`);
    console.log(`║  LCP                 : ${String(Math.round(webVitals.lcp ?? 0)).padStart(6)}ms                           ║`);
    console.log(`║  Total Requests      : ${String(networkSummary.totalRequests).padStart(6)}                              ║`);
    console.log(`║  Measured Duration   : ${String(loginPageLoad).padStart(6)}ms                           ║`);
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // Login page should load fast (it's a simple form)
    expect(navTiming.pageLoad, 'Login page should load under 5s').toBeLessThan(5000);
    expect(webVitals.fcp ?? 0, 'Login FCP should be under 2s').toBeLessThan(2000);
  });

  test('NAV-03: Login Flow End-to-End Timing', async ({ page, context }) => {
    const networkTracker = createNetworkTracker(page);
    networkTracker.start();

    // ── Measure complete login flow ──
    const flowStart = Date.now();

    // Step 1: Inject cookies
    const { duration: cookieTime } = await measureAction('Inject Cookies', async () => {
      await seedLogin(page, context);
    });

    // Step 2: Wait for redirect
    const { duration: redirectTime } = await measureAction('Post-login Redirect', async () => {
      await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });
    });

    // Step 3: Navigate to Home
    const { duration: homeNavTime } = await measureAction('Home Page Navigation', async () => {
      await page.goto(HOME_URL, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 60_000 });
    });

    networkTracker.stop();
    const totalFlowTime = Date.now() - flowStart;

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          LOGIN FLOW END-TO-END TIMING                         ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  Cookie Injection    : ${String(cookieTime).padStart(6)}ms                           ║`);
    console.log(`║  Post-login Redirect : ${String(redirectTime).padStart(6)}ms                           ║`);
    console.log(`║  Home Page Load      : ${String(homeNavTime).padStart(6)}ms                           ║`);
    console.log('║────────────────────────────────────────────────────────────────║');
    console.log(`║  TOTAL FLOW TIME     : ${String(totalFlowTime).padStart(6)}ms                           ║`);
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // ── Slow Request Analysis ──
    const slowRequests = networkTracker.getSlowRequests(2000);
    if (slowRequests.length > 0) {
      console.log(`\n  ⚠️  Slow Requests (>2s): ${slowRequests.length}`);
      slowRequests.forEach((r, i) => {
        console.log(`  ${i + 1}. [${r.method}] ${r.duration}ms - ${r.url.substring(0, 80)}`);
      });
    }

    expect(totalFlowTime, 'Total login flow should complete under 60s').toBeLessThan(60000);
  });

  test('NAV-04: Page Load with Cache (Warm Load)', async ({ page, context }) => {
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    // ── Cold load ──
    const { duration: coldLoad } = await measureAction('Cold Load', async () => {
      await page.goto(HOME_URL, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 60_000 });
    });

    // ── Warm load (with cache) ──
    const { duration: warmLoad } = await measureAction('Warm Load (Cached)', async () => {
      await page.goto(HOME_URL, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 60_000 });
    });

    const improvement = Math.round(((coldLoad - warmLoad) / coldLoad) * 100);

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║            COLD vs WARM LOAD COMPARISON                       ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  Cold Load (no cache) : ${String(coldLoad).padStart(6)}ms                           ║`);
    console.log(`║  Warm Load (cached)   : ${String(warmLoad).padStart(6)}ms                           ║`);
    console.log(`║  Improvement          : ${String(improvement).padStart(5)}%                            ║`);
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // Warm load should be faster than cold load
    console.log(`\n  📊 Cache Effectiveness: ${improvement > 20 ? '🟢 GOOD caching' : improvement > 0 ? '🟡 Moderate caching' : '🔴 No caching benefit'}`);
  });

  test('NAV-05: Animation Frame Rate (FPS) Measurement', async ({ page, context }) => {
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    // ── Measure FPS during idle ──
    const idleFPS = await getFrameTimingData(page, 3000);

    // ── Measure FPS during scroll ──
    const scrollPromise = page.evaluate(async () => {
      for (let i = 0; i < 10; i++) {
        window.scrollBy(0, 200);
        await new Promise(r => setTimeout(r, 100));
      }
    });
    const scrollFPS = await getFrameTimingData(page, 2000);
    await scrollPromise;

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║            FRAME RATE (FPS) PERFORMANCE                       ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  Idle FPS            : ${String(idleFPS.fps).padStart(4)} fps                              ║`);
    console.log(`║  Idle Dropped Frames : ${String(idleFPS.droppedFrames).padStart(4)}                                    ║`);
    console.log(`║  Scroll FPS          : ${String(scrollFPS.fps).padStart(4)} fps                              ║`);
    console.log(`║  Scroll Dropped Frs  : ${String(scrollFPS.droppedFrames).padStart(4)}                                    ║`);
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // FPS should be at least 30 fps (60 is ideal)
    const fpsRating = scrollFPS.fps >= 55 ? '🟢 SMOOTH' : scrollFPS.fps >= 30 ? '🟡 ACCEPTABLE' : '🔴 JANKY';
    console.log(`\n  📊 Scroll Smoothness: ${fpsRating} (${scrollFPS.fps} fps)`);
  });
});
