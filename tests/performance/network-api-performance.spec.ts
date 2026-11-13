/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  NETWORK & API PERFORMANCE MONITORING TEST
 *  Monitors all network requests, API response times, failed requests,
 *  and waterfall analysis
 *  Industry standard: HAR-style network analysis
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { seedLogin } from '../seed.spec';
import {
  createNetworkTracker,
  measureAction,
} from '../../utils/performance-helpers';

const HOME_URL = 'https://test.itt.bdpsmart.com/#/home';

test.describe('Network & API Performance Monitoring', () => {

  test.setTimeout(120_000);

  test('NET-01: API Response Time Analysis on Home Page', async ({ page, context }) => {
    const networkTracker = createNetworkTracker(page);
    networkTracker.start();

    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await page.waitForTimeout(3000); // Capture late API calls

    networkTracker.stop();

    const allRequests = networkTracker.getRequests();
    const summary = networkTracker.getSummary();

    // ── Separate API calls from static resources ──
    const apiRequests = allRequests.filter(r =>
      r.url.includes('/api/') || r.url.includes('/graphql') ||
      r.resourceType === 'xhr' || r.resourceType === 'fetch'
    );
    const staticRequests = allRequests.filter(r =>
      r.resourceType === 'script' || r.resourceType === 'stylesheet' ||
      r.resourceType === 'image' || r.resourceType === 'font'
    );

    console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║               NETWORK & API PERFORMANCE REPORT                        ║');
    console.log('╠════════════════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Requests       : ${String(allRequests.length).padStart(6)}                                     ║`);
    console.log(`║  API/XHR Requests     : ${String(apiRequests.length).padStart(6)}                                     ║`);
    console.log(`║  Static Resources     : ${String(staticRequests.length).padStart(6)}                                     ║`);
    console.log(`║  Failed Requests      : ${String(summary.failedCount).padStart(6)}                                     ║`);
    console.log(`║  Slow Requests (>1s)  : ${String(summary.slowCount).padStart(6)}                                     ║`);
    console.log(`║  Avg Response Time    : ${String(summary.avgDuration).padStart(6)}ms                                  ║`);
    console.log('╠════════════════════════════════════════════════════════════════════════╣');

    // ── Request Type Breakdown ──
    console.log('║  ── BY REQUEST TYPE ──                                                 ║');
    for (const [type, count] of Object.entries(summary.byType)) {
      const typeRequests = allRequests.filter(r => r.resourceType === type);
      const avgTime = Math.round(typeRequests.reduce((sum, r) => sum + r.duration, 0) / (typeRequests.length || 1));
      console.log(`║  ${type.padEnd(15)} : ${String(count).padStart(4)} requests, avg ${String(avgTime).padStart(5)}ms                      ║`);
    }

    // ── Top 10 Slowest Requests ──
    const slowest = [...allRequests].sort((a, b) => b.duration - a.duration).slice(0, 10);
    console.log('╠════════════════════════════════════════════════════════════════════════╣');
    console.log('║  ── TOP 10 SLOWEST REQUESTS ──                                        ║');
    slowest.forEach((r, i) => {
      const shortUrl = r.url.length > 60 ? r.url.substring(0, 57) + '...' : r.url;
      console.log(`  ${String(i + 1).padStart(2)}. [${r.method}] ${String(r.duration).padStart(5)}ms ${r.status} ${shortUrl}`);
    });

    // ── API Call Performance ──
    if (apiRequests.length > 0) {
      const apiAvg = Math.round(apiRequests.reduce((sum, r) => sum + r.duration, 0) / apiRequests.length);
      const apiMax = Math.max(...apiRequests.map(r => r.duration));
      const apiMin = Math.min(...apiRequests.map(r => r.duration));
      const apiP90 = apiRequests.sort((a, b) => a.duration - b.duration)[Math.floor(apiRequests.length * 0.9)]?.duration || 0;

      console.log('╠════════════════════════════════════════════════════════════════════════╣');
      console.log('║  ── API CALL STATISTICS ──                                             ║');
      console.log(`║  Min Response Time   : ${String(apiMin).padStart(6)}ms                                  ║`);
      console.log(`║  Avg Response Time   : ${String(apiAvg).padStart(6)}ms                                  ║`);
      console.log(`║  P90 Response Time   : ${String(apiP90).padStart(6)}ms                                  ║`);
      console.log(`║  Max Response Time   : ${String(apiMax).padStart(6)}ms                                  ║`);
    }

    // ── Failed Request Details ──
    const failedRequests = networkTracker.getFailedRequests();
    if (failedRequests.length > 0) {
      console.log('╠════════════════════════════════════════════════════════════════════════╣');
      console.log('║  ── FAILED REQUESTS ──                                                 ║');
      failedRequests.forEach((r, i) => {
        console.log(`  ❌ ${i + 1}. [${r.status}] ${r.method} ${r.url.substring(0, 70)}`);
      });
    }

    console.log('╚════════════════════════════════════════════════════════════════════════╝');

    // ── Assertions ──
    expect(summary.failedCount, 'No API requests should return errors').toBe(0);
    expect(summary.avgDuration, 'Average response time should be under 3s').toBeLessThan(3000);
  });

  test('NET-02: XHR/Fetch API Response Time with HAR Capture', async ({ page, context }) => {
    // ── Capture HAR data for detailed analysis ──
    const apiTimings: Array<{ url: string; method: string; status: number; duration: number; size: string }> = [];

    page.on('response', async (response) => {
      const request = response.request();
      const resourceType = request.resourceType();
      if (resourceType === 'xhr' || resourceType === 'fetch') {
        const timing = response.request().timing();
        const contentLength = (await response.headerValue('content-length')) || '0';
        apiTimings.push({
          url: response.url(),
          method: request.method(),
          status: response.status(),
          duration: Math.round(timing.responseEnd),
          size: contentLength,
        });
      }
    });

    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await page.waitForTimeout(3000);

    console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║              XHR/FETCH API RESPONSE TIMES                              ║');
    console.log('╠════════════════════════════════════════════════════════════════════════╣');
    console.log(`║  Total API Calls: ${String(apiTimings.length).padStart(4)}                                              ║`);
    console.log('╠════════════════════════════════════════════════════════════════════════╣');

    apiTimings.sort((a, b) => b.duration - a.duration);
    apiTimings.forEach((api, i) => {
      const shortUrl = api.url.split('?')[0]; // Remove query params
      const displayUrl = shortUrl.length > 55 ? shortUrl.substring(shortUrl.length - 55) : shortUrl;
      const statusIcon = api.status < 400 ? '✅' : '❌';
      console.log(`  ${statusIcon} ${String(i + 1).padStart(2)}. [${api.method.padEnd(4)}] ${String(api.duration).padStart(5)}ms | ${String(api.status).padStart(3)} | ${displayUrl}`);
    });

    console.log('╚════════════════════════════════════════════════════════════════════════╝');

    // All APIs should respond
    const failedAPIs = apiTimings.filter(a => a.status >= 400);
    expect(failedAPIs.length, 'No API calls should fail').toBe(0);
  });

  test('NET-03: Network Request Waterfall During Navigation', async ({ page, context }) => {
    const networkTracker = createNetworkTracker(page);
    networkTracker.start();

    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    const navStart = Date.now();
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    networkTracker.stop();

    const requests = networkTracker.getRequests();
    const relativeRequests = requests.map(r => ({
      ...r,
      relativeStart: r.timestamp - navStart,
    })).sort((a, b) => a.relativeStart - b.relativeStart);

    // ── Waterfall View ──
    console.log('\n  ── NETWORK REQUEST WATERFALL (first 30 requests) ──');
    console.log('  Time(ms)  Duration  Status  Type          URL');
    console.log('  ─────────────────────────────────────────────────────────────────');

    relativeRequests.slice(0, 30).forEach(r => {
      const shortUrl = r.url.length > 40 ? '...' + r.url.substring(r.url.length - 37) : r.url;
      const bar = '█'.repeat(Math.min(Math.round(r.duration / 100), 20));
      console.log(`  ${String(r.relativeStart).padStart(6)}  ${String(r.duration).padStart(6)}ms  ${String(r.status).padStart(3)}     ${r.resourceType.padEnd(12)}  ${shortUrl}`);
      console.log(`          ${bar}`);
    });

    // ── Parallel Request Analysis ──
    const maxConcurrent = calculateMaxConcurrency(relativeRequests);
    console.log(`\n  Max Concurrent Requests: ${maxConcurrent}`);
    console.log(`  Total Requests: ${requests.length}`);
  });

  test('NET-04: HTTP Status Code Distribution', async ({ page, context }) => {
    const networkTracker = createNetworkTracker(page);
    networkTracker.start();

    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await page.waitForTimeout(2000);

    networkTracker.stop();

    const requests = networkTracker.getRequests();
    const statusDistribution: Record<number, number> = {};
    requests.forEach(r => {
      statusDistribution[r.status] = (statusDistribution[r.status] || 0) + 1;
    });

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║           HTTP STATUS CODE DISTRIBUTION                       ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');

    for (const [status, count] of Object.entries(statusDistribution).sort()) {
      const statusNum = parseInt(status);
      const icon = statusNum < 300 ? '🟢' : statusNum < 400 ? '🟡' : '🔴';
      const bar = '█'.repeat(Math.min(count, 40));
      console.log(`║  ${icon} ${status} : ${String(count).padStart(4)} ${bar.padEnd(40)}  ║`);
    }

    console.log('╚════════════════════════════════════════════════════════════════╝');

    // No 5xx server errors
    const serverErrors = requests.filter(r => r.status >= 500);
    expect(serverErrors.length, 'No server errors (5xx) should occur').toBe(0);
  });
});

// ── Helper: Calculate max concurrent requests ──
function calculateMaxConcurrency(requests: Array<{ relativeStart: number; duration: number }>): number {
  const events: Array<{ time: number; type: 'start' | 'end' }> = [];
  requests.forEach(r => {
    events.push({ time: r.relativeStart, type: 'start' });
    events.push({ time: r.relativeStart + r.duration, type: 'end' });
  });
  events.sort((a, b) => a.time - b.time || (a.type === 'end' ? -1 : 1));

  let current = 0;
  let max = 0;
  events.forEach(e => {
    current += e.type === 'start' ? 1 : -1;
    max = Math.max(max, current);
  });
  return max;
}
