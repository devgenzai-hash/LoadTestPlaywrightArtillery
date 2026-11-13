

These are 6 tests created 
1. npx playwright test tests/performance/home-tracking-list-filter-perf.spec.ts --project=performance-edge --headed --reporter=list

2. npx playwright test tests/performance/global-search-to-details-perf.spec.ts --project=performance-edge --headed --reporter=list

3. npx playwright test tests/performance/tracking-list-filter-performance.spec.ts --project=performance-edge --headed --reporter=list

4. npx playwright test tests/performance/filter-performance.spec.ts --project=performance-edge --headed --reporter=list

5. npx playwright test tests/performance/home-page-timing.spec.ts --project=performance-edge --headed --reporter=list

6. npx playwright test tests/performance/tracking-list-tab-perf.spec.ts --project=performance-edge --headed --reporter=list



run all 6
npx playwright test tests/performance/home-tracking-list-filter-perf.spec.ts tests/performance/global-search-to-details-perf.spec.ts tests/performance/tracking-list-filter-performance.spec.ts tests/performance/filter-performance.spec.ts tests/performance/home-page-timing.spec.ts tests/performance/tracking-list-tab-perf.spec.ts --project=performance-edge --headed --reporter=list



run all 6 and then generate a CSV report 

powershell -ExecutionPolicy Bypass -File .\run-all-perf-tests.ps1

npx playwright test tests/performance/home-tracking-list-filter-perf.spec.ts tests/performance/global-search-to-details-perf.spec.ts tests/performance/tracking-list-filter-performance.spec.ts tests/performance/filter-performance.spec.ts tests/performance/home-page-timing.spec.ts tests/performance/tracking-list-tab-perf.spec.ts --project=performance-edge --project=performance-chromium --project=performance-firefox --headed --reporter=list