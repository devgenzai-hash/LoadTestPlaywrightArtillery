/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PERFORMANCE REPORT WRITER
 *  Writes all performance metrics to JSON and human-readable text files
 *  so results are stored persistently for analysis and comparison.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  NavigationTimingMetrics,
  CoreWebVitals,
  MemoryMetrics,
  ResourceMetrics,
} from './performance-helpers';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PageMetrics {
  pageName: string;
  url?: string;
  loadTimeMs: number;
  networkSettledMs?: number;
  navTiming?: NavigationTimingMetrics;
  webVitals?: CoreWebVitals;
  memory?: MemoryMetrics | null;
  longTasks?: Array<{ duration: number; startTime: number }>;
  resourceSummary?: Record<string, { count: number; totalSize: number; totalDuration: number }>;
  networkSummary?: {
    totalRequests: number;
    failedCount: number;
    slowCount: number;
    avgDuration: number;
    byType?: Record<string, number>;
  };
  domMetrics?: {
    totalElements: number;
    maxDepth: number;
    maxChildren: number;
    imgCount: number;
    scriptCount: number;
    styleCount: number;
  };
}

export interface ComponentTiming {
  name: string;
  category: string; // 'kpi' | 'section' | 'tab
  // le' | 'tab' | 'widget' | 'action'
  timeMs: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}

export interface TableMetrics {
  tableName: string;
  rowsLoaded: number;
  totalRows: number;
  timeToFirstRowMs: number;
  timeToAllRowsMs: number;
  paginationTimeMs?: number;
  filterTimeMs?: number;
  sortTimeMs?: number;
  columns: string[];
}

export interface TabSwitchMetrics {
  tabName: string;
  switchTimeMs: number;
  dataLoadTimeMs: number;
  rowCount: number;
}

export interface APICallMetrics {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  sizeBytes: number;
  resourceType: string;
}

export interface PerformanceTestReport {
  testName: string;
  timestamp: string;
  duration: number;
  browser: string;
  baseUrl: string;

  // Overall score
  performanceScore: number;
  scoreRating: string;

  // Login & Auth
  loginMetrics?: {
    cookieInjectionMs: number;
    authRedirectMs: number;
    totalLoginFlowMs: number;
  };

  // Page-level metrics
  pages: PageMetrics[];

  // Component render timings
  componentTimings: ComponentTiming[];

  // Table performance
  tables: TableMetrics[];

  // Tab switching
  tabSwitching: TabSwitchMetrics[];

  // API performance
  apiCalls: APICallMetrics[];
  apiSummary: {
    totalCalls: number;
    failedCalls: number;
    avgResponseMs: number;
    p50ResponseMs: number;
    p90ResponseMs: number;
    p99ResponseMs: number;
    maxResponseMs: number;
    minResponseMs: number;
    slowCalls: number; // >1s
  };

  // Cold vs Warm load
  cacheAnalysis?: {
    coldLoadMs: number;
    warmLoadMs: number;
    improvementPct: number;
  };

  // Frame rate
  frameRate?: {
    idleFps: number;
    scrollFps: number;
    droppedFrames: number;
  };

  // Memory
  memorySnapshots: Array<{ stage: string; usedMB: number; totalMB: number }>;
  memoryGrowth?: { startMB: number; endMB: number; growthMB: number; growthPct: number };

  // Errors
  consoleErrors: string[];
  consoleWarnings: string[];
  networkErrors: string[];

  // Budget validations
  budgetResults: Array<{ metric: string; actual: number; budget: number; passed: boolean }>;
}

// ── Report Output Directory ──────────────────────────────────────────────────

const REPORTS_DIR = path.resolve(__dirname, '..', 'test-results', 'performance-reports');

function ensureReportsDir(): void {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

// ── Timestamp Helper ─────────────────────────────────────────────────────────

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ── Rating Helpers ───────────────────────────────────────────────────────────

export function rateMetric(value: number, goodThreshold: number, poorThreshold: number): 'good' | 'needs-improvement' | 'poor' {
  if (value <= goodThreshold) return 'good';
  if (value <= poorThreshold) return 'needs-improvement';
  return 'poor';
}

function ratingIcon(rating: string): string {
  switch (rating) {
    case 'good': return '🟢';
    case 'needs-improvement': return '🟡';
    case 'poor': return '🔴';
    default: return '⚪';
  }
}

function ratingBar(rating: string): string {
  switch (rating) {
    case 'good': return '██████████ GOOD';
    case 'needs-improvement': return '██████░░░░ NEEDS WORK';
    case 'poor': return '███░░░░░░░ POOR';
    default: return '░░░░░░░░░░ N/A';
  }
}

// ── Percentile Calculator ────────────────────────────────────────────────────

export function calculatePercentiles(values: number[]): { p50: number; p90: number; p99: number; min: number; max: number; avg: number } {
  if (values.length === 0) return { p50: 0, p90: 0, p99: 0, min: 0, max: 0, avg: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length),
  };
}

