/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  RESOURCE LOADING & MEMORY ANALYSIS TEST
 *  Analyzes static assets (JS, CSS, images, fonts), bundle sizes,
 *  memory usage, and resource optimization opportunities
 *  Industry standard: Lighthouse resource audit, WebPageTest
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { seedLogin } from '../seed.spec';
import {
  getResourceTimingEntries,
  getResourceSummary,
  getMemoryMetrics,
  measureAction,
} from '../../utils/performance-helpers';

const HOME_URL = 'https://test.itt.bdpsmart.com/#/home';

test.describe('Resource Loading & Memory Analysis', () => {

  test.setTimeout(120_000);

  test('RES-01: Resource Loading Breakdown by Type', async ({ page, context }) => {
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await page.waitForTimeout(2000);

    const resources = await getResourceTimingEntries(page);
    const summary = await getResourceSummary(page);

    const totalSize = resources.reduce((sum, r) => sum + r.transferSize, 0);
    const totalDuration = resources.reduce((sum, r) => sum + r.duration, 0);

    console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('║                  RESOURCE LOADING ANALYSIS                               ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Resources       : ${String(resources.length).padStart(6)}                                       ║`);
    console.log(`║  Total Transfer Size   : ${String(Math.round(totalSize / 1024)).padStart(6)} KB (${(totalSize / 1048576).toFixed(2)} MB)                    ║`);
    console.log(`║  Total Load Duration   : ${String(Math.round(totalDuration)).padStart(6)}ms                                    ║`);
    console.log('╠══════════════════════════════════════════════════════════════════════════╣');
    console.log('║  TYPE            COUNT    SIZE (KB)    AVG TIME    TOTAL TIME            ║');
    console.log('║──────────────────────────────────────────────────────────────────────────║');

    for (const [type, data] of Object.entries(summary).sort((a, b) => b[1].totalSize - a[1].totalSize)) {
      const avgTime = Math.round(data.totalDuration / data.count);
      console.log(`║  ${type.padEnd(15)} ${String(data.count).padStart(5)}    ${String(Math.round(data.totalSize / 1024)).padStart(8)} KB    ${String(avgTime).padStart(6)}ms    ${String(Math.round(data.totalDuration)).padStart(8)}ms     ║`);
    }

    console.log('╚══════════════════════════════════════════════════════════════════════════╝');

    // ── Size Budget Assertions ──
    const scripts = resources.filter(r => r.type === 'script');
    const totalScriptKB = Math.round(scripts.reduce((sum, r) => sum + r.transferSize, 0) / 1024);
    const styles = resources.filter(r => r.type === 'css' || r.type === 'link');
    const totalStyleKB = Math.round(styles.reduce((sum, r) => sum + r.transferSize, 0) / 1024);
    const images = resources.filter(r => r.type === 'img');
    const totalImageKB = Math.round(images.reduce((sum, r) => sum + r.transferSize, 0) / 1024);

    console.log(`\n  📊 JavaScript Bundle : ${totalScriptKB} KB (${scripts.length} files)`);
    console.log(`  📊 CSS Stylesheets   : ${totalStyleKB} KB (${styles.length} files)`);
    console.log(`  📊 Images            : ${totalImageKB} KB (${images.length} files)`);

    // Total page weight should be reasonable
    const totalKB = Math.round(totalSize / 1024);
    expect(totalKB, 'Total page weight should be under 10MB').toBeLessThan(10240);
  });

  test('RES-02: Largest Resources (Bundle Size Audit)', async ({ page, context }) => {
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    const resources = await getResourceTimingEntries(page);
    const largestBySize = [...resources].sort((a, b) => b.transferSize - a.transferSize).slice(0, 15);
    const slowestByDuration = [...resources].sort((a, b) => b.duration - a.duration).slice(0, 15);

    console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('║              TOP 15 LARGEST RESOURCES (by Transfer Size)                 ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════╣');
    console.log('  #   Size (KB)  Type           Duration   URL');
    console.log('  ──────────────────────────────────────────────────────────────────────────');

    largestBySize.forEach((r, i) => {
      const sizeKB = Math.round(r.transferSize / 1024);
      const shortUrl = r.name.length > 50 ? '...' + r.name.substring(r.name.length - 47) : r.name;
      console.log(`  ${String(i + 1).padStart(2)}. ${String(sizeKB).padStart(7)} KB  ${r.type.padEnd(13)} ${String(r.duration).padStart(6)}ms  ${shortUrl}`);
    });

    console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('║              TOP 15 SLOWEST RESOURCES (by Load Duration)                 ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════╣');
    console.log('  #   Duration   Size (KB)  Type           URL');
    console.log('  ──────────────────────────────────────────────────────────────────────────');

    slowestByDuration.forEach((r, i) => {
      const sizeKB = Math.round(r.transferSize / 1024);
      const shortUrl = r.name.length > 50 ? '...' + r.name.substring(r.name.length - 47) : r.name;
      console.log(`  ${String(i + 1).padStart(2)}. ${String(r.duration).padStart(6)}ms  ${String(sizeKB).padStart(7)} KB  ${r.type.padEnd(13)} ${shortUrl}`);
    });

    console.log('╚══════════════════════════════════════════════════════════════════════════╝');
  });

  test('RES-03: HTTP Protocol & Compression Analysis', async ({ page, context }) => {
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    const resources = await getResourceTimingEntries(page);

    // ── Protocol Distribution ──
    const protocolDist: Record<string, number> = {};
    resources.forEach(r => {
      const proto = r.protocol || 'unknown';
      protocolDist[proto] = (protocolDist[proto] || 0) + 1;
    });

    // ── Compression Analysis ──
    let compressedCount = 0;
    let uncompressedCount = 0;
    let totalSaved = 0;

    resources.forEach(r => {
      if (r.decodedBodySize > 0 && r.transferSize > 0) {
        if (r.transferSize < r.decodedBodySize) {
          compressedCount++;
          totalSaved += r.decodedBodySize - r.transferSize;
        } else {
          uncompressedCount++;
        }
      }
    });

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          PROTOCOL & COMPRESSION ANALYSIS                      ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║  ── HTTP Protocol Distribution ──                             ║');
    for (const [proto, count] of Object.entries(protocolDist)) {
      const pct = Math.round((count / resources.length) * 100);
      console.log(`║  ${proto.padEnd(12)} : ${String(count).padStart(4)} (${String(pct).padStart(3)}%)                          ║`);
    }
    console.log('║                                                               ║');
    console.log('║  ── Compression Status ──                                     ║');
    console.log(`║  Compressed Resources   : ${String(compressedCount).padStart(6)}                            ║`);
    console.log(`║  Uncompressed Resources : ${String(uncompressedCount).padStart(6)}                            ║`);
    console.log(`║  Data Saved by Compression: ${String(Math.round(totalSaved / 1024)).padStart(6)} KB                         ║`);
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // HTTP/2 or HTTP/3 should be used
    const http2Plus = (protocolDist['h2'] || 0) + (protocolDist['h3'] || 0);
    if (http2Plus > 0) {
      console.log(`\n  📊 Modern Protocol: 🟢 ${http2Plus} resources over HTTP/2+`);
    } else {
      console.log('\n  📊 Modern Protocol: 🟡 No HTTP/2 detected - consider upgrading');
    }
  });

  test('RES-04: JavaScript Heap Memory Profiling', async ({ page, context }) => {
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });

    // ── Measure memory at different stages ──
    const memorySnapshots: Array<{ stage: string; memory: any }> = [];

    // Stage 1: After login
    const mem1 = await getMemoryMetrics(page);
    memorySnapshots.push({ stage: 'After Login', memory: mem1 });

    // Stage 2: After home page load
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    const mem2 = await getMemoryMetrics(page);
    memorySnapshots.push({ stage: 'Home Page Loaded', memory: mem2 });

    // Stage 3: After scrolling (triggers lazy loading)
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await page.waitForTimeout(3000);
    const mem3 = await getMemoryMetrics(page);
    memorySnapshots.push({ stage: 'After Full Scroll', memory: mem3 });

    // Stage 4: After navigating back to top
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(2000);
    const mem4 = await getMemoryMetrics(page);
    memorySnapshots.push({ stage: 'Back to Top', memory: mem4 });

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║           JS HEAP MEMORY PROFILE                              ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║  STAGE                    USED (MB)    TOTAL (MB)             ║');
    console.log('║──────────────────────────────────────────────────────────────  ║');

    memorySnapshots.forEach(s => {
      if (s.memory) {
        console.log(`║  ${s.stage.padEnd(24)} ${String(s.memory.usedJSHeapSizeMB).padStart(8)} MB  ${String(s.memory.totalJSHeapSizeMB).padStart(8)} MB         ║`);
      } else {
        console.log(`║  ${s.stage.padEnd(24)}  N/A (not Chromium)                   ║`);
      }
    });

    // ── Memory Growth Analysis ──
    if (mem2 && mem4) {
      const memGrowth = mem4.usedJSHeapSizeMB - mem2.usedJSHeapSizeMB;
      const growthPct = Math.round((memGrowth / mem2.usedJSHeapSizeMB) * 100);
      console.log('║──────────────────────────────────────────────────────────────  ║');
      console.log(`║  Memory Growth         : ${String(memGrowth.toFixed(2)).padStart(8)} MB (${growthPct}%)              ║`);
      const leakRisk = growthPct > 50 ? '🔴 HIGH RISK' : growthPct > 20 ? '🟡 MODERATE' : '🟢 LOW';
      console.log(`║  Leak Risk             : ${leakRisk.padEnd(30)}        ║`);
    }

    console.log('╚════════════════════════════════════════════════════════════════╝');

    // Memory should not exceed 500MB for the page
    if (mem2) {
      expect(mem2.usedJSHeapSizeMB, 'JS heap should be under 500MB').toBeLessThan(500);
    }
  });

  test('RES-05: DOM Size & Complexity Analysis', async ({ page, context }) => {
    await seedLogin(page, context);
    await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });
    await page.goto(HOME_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    // ── Analyze DOM structure ──
    const domMetrics = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      const body = document.body;

      // Count elements by tag
      const tagCounts: Record<string, number> = {};
      allElements.forEach(el => {
        const tag = el.tagName.toLowerCase();
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });

      // Calculate DOM depth
      let maxDepth = 0;
      function getDepth(element: Element, depth: number): void {
        maxDepth = Math.max(maxDepth, depth);
        for (const child of Array.from(element.children)) {
          getDepth(child, depth + 1);
        }
      }
      getDepth(body, 0);

      // Find widest element (most children)
      let maxChildren = 0;
      let widestElement = '';
      allElements.forEach(el => {
        if (el.children.length > maxChildren) {
          maxChildren = el.children.length;
          widestElement = `<${el.tagName.toLowerCase()}>` + (el.className ? `.${el.className.toString().split(' ')[0]}` : '');
        }
      });

      return {
        totalElements: allElements.length,
        maxDepth,
        maxChildren,
        widestElement,
        topTags: Object.entries(tagCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([tag, count]) => ({ tag, count })),
        iframeCount: document.querySelectorAll('iframe').length,
        imgCount: document.querySelectorAll('img').length,
        scriptCount: document.querySelectorAll('script').length,
        styleCount: document.querySelectorAll('style').length + document.querySelectorAll('link[rel="stylesheet"]').length,
      };
    });

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              DOM SIZE & COMPLEXITY ANALYSIS                   ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  Total DOM Elements  : ${String(domMetrics.totalElements).padStart(6)}                            ║`);
    console.log(`║  Max DOM Depth       : ${String(domMetrics.maxDepth).padStart(6)}                            ║`);
    console.log(`║  Max Children        : ${String(domMetrics.maxChildren).padStart(6)}  (${domMetrics.widestElement.substring(0, 25).padEnd(25)})║`);
    console.log(`║  Images              : ${String(domMetrics.imgCount).padStart(6)}                            ║`);
    console.log(`║  Scripts             : ${String(domMetrics.scriptCount).padStart(6)}                            ║`);
    console.log(`║  Stylesheets         : ${String(domMetrics.styleCount).padStart(6)}                            ║`);
    console.log(`║  Iframes             : ${String(domMetrics.iframeCount).padStart(6)}                            ║`);
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║  ── TOP 10 ELEMENT TYPES ──                                  ║');
    domMetrics.topTags.forEach(t => {
      console.log(`║  <${t.tag.padEnd(12)}> : ${String(t.count).padStart(6)}                            ║`);
    });
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // Lighthouse recommendations: <1500 DOM elements, <32 depth, <60 children
    const domRating = domMetrics.totalElements <= 1500 ? '🟢 GOOD' : domMetrics.totalElements <= 3000 ? '🟡 MODERATE' : '🔴 EXCESSIVE';
    const depthRating = domMetrics.maxDepth <= 32 ? '🟢 GOOD' : '🔴 TOO DEEP';
    console.log(`\n  📊 DOM Size: ${domRating} (${domMetrics.totalElements} elements, recommended < 1500)`);
    console.log(`  📊 DOM Depth: ${depthRating} (${domMetrics.maxDepth} levels, recommended < 32)`);
  });
});
