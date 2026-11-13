// spec: test-plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '@playwright/test';
import { seedLogin } from '../seed.spec';

test.describe('Home Page Navigation & Performance', () => {
  test('Home Page Load Time and Component Render Performance', async ({ page, context }) => {

    // Seed: login the user via session cookies + form login
    await seedLogin(page, context);

    // Wait for the post-login redirect to finish before starting the clock
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    // 1. Navigate to Home page directly and record navigation start time
    const navStart = Date.now();
    await page.goto('https://test.itt.bdpsmart.com/#/home', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/#\/home/, { timeout: 15_000 });
    const navReady = Date.now() - navStart;
    console.log(`[PERF] ✅ Home page URL ready: ${navReady}ms`);

    // 2. Measure Map (Global Shipment Overview) render time
    await expect(page.getByText(/Global Shipment Over[Vv]iew/i)).toBeVisible({ timeout: 30_000 });
    const mapTime = Date.now() - navStart;
    console.log(`[PERF] ✅ Map - Global Shipment Overview: ${mapTime}ms`);

    // 3. Measure In Transit Shipments KPI render time
    await expect(page.getByText('In Transit Shipments').first()).toBeVisible({ timeout: 30_000 });
    const inTransitTime = Date.now() - navStart;
    console.log(`[PERF] ✅ KPI - In Transit Shipments: ${inTransitTime}ms`);

    // 4. Measure Arrived Shipments KPI render time
    await expect(page.getByText('Arrived Shipments').first()).toBeVisible({ timeout: 30_000 });
    const arrivedTime = Date.now() - navStart;
    console.log(`[PERF] ✅ KPI - Arrived Shipments: ${arrivedTime}ms`);

    // 5. Measure Not Started Shipments KPI render time
    await expect(page.getByText('Not Started Shipments').first()).toBeVisible({ timeout: 30_000 });
    const notStartedTime = Date.now() - navStart;
    console.log(`[PERF] ✅ KPI - Not Started Shipments: ${notStartedTime}ms`);

    // Scroll to the bottom so the widget sections below the fold are triggered to render
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));

    // 6. Measure Recently Viewed Shipments section render time
    await expect(page.getByRole('heading', { name: 'Recently Viewed Shipments' })).toBeVisible({ timeout: 30_000 });
    const recentlyViewedTime = Date.now() - navStart;
    console.log(`[PERF] ✅ Section - Recently Viewed Shipments: ${recentlyViewedTime}ms`);

    // 7. Measure Favourite Shipments section render time
    await expect(page.getByRole('heading', { name: 'Favourite Shipments' })).toBeVisible({ timeout: 30_000 });
    const favouriteTime = Date.now() - navStart;
    console.log(`[PERF] ✅ Section - Favourite Shipments: ${favouriteTime}ms`);

    // 8. Measure Top Trade Lanes section render time
    await expect(page.getByRole('heading', { name: 'Top Trade Lanes' })).toBeVisible({ timeout: 30_000 });
    const topTradeLanesTime = Date.now() - navStart;
    console.log(`[PERF] ✅ Section - Top Trade Lanes: ${topTradeLanesTime}ms`);

    const totalTime = Date.now() - navStart;

    // ── Performance Summary Report ───────────────────────────────────────────
    console.log('\n========================================================================');
    console.log('                   HOME PAGE PERFORMANCE REPORT                        ');
    console.log('========================================================================');
    console.log(`  🗺️  Map  - Global Shipment Overview        : ${mapTime}ms`);
    console.log('  ── KPI Cards ──────────────────────────────────────────────────────');
    console.log(`  📦  KPI  - In Transit Shipments            : ${inTransitTime}ms`);
    console.log(`  🚢  KPI  - Arrived Shipments               : ${arrivedTime}ms`);
    console.log(`  ⏳  KPI  - Not Started Shipments           : ${notStartedTime}ms`);
    console.log('  ── Sections ───────────────────────────────────────────────────────');
    console.log(`  👁️   Sect - Recently Viewed Shipments       : ${recentlyViewedTime}ms`);
    console.log(`  ⭐  Sect - Favourite Shipments             : ${favouriteTime}ms`);
    console.log(`  🌐  Sect - Top Trade Lanes                 : ${topTradeLanesTime}ms`);
    console.log('------------------------------------------------------------------------');
    console.log(`  ⏱️   TOTAL time from navigation start       : ${totalTime}ms`);
    console.log('========================================================================\n');

    // Assert all components render within acceptable threshold (60s)
    expect(totalTime).toBeLessThan(60000);
  });
});