// ── Write JSON Report ────────────────────────────────────────────────────────

export function writeJsonReport(report: PerformanceTestReport): string {
  ensureReportsDir();
  const filename = `perf-report-${getTimestamp()}.json`;
  const filepath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n  📄 JSON report saved: ${filepath}`);
  return filepath;
}

// ── Write Human-Readable Text Report ─────────────────────────────────────────

export function writeTextReport(report: PerformanceTestReport): string {
  ensureReportsDir();
  const filename = `perf-report-${getTimestamp()}.txt`;
  const filepath = path.join(REPORTS_DIR, filename);

  const lines: string[] = [];
  const w = (s: string) => lines.push(s);
  const HR = '═'.repeat(90);
  const hr = '─'.repeat(90);

  w('');
  w(`╔${HR}╗`);
  w(`║${'COMPREHENSIVE PERFORMANCE TEST REPORT'.padStart(63).padEnd(90)}║`);
  w(`╠${HR}╣`);
  w(`║  Test Name    : ${report.testName.padEnd(72)}║`);
  w(`║  Timestamp    : ${report.timestamp.padEnd(72)}║`);
  w(`║  Browser      : ${report.browser.padEnd(72)}║`);
  w(`║  Base URL     : ${report.baseUrl.padEnd(72)}║`);
  w(`║  Total Runtime: ${(report.duration / 1000).toFixed(1)}s`.padEnd(91) + '║');
  w(`╠${HR}╣`);

  // ── Performance Score ──
  const scoreBar = '█'.repeat(Math.round(report.performanceScore / 5)) + '░'.repeat(20 - Math.round(report.performanceScore / 5));
  w(`║${''.padEnd(90)}║`);
  w(`║    PERFORMANCE SCORE: ${report.performanceScore}/100  [${scoreBar}]  ${report.scoreRating}`.padEnd(91) + '║');
  w(`║${''.padEnd(90)}║`);
  w(`╠${HR}╣`);

  // ── Login & Auth ──
  if (report.loginMetrics) {
    w(`║  ── LOGIN & AUTHENTICATION FLOW ──`.padEnd(91) + '║');
    w(`║  Cookie Injection    : ${String(report.loginMetrics.cookieInjectionMs).padStart(6)}ms`.padEnd(91) + '║');
    w(`║  Auth Redirect       : ${String(report.loginMetrics.authRedirectMs).padStart(6)}ms`.padEnd(91) + '║');
    w(`║  Total Login Flow    : ${String(report.loginMetrics.totalLoginFlowMs).padStart(6)}ms`.padEnd(91) + '║');
    w(`║  ${hr.slice(0, 88)}║`);
  }

  // ── Page Load Metrics ──
  if (report.pages.length > 0) {
    w(`║${''.padEnd(90)}║`);
    w(`║  ── PAGE LOAD METRICS ──`.padEnd(91) + '║');
    w(`║  ${'PAGE'.padEnd(28)} ${'LOAD'.padStart(8)}  ${'DCL'.padStart(8)}  ${'TTFB'.padStart(8)}  ${'FCP'.padStart(8)}  ${'LCP'.padStart(8)}  RATING`.padEnd(91) + '║');
    w(`║  ${hr.slice(0, 88)}║`);

    for (const pg of report.pages) {
      const ttfb = pg.webVitals?.ttfb ?? pg.navTiming?.serverResponseTime ?? 0;
      const fcp = pg.webVitals?.fcp ?? 0;
      const lcp = pg.webVitals?.lcp ?? 0;
      const dcl = pg.navTiming?.domContentLoaded ?? 0;
      const rating = rateMetric(pg.loadTimeMs, 5000, 15000);
      w(`║  ${ratingIcon(rating)} ${pg.pageName.padEnd(26)} ${String(Math.round(pg.loadTimeMs)).padStart(6)}ms  ${String(Math.round(dcl)).padStart(6)}ms  ${String(Math.round(ttfb)).padStart(6)}ms  ${String(Math.round(fcp)).padStart(6)}ms  ${String(Math.round(lcp)).padStart(6)}ms  ${ratingBar(rating)}`.padEnd(91) + '║');
    }
    w(`║${''.padEnd(90)}║`);
  }

  // ── Core Web Vitals ──
  const homeVitals = report.pages.find(p => p.webVitals)?.webVitals;
  if (homeVitals) {
    w(`╠${HR}╣`);
    w(`║  ── CORE WEB VITALS (Google Lighthouse Standards) ──`.padEnd(91) + '║');
    w(`║${''.padEnd(90)}║`);

    const lcpR = homeVitals.lcp !== null ? rateMetric(homeVitals.lcp, 2500, 4000) : 'poor';
    const fcpR = homeVitals.fcp !== null ? rateMetric(homeVitals.fcp, 1800, 3000) : 'poor';
    const clsR = homeVitals.cls !== null ? rateMetric(homeVitals.cls, 0.1, 0.25) : 'poor';
    const ttfbR = homeVitals.ttfb !== null ? rateMetric(homeVitals.ttfb, 800, 1800) : 'poor';

    w(`║  ${ratingIcon(lcpR)} LCP  (Largest Contentful Paint)  : ${String(Math.round(homeVitals.lcp ?? 0)).padStart(6)}ms  ${ratingBar(lcpR)}`.padEnd(91) + '║');
    w(`║  ${ratingIcon(fcpR)} FCP  (First Contentful Paint)    : ${String(Math.round(homeVitals.fcp ?? 0)).padStart(6)}ms  ${ratingBar(fcpR)}`.padEnd(91) + '║');
    w(`║  ${ratingIcon(clsR)} CLS  (Cumulative Layout Shift)   : ${String((homeVitals.cls ?? 0).toFixed(4)).padStart(8)}  ${ratingBar(clsR)}`.padEnd(91) + '║');
    w(`║  ${ratingIcon(ttfbR)} TTFB (Time to First Byte)        : ${String(Math.round(homeVitals.ttfb ?? 0)).padStart(6)}ms  ${ratingBar(ttfbR)}`.padEnd(91) + '║');
    w(`║  FID  (First Input Delay)        : ${String(Math.round(homeVitals.fid ?? 0)).padStart(6)}ms`.padEnd(91) + '║');
    w(`║  INP  (Interaction to Next Paint): ${String(Math.round(homeVitals.inp ?? 0)).padStart(6)}ms`.padEnd(91) + '║');
    w(`║${''.padEnd(90)}║`);
  }

  // ── Component Render Timings ──
  if (report.componentTimings.length > 0) {
    w(`╠${HR}╣`);
    w(`║  ── COMPONENT RENDER TIMINGS ──`.padEnd(91) + '║');
    w(`║  ${'COMPONENT'.padEnd(40)} ${'CATEGORY'.padEnd(12)} ${'TIME'.padStart(8)}  RATING`.padEnd(91) + '║');
    w(`║  ${hr.slice(0, 88)}║`);

    for (const ct of report.componentTimings) {
      w(`║  ${ratingIcon(ct.rating)} ${ct.name.padEnd(38)} ${ct.category.padEnd(12)} ${String(ct.timeMs).padStart(6)}ms  ${ratingBar(ct.rating)}`.padEnd(91) + '║');
    }
    w(`║${''.padEnd(90)}║`);
  }

  // ── Table Performance ──
  if (report.tables.length > 0) {
    w(`╠${HR}╣`);
    w(`║  ── TABLE DATA POPULATION PERFORMANCE ──`.padEnd(91) + '║');
    w(`║${''.padEnd(90)}║`);

    for (const tbl of report.tables) {
      const ttfr = rateMetric(tbl.timeToFirstRowMs, 2000, 5000);
      const ttar = rateMetric(tbl.timeToAllRowsMs, 5000, 15000);
      w(`║  📋 ${tbl.tableName}`.padEnd(91) + '║');
      w(`║     Rows Displayed     : ${tbl.rowsLoaded} of ${tbl.totalRows} total`.padEnd(91) + '║');
      w(`║     ${ratingIcon(ttfr)} Time to First Row  : ${String(tbl.timeToFirstRowMs).padStart(6)}ms  ${ratingBar(ttfr)}`.padEnd(91) + '║');
      w(`║     ${ratingIcon(ttar)} Time to All Rows   : ${String(tbl.timeToAllRowsMs).padStart(6)}ms  ${ratingBar(ttar)}`.padEnd(91) + '║');
      if (tbl.paginationTimeMs !== undefined) {
        const pgR = rateMetric(tbl.paginationTimeMs, 1000, 3000);
        w(`║     ${ratingIcon(pgR)} Pagination Time    : ${String(tbl.paginationTimeMs).padStart(6)}ms  ${ratingBar(pgR)}`.padEnd(91) + '║');
      }
      if (tbl.columns.length > 0) {
        w(`║     Columns (${tbl.columns.length})       : ${tbl.columns.slice(0, 5).join(', ')}${tbl.columns.length > 5 ? '...' : ''}`.padEnd(91) + '║');
      }
      w(`║${''.padEnd(90)}║`);
    }
  }

  // ── Tab Switching Performance ──
  if (report.tabSwitching.length > 0) {
    w(`╠${HR}╣`);
    w(`║  ── TAB SWITCHING PERFORMANCE ──`.padEnd(91) + '║');
    w(`║  ${'TAB'.padEnd(24)} ${'SWITCH'.padStart(8)}  ${'DATA LOAD'.padStart(10)}  ${'ROWS'.padStart(6)}  RATING`.padEnd(91) + '║');
    w(`║  ${hr.slice(0, 88)}║`);

    for (const tab of report.tabSwitching) {
      const rating = rateMetric(tab.switchTimeMs, 2000, 5000);
      w(`║  ${ratingIcon(rating)} ${tab.tabName.padEnd(22)} ${String(tab.switchTimeMs).padStart(6)}ms  ${String(tab.dataLoadTimeMs).padStart(8)}ms  ${String(tab.rowCount).padStart(6)}  ${ratingBar(rating)}`.padEnd(91) + '║');
    }

    const avgSwitch = Math.round(report.tabSwitching.reduce((s, t) => s + t.switchTimeMs, 0) / report.tabSwitching.length);
    w(`║  Average Switch Time : ${String(avgSwitch).padStart(6)}ms`.padEnd(91) + '║');
    w(`║${''.padEnd(90)}║`);
  }

  // ── API Performance ──
  if (report.apiCalls.length > 0) {
    w(`╠${HR}╣`);
    w(`║  ── API / NETWORK PERFORMANCE ──`.padEnd(91) + '║');
    w(`║${''.padEnd(90)}║`);
    w(`║  Total API Calls     : ${String(report.apiSummary.totalCalls).padStart(6)}`.padEnd(91) + '║');
    w(`║  Failed Calls        : ${String(report.apiSummary.failedCalls).padStart(6)}`.padEnd(91) + '║');
    w(`║  Slow Calls (>1s)    : ${String(report.apiSummary.slowCalls).padStart(6)}`.padEnd(91) + '║');
    w(`║  Min Response Time   : ${String(report.apiSummary.minResponseMs).padStart(6)}ms`.padEnd(91) + '║');
    w(`║  Avg Response Time   : ${String(report.apiSummary.avgResponseMs).padStart(6)}ms`.padEnd(91) + '║');
    w(`║  P50 Response Time   : ${String(report.apiSummary.p50ResponseMs).padStart(6)}ms`.padEnd(91) + '║');
    w(`║  P90 Response Time   : ${String(report.apiSummary.p90ResponseMs).padStart(6)}ms`.padEnd(91) + '║');
    w(`║  P99 Response Time   : ${String(report.apiSummary.p99ResponseMs).padStart(6)}ms`.padEnd(91) + '║');
    w(`║  Max Response Time   : ${String(report.apiSummary.maxResponseMs).padStart(6)}ms`.padEnd(91) + '║');
    w(`║${''.padEnd(90)}║`);

    // Top 15 slowest
    const slowest = [...report.apiCalls].sort((a, b) => b.durationMs - a.durationMs).slice(0, 15);
    w(`║  ── TOP 15 SLOWEST API CALLS ──`.padEnd(91) + '║');
    slowest.forEach((api, i) => {
      const shortUrl = api.url.split('?')[0];
      const displayUrl = shortUrl.length > 50 ? '...' + shortUrl.slice(-47) : shortUrl;
      const icon = api.status < 400 ? '✅' : '❌';
      w(`  ${icon} ${String(i + 1).padStart(2)}. [${api.method.padEnd(4)}] ${String(api.durationMs).padStart(5)}ms | ${api.status} | ${displayUrl}`);
    });
    w(`║${''.padEnd(90)}║`);
  }

  // ── Cache Analysis ──
  if (report.cacheAnalysis) {
    w(`╠${HR}╣`);
    w(`║  ── COLD vs WARM LOAD (CACHE EFFECTIVENESS) ──`.padEnd(91) + '║');
    w(`║  Cold Load (no cache)  : ${String(report.cacheAnalysis.coldLoadMs).padStart(6)}ms`.padEnd(91) + '║');
    w(`║  Warm Load (cached)    : ${String(report.cacheAnalysis.warmLoadMs).padStart(6)}ms`.padEnd(91) + '║');
    w(`║  Cache Improvement     : ${String(report.cacheAnalysis.improvementPct).padStart(5)}%`.padEnd(91) + '║');
    w(`║${''.padEnd(90)}║`);
  }

  // ── Frame Rate ──
  if (report.frameRate) {
    w(`╠${HR}╣`);
    w(`║  ── FRAME RATE (FPS) ──`.padEnd(91) + '║');
    w(`║  Idle FPS             : ${String(report.frameRate.idleFps).padStart(4)} fps`.padEnd(91) + '║');
    w(`║  Scroll FPS           : ${String(report.frameRate.scrollFps).padStart(4)} fps`.padEnd(91) + '║');
    w(`║  Dropped Frames       : ${String(report.frameRate.droppedFrames).padStart(4)}`.padEnd(91) + '║');
    w(`║${''.padEnd(90)}║`);
  }

  // ── Memory ──
  if (report.memorySnapshots.length > 0) {
    w(`╠${HR}╣`);
    w(`║  ── MEMORY USAGE (JS HEAP) ──`.padEnd(91) + '║');
    w(`║  ${'STAGE'.padEnd(30)} ${'USED'.padStart(10)}  ${'TOTAL'.padStart(10)}`.padEnd(91) + '║');
    w(`║  ${hr.slice(0, 88)}║`);
    for (const snap of report.memorySnapshots) {
      w(`║  ${snap.stage.padEnd(30)} ${String(snap.usedMB.toFixed(2)).padStart(8)} MB  ${String(snap.totalMB.toFixed(2)).padStart(8)} MB`.padEnd(91) + '║');
    }
    if (report.memoryGrowth) {
      w(`║  ${hr.slice(0, 88)}║`);
      w(`║  Memory Growth: ${report.memoryGrowth.growthMB.toFixed(2)} MB (${report.memoryGrowth.growthPct}%)`.padEnd(91) + '║');
    }
    w(`║${''.padEnd(90)}║`);
  }

  // ── Budget Validations ──
  if (report.budgetResults.length > 0) {
    w(`╠${HR}╣`);
    w(`║  ── PERFORMANCE BUDGET VALIDATION ──`.padEnd(91) + '║');
    w(`║  ${'METRIC'.padEnd(25)} ${'ACTUAL'.padStart(10)} ${'BUDGET'.padStart(10)} ${'STATUS'.padStart(8)}`.padEnd(91) + '║');
    w(`║  ${hr.slice(0, 88)}║`);
    for (const b of report.budgetResults) {
      const icon = b.passed ? '✅' : '❌';
      const unit = b.metric === 'CLS' ? '' : 'ms';
      w(`║  ${icon} ${b.metric.padEnd(23)} ${String(Math.round(b.actual)).padStart(8)}${unit}  ${String(b.budget).padStart(8)}${unit}  ${b.passed ? 'PASS' : 'FAIL'}`.padEnd(91) + '║');
    }
    w(`║${''.padEnd(90)}║`);
  }

  // ── Errors ──
  if (report.consoleErrors.length > 0 || report.networkErrors.length > 0) {
    w(`╠${HR}╣`);
    w(`║  ── ERRORS DETECTED ──`.padEnd(91) + '║');
    w(`║  Console Errors  : ${String(report.consoleErrors.length).padStart(4)}`.padEnd(91) + '║');
    w(`║  Network Errors  : ${String(report.networkErrors.length).padStart(4)}`.padEnd(91) + '║');
    report.consoleErrors.slice(0, 10).forEach((e, i) => {
      w(`  ❌ ${i + 1}. ${e.substring(0, 80)}`);
    });
    report.networkErrors.slice(0, 10).forEach((e, i) => {
      w(`  🌐 ${i + 1}. ${e.substring(0, 80)}`);
    });
    w(`║${''.padEnd(90)}║`);
  }

  w(`╚${HR}╝`);
  w('');
  w(`Report generated at: ${report.timestamp}`);
  w(`Test duration: ${(report.duration / 1000).toFixed(1)}s`);
  w('');

  const content = lines.join('\n');
  fs.writeFileSync(filepath, content, 'utf-8');
  console.log(`  📝 Text report saved: ${filepath}`);
  return filepath;
}

// ── Write Both Reports ───────────────────────────────────────────────────────

export function writeFullReport(report: PerformanceTestReport): { jsonPath: string; textPath: string } {
  const jsonPath = writeJsonReport(report);
  const textPath = writeTextReport(report);
  return { jsonPath, textPath };
}

// ── Create Empty Report Template ─────────────────────────────────────────────

export function createEmptyReport(testName: string, browser: string, baseUrl: string): PerformanceTestReport {
  return {
    testName,
    timestamp: new Date().toISOString(),
    duration: 0,
    browser,
    baseUrl,
    performanceScore: 100,
    scoreRating: 'FAST',
    pages: [],
    componentTimings: [],
    tables: [],
    tabSwitching: [],
    apiCalls: [],
    apiSummary: {
      totalCalls: 0,
      failedCalls: 0,
      avgResponseMs: 0,
      p50ResponseMs: 0,
      p90ResponseMs: 0,
      p99ResponseMs: 0,
      maxResponseMs: 0,
      minResponseMs: 0,
      slowCalls: 0,
    },
    memorySnapshots: [],
    consoleErrors: [],
    consoleWarnings: [],
    networkErrors: [],
    budgetResults: [],
  };
}

// ── Calculate Performance Score (Lighthouse-inspired) ────────────────────────

export function calculatePerformanceScore(report: PerformanceTestReport): number {
  let score = 100;

  const homeVitals = report.pages.find(p => p.webVitals)?.webVitals;
  if (homeVitals) {
    // LCP (25% weight)
    if (homeVitals.lcp !== null) {
      if (homeVitals.lcp > 4000) score -= 25;
      else if (homeVitals.lcp > 2500) score -= 12;
    }
    // FCP (10% weight)
    if (homeVitals.fcp !== null) {
      if (homeVitals.fcp > 3000) score -= 10;
      else if (homeVitals.fcp > 1800) score -= 5;
    }
    // CLS (15% weight)
    if (homeVitals.cls !== null) {
      if (homeVitals.cls > 0.25) score -= 15;
      else if (homeVitals.cls > 0.1) score -= 7;
    }
    // TTFB (10% weight)
    if (homeVitals.ttfb !== null) {
      if (homeVitals.ttfb > 1800) score -= 10;
      else if (homeVitals.ttfb > 800) score -= 5;
    }
  }

  // TBT / Long Tasks (20% weight)
  const longTasks = report.pages.flatMap(p => p.longTasks || []);
  const tbt = longTasks.reduce((s, t) => s + (t.duration - 50), 0);
  if (tbt > 600) score -= 20;
  else if (tbt > 200) score -= 10;

  // Network errors (10% weight)
  if (report.apiSummary.failedCalls > 5) score -= 10;
  else if (report.apiSummary.failedCalls > 0) score -= 5;

  // Console errors (10% weight)
  if (report.consoleErrors.length > 10) score -= 10;
  else if (report.consoleErrors.length > 0) score -= 3;

  score = Math.max(0, Math.min(100, score));
  return score;
}

export function getScoreRating(score: number): string {
  if (score >= 90) return '🟢 FAST';
  if (score >= 50) return '🟡 MODERATE';
  return '🔴 SLOW';
}

// ── Print Report Summary to Console ──────────────────────────────────────────

export function printReportSummary(report: PerformanceTestReport): void {
  console.log('\n' + '═'.repeat(90));
  console.log('  📊 PERFORMANCE TEST SUMMARY');
  console.log('═'.repeat(90));
  console.log(`  Score: ${report.performanceScore}/100 ${report.scoreRating}`);
  console.log(`  Pages tested: ${report.pages.length}`);
  console.log(`  Components measured: ${report.componentTimings.length}`);
  console.log(`  Tables analyzed: ${report.tables.length}`);
  console.log(`  Tabs switched: ${report.tabSwitching.length}`);
  console.log(`  API calls tracked: ${report.apiSummary.totalCalls}`);
  console.log(`  Console errors: ${report.consoleErrors.length}`);
  console.log(`  Network errors: ${report.networkErrors.length}`);
  console.log(`  Budget checks: ${report.budgetResults.filter(b => b.passed).length}/${report.budgetResults.length} passed`);
  console.log('═'.repeat(90));
}
