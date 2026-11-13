###############################################################################
#  RUN ALL 7 PERFORMANCE TESTS (HEADED) & GENERATE CSV REPORT
#
#  Usage:   .\run-all-perf-tests.ps1                   # defaults to Edge
#           .\run-all-perf-tests.ps1 -Browser edge      # Microsoft Edge
#           .\run-all-perf-tests.ps1 -Browser firefox   # Mozilla Firefox
#
#  What it does:
#    1. Runs each of the 7 performance test specs sequentially in headed mode
#    2. After each run, finds the latest JSON report produced by that test
#    3. Once all tests finish, parses every JSON and compiles a single CSV
#    4. Prints a quick summary table to the console
###############################################################################

param(
    [ValidateSet('edge', 'firefox')]
    [string]$Browser = 'firefox'
)

$ErrorActionPreference = "Continue"

# -- Browser Configuration --
switch ($Browser.ToLower()) {
    'firefox' {
        $ProjectName   = 'performance-firefox'
        $BrowserLabel  = 'Mozilla Firefox'
    }
    default {
        $ProjectName   = 'performance-edge'
        $BrowserLabel  = 'Microsoft Edge (headed)'
    }
}

# -- Paths --
$ROOT = $PSScriptRoot   # repo root (same folder as this script)

# Tests to run (sequential)
$tests = @(
    @{
        Name       = "Home - Tracking List Filter Perf"
        Spec       = "tests/performance/home-tracking-list-filter-perf.spec.ts"
        OutFolder  = "home-trackingListFilter"
        JsonPrefix = "home-tracking-filter-perf-"
    },
    @{
        Name       = "Global Search - Shipment Details"
        Spec       = "tests/performance/global-search-to-details-perf.spec.ts"
        OutFolder  = "GlobalSearchtoDetails"
        JsonPrefix = "global-search-details-perf-"
    },
    @{
        Name       = "Tracking List Filter Performance"
        Spec       = "tests/performance/tracking-list-filter-performance.spec.ts"
        OutFolder  = "trackingListFilter"
        JsonPrefix = "tracking-list-filter-"
    },
    @{
        Name       = "Filter Performance (Home Page)"
        Spec       = "tests/performance/filter-performance.spec.ts"
        OutFolder  = "FilterPerformance"
        JsonPrefix = "filter-perf-"
    },
    @{
        Name       = "Home Page Timing"
        Spec       = "tests/performance/home-page-timing.spec.ts"
        OutFolder  = "HomePagePerf"
        JsonPrefix = "home-page-perf-"
    },
    @{
        Name       = "Tracking List Tab Perf"
        Spec       = "tests/performance/tracking-list-tab-perf.spec.ts"
        OutFolder  = "trackingListperf"
        JsonPrefix = "tracking-list-perf-"
    },
    @{
        Name       = "Event Manager Perf"
        Spec       = "tests/performance/event-manager-perf.spec.ts"
        OutFolder  = "EventManagerPerf"
        JsonPrefix = "event-manager-perf-"
    }
)

# Helper: convert ms to seconds string (2 decimal places)
function MsToSec([double]$ms) {
    return [math]::Round($ms / 1000, 2)
}

# Helper: find the newest JSON file in a folder matching a prefix
function Get-LatestJson([string]$folder, [string]$prefix) {
    $dir = Join-Path $ROOT $folder
    if (-not (Test-Path $dir)) { return $null }
    $files = Get-ChildItem $dir -Filter "$prefix*.json" | Sort-Object LastWriteTime -Descending
    if ($files.Count -eq 0) { return $null }
    return $files[0].FullName
}

###############################################################################
#  STEP 1 -- RUN ALL TESTS
###############################################################################

# Change to project root so Playwright can find config & tests
Set-Location $ROOT

$bannerDate = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
Write-Host ""
Write-Host "==============================================================================="
Write-Host "  PERFORMANCE TEST SUITE -- $bannerDate"
Write-Host "  Environment : stage.itt.bdpsmart.com"
Write-Host "  Browser     : $BrowserLabel"
Write-Host "  Project     : $ProjectName"
Write-Host "==============================================================================="
Write-Host ""

$testResults = @()          # collect pass/fail + duration per test
$testJsonPaths = @{}        # testIndex -> latest JSON path

for ($i = 0; $i -lt $tests.Count; $i++) {
    $t = $tests[$i]
    $num = $i + 1

    Write-Host ""
    Write-Host ("=" * 70)
    Write-Host "  [$num/7] Running: $($t.Name)"
    Write-Host ("=" * 70)
    Write-Host ""

    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    # Run playwright test (use relative spec path)
    npx playwright test $t.Spec --project=$ProjectName --headed --reporter=list 2>&1 | ForEach-Object { Write-Host $_ }
    $exitCode = $LASTEXITCODE
    $sw.Stop()

    if ($exitCode -eq 0) {
        $status = "PASS"
    } else {
        $status = "FAIL"
    }
    $durSec = [math]::Round($sw.Elapsed.TotalSeconds, 1)

    # If test failed, retry once
    if ($exitCode -ne 0) {
        Write-Host ""
        Write-Host "  [RETRY] Test $num failed -- retrying once..."
        Write-Host ""
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        npx playwright test $t.Spec --project=$ProjectName --headed --reporter=list 2>&1 | ForEach-Object { Write-Host $_ }
        $exitCode = $LASTEXITCODE
        $sw.Stop()
        if ($exitCode -eq 0) {
            $status = "PASS (retry)"
        } else {
            $status = "FAIL"
        }
        $durSec = [math]::Round($sw.Elapsed.TotalSeconds, 1)
    }

    $testResults += @{ Num = $num; Name = $t.Name; Status = $status; Duration = $durSec }

    # Find the latest JSON produced by this test
    $latestJson = Get-LatestJson $t.OutFolder $t.JsonPrefix
    $testJsonPaths[$i] = $latestJson

    if ($status -match "PASS") {
        Write-Host ""
        Write-Host "  [PASS] Test $num completed in ${durSec}s" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "  [FAIL] Test $num failed after ${durSec}s" -ForegroundColor Red
    }
}

###############################################################################
#  STEP 2 -- CONSOLE SUMMARY TABLE
###############################################################################

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "  TEST EXECUTION SUMMARY" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""
Write-Host ("{0,-5} {1,-50} {2,-12} {3,8}" -f "#", "Test Name", "Status", "Duration")
Write-Host ("{0,-5} {1,-50} {2,-12} {3,8}" -f "---", ("-" * 50), ("-" * 10), "--------")

foreach ($r in $testResults) {
    $color = if ($r.Status -match "PASS") { "Green" } else { "Red" }
    Write-Host ("{0,-5} {1,-50} {2,-12} {3,7}s" -f $r.Num, $r.Name, $r.Status, $r.Duration) -ForegroundColor $color
}

$passCount = ($testResults | Where-Object { $_.Status -match "PASS" }).Count
$totalDur  = ($testResults | Measure-Object -Property Duration -Sum).Sum
Write-Host ""
Write-Host "  Passed: $passCount / $($testResults.Count)    Total time: ${totalDur}s" -ForegroundColor Cyan
Write-Host ""

###############################################################################
#  STEP 3 -- PARSE JSON FILES & BUILD CSV
###############################################################################

Write-Host "Generating CSV report..." -ForegroundColor Yellow

$today = Get-Date -Format 'yyyy-MM-dd'
$dateLabel = Get-Date -Format 'd MMM'   # e.g. "9 Mar"
$browserSuffix = $Browser.ToLower()
$csvPath = Join-Path $ROOT "performance-report-$today-$browserSuffix.csv"

# Load all JSON data (skip tests that failed or have no output)
$j = @{}
for ($i = 0; $i -lt $tests.Count; $i++) {
    $path = $testJsonPaths[$i]
    if ($path -and (Test-Path $path)) {
        $j[$i] = Get-Content $path -Raw | ConvertFrom-Json
    } else {
        $j[$i] = $null
    }
}

# Aliases for readability
$htf  = $j[0]   # home-tracking-list-filter-perf
$gsd  = $j[1]   # global-search-to-details-perf
$tlf  = $j[2]   # tracking-list-filter-performance
$fp   = $j[3]   # filter-performance
$hpt  = $j[4]   # home-page-timing
$tltp = $j[5]   # tracking-list-tab-perf
$emp  = $j[6]   # event-manager-perf

# -- Build CSV lines --
$csv = [System.Collections.ArrayList]::new()

# Helper: escape CSV values containing commas or quotes
function CsvEscape([string]$val) {
    if ($val -match '[,"]') {
        return '"' + ($val -replace '"', '""') + '"'
    }
    return $val
}

function Add-Row($feature, $page, $value) {
    [void]$csv.Add("$(CsvEscape $feature),$(CsvEscape $page),$value")
}
function Add-SectionTitle($title) {
    [void]$csv.Add(",,")
    [void]$csv.Add("=== $title ===,,")
    [void]$csv.Add("Feature / Test,Action / Page,$dateLabel (seconds)")
}
function Add-Header() {
    [void]$csv.Add("Feature,Pages,$dateLabel (seconds)")
}
function Add-Blank() {
    [void]$csv.Add(",,")
}

###########################################################################
# SECTION A – TEST 5: HOME PAGE COMPREHENSIVE TIMING
###########################################################################
Add-SectionTitle "TEST 5: Home Page Comprehensive Timing"
if ($hpt) {
    Add-Row "Home Page Load" "Dashboard Page Load" (MsToSec $hpt.pageLoadMs)
    Add-Blank

    # KPI Card Render Times
    if ($hpt.kpiResults) {
        foreach ($kpi in $hpt.kpiResults) {
            $kpiVal = if ($kpi.dataValue) { " (value: $($kpi.dataValue))" } else { "" }
            Add-Row "Home Page KPI" "$($kpi.name) - Render Time$kpiVal" (MsToSec $kpi.renderTimeMs)
        }
        Add-Blank
    }

    # Transport Tabs
    foreach ($tab in $hpt.transportTabs) {
        Add-Row "Home Page Transport Tab" "$($tab.tabName) - Tab Switch" (MsToSec $tab.switchTimeMs)
        if ($tab.dataDisplayTimeMs) {
            Add-Row "Home Page Transport Tab" "$($tab.tabName) - Data Display" (MsToSec $tab.dataDisplayTimeMs)
        }
        if ($tab.apiResponseTimeMs) {
            Add-Row "Home Page Transport Tab" "$($tab.tabName) - API Response" (MsToSec $tab.apiResponseTimeMs)
        }
        if ($tab.networkIdleTimeMs) {
            Add-Row "Home Page Transport Tab" "$($tab.tabName) - Network Idle" (MsToSec $tab.networkIdleTimeMs)
        }
        # Widget timings within each transport tab
        if ($tab.widgetTimings) {
            foreach ($w in $tab.widgetTimings) {
                $vis = if ($w.visible) { "visible" } else { "hidden" }
                Add-Row "Home Page Transport Tab" "$($tab.tabName) > Widget: $($w.widgetName) ($vis)" (MsToSec $w.renderTimeMs)
            }
        }
    }
    Add-Blank

    # Map Toggle
    if ($hpt.mapToggle) {
        Add-Row "Home Page Map" "Map Toggle ($($hpt.mapToggle.toggleName)) - Switch" (MsToSec $hpt.mapToggle.switchTimeMs)
        if ($hpt.mapToggle.networkIdleTimeMs) {
            Add-Row "Home Page Map" "Map Toggle - Network Idle" (MsToSec $hpt.mapToggle.networkIdleTimeMs)
        }
        if ($hpt.mapToggle.slowestApiMs) {
            Add-Row "Home Page Map" "Map Toggle - Slowest API" (MsToSec $hpt.mapToggle.slowestApiMs)
        }
    }
    Add-Blank

    # Global Search from Home
    if ($hpt.globalSearch) {
        Add-Row "Home Page Global Search" "Search Term: $($hpt.globalSearch.searchTerm)" ""
        Add-Row "Home Page Global Search" "Total Search Time" (MsToSec $hpt.globalSearch.searchTimeMs)
        if ($hpt.globalSearch.navigationTimeMs) {
            Add-Row "Home Page Global Search" "Navigation Time" (MsToSec $hpt.globalSearch.navigationTimeMs)
        }
        if ($hpt.globalSearch.resultLoadTimeMs) {
            Add-Row "Home Page Global Search" "Result Load Time" (MsToSec $hpt.globalSearch.resultLoadTimeMs)
        }
        if ($hpt.globalSearch.networkIdleMs) {
            Add-Row "Home Page Global Search" "Network Idle" (MsToSec $hpt.globalSearch.networkIdleMs)
        }
        if ($hpt.globalSearch.slowestApiMs) {
            Add-Row "Home Page Global Search" "Slowest API" (MsToSec $hpt.globalSearch.slowestApiMs)
        }
    }
    Add-Blank

    # API Summary
    if ($hpt.apiSummary) {
        $a = $hpt.apiSummary
        Add-Row "Home Page API Summary" "Total API Calls" $a.totalCalls
        Add-Row "Home Page API Summary" "Failed API Calls" $a.failedCalls
        Add-Row "Home Page API Summary" "Avg Response" (MsToSec $a.avgResponseMs)
        Add-Row "Home Page API Summary" "P50 Response" (MsToSec $a.p50Ms)
        Add-Row "Home Page API Summary" "P90 Response" (MsToSec $a.p90Ms)
        Add-Row "Home Page API Summary" "P99 Response" (MsToSec $a.p99Ms)
        Add-Row "Home Page API Summary" "Max Response" (MsToSec $a.maxMs)
        Add-Row "Home Page API Summary" "Min Response" (MsToSec $a.minMs)
        if ($a.slowCalls) { Add-Row "Home Page API Summary" "Slow Calls (>3s)" $a.slowCalls }
    }
    Add-Blank

    # Memory Snapshots
    if ($hpt.memorySnapshots) {
        foreach ($m in $hpt.memorySnapshots) {
            Add-Row "Home Page Memory" "$($m.stage) - Used MB" ([math]::Round($m.usedMB, 1))
            Add-Row "Home Page Memory" "$($m.stage) - Total MB" ([math]::Round($m.totalMB, 1))
        }
    }
    if ($hpt.consoleErrors -and $hpt.consoleErrors.Count -gt 0) {
        Add-Row "Home Page Errors" "Console Errors Count" $hpt.consoleErrors.Count
    }
}
Add-Blank

###########################################################################
# SECTION B – TEST 4: FILTER PERFORMANCE (HOME PAGE)
###########################################################################
Add-SectionTitle "TEST 4: Filter Performance (Home Page)"
if ($fp) {
    Add-Row "Filter Perf (Home)" "Login to Home" (MsToSec $fp.loginToHomeMs)
    Add-Row "Filter Perf (Home)" "Initial Page Load" (MsToSec $fp.initialPageLoadMs)
    Add-Blank

    # Initial KPI Results (before filter)
    if ($fp.initialKpiResults) {
        foreach ($kpi in $fp.initialKpiResults) {
            $kpiVal = if ($kpi.dataValue) { " (value: $($kpi.dataValue))" } else { "" }
            Add-Row "Filter Perf KPI (Before Filter)" "$($kpi.name) - Render Time$kpiVal" (MsToSec $kpi.renderTimeMs)
        }
        Add-Blank
    }

    # Filter Apply
    if ($fp.filterApply) {
        $fa = $fp.filterApply
        Add-Row "Filter Apply (Home)" "Filter Name" (CsvEscape $fa.filterName)
        Add-Row "Filter Apply (Home)" "Show Filter Click (sidebar open)" (MsToSec $fa.showFilterClickMs)
        Add-Row "Filter Apply (Home)" "Settings Icon Click (saved filters)" (MsToSec $fa.settingsIconClickMs)
        Add-Row "Filter Apply (Home)" "Filter Apply Time" (MsToSec $fa.filterApplyTimeMs)
        if ($fa.slowestApiMs) {
            Add-Row "Filter Apply (Home)" "Slowest API during filter" (MsToSec $fa.slowestApiMs)
        }
        Add-Blank

        # KPI Results After Filter
        if ($fa.kpiResults) {
            foreach ($kpi in $fa.kpiResults) {
                $kpiVal = if ($kpi.dataValue) { " (value: $($kpi.dataValue))" } else { "" }
                Add-Row "Filter Perf KPI (After Filter)" "$($kpi.name) - Render Time$kpiVal" (MsToSec $kpi.renderTimeMs)
            }
            Add-Blank
        }
    }

    # Transport Tabs (Post-Filter)
    foreach ($tab in $fp.transportTabs) {
        Add-Row "Transport Tab Post-Filter (Home)" "$($tab.tabName) - Tab Switch" (MsToSec $tab.switchTimeMs)
        if ($tab.dataDisplayTimeMs) {
            Add-Row "Transport Tab Post-Filter (Home)" "$($tab.tabName) - Data Display" (MsToSec $tab.dataDisplayTimeMs)
        }
        if ($tab.apiResponseTimeMs) {
            Add-Row "Transport Tab Post-Filter (Home)" "$($tab.tabName) - API Response" (MsToSec $tab.apiResponseTimeMs)
        }
        if ($tab.networkIdleTimeMs) {
            Add-Row "Transport Tab Post-Filter (Home)" "$($tab.tabName) - Network Idle" (MsToSec $tab.networkIdleTimeMs)
        }
        if ($tab.widgetTimings) {
            foreach ($w in $tab.widgetTimings) {
                $vis = if ($w.visible) { "visible" } else { "hidden" }
                Add-Row "Transport Tab Post-Filter (Home)" "$($tab.tabName) > Widget: $($w.widgetName) ($vis)" (MsToSec $w.renderTimeMs)
            }
        }
    }
    Add-Blank

    # Map Toggle Post-Filter
    if ($fp.mapToggle) {
        Add-Row "Map Toggle Post-Filter (Home)" "Map Toggle ($($fp.mapToggle.toggleName)) - Switch" (MsToSec $fp.mapToggle.switchTimeMs)
        if ($fp.mapToggle.networkIdleTimeMs) {
            Add-Row "Map Toggle Post-Filter (Home)" "Map Toggle - Network Idle" (MsToSec $fp.mapToggle.networkIdleTimeMs)
        }
        if ($fp.mapToggle.slowestApiMs) {
            Add-Row "Map Toggle Post-Filter (Home)" "Map Toggle - Slowest API" (MsToSec $fp.mapToggle.slowestApiMs)
        }
    }
    Add-Blank

    # API Summary
    if ($fp.apiSummary) {
        $a = $fp.apiSummary
        Add-Row "Filter Perf API Summary" "Total API Calls" $a.totalCalls
        Add-Row "Filter Perf API Summary" "Failed API Calls" $a.failedCalls
        Add-Row "Filter Perf API Summary" "Avg Response" (MsToSec $a.avgResponseMs)
        Add-Row "Filter Perf API Summary" "P50 Response" (MsToSec $a.p50Ms)
        Add-Row "Filter Perf API Summary" "P90 Response" (MsToSec $a.p90Ms)
        Add-Row "Filter Perf API Summary" "P99 Response" (MsToSec $a.p99Ms)
        Add-Row "Filter Perf API Summary" "Max Response" (MsToSec $a.maxMs)
        Add-Row "Filter Perf API Summary" "Min Response" (MsToSec $a.minMs)
        if ($a.slowCalls) { Add-Row "Filter Perf API Summary" "Slow Calls (>3s)" $a.slowCalls }
    }
    Add-Blank

    # Memory Snapshots
    if ($fp.memorySnapshots) {
        foreach ($m in $fp.memorySnapshots) {
            Add-Row "Filter Perf Memory" "$($m.stage) - Used MB" ([math]::Round($m.usedMB, 1))
            Add-Row "Filter Perf Memory" "$($m.stage) - Total MB" ([math]::Round($m.totalMB, 1))
        }
    }
    if ($fp.consoleErrors -and $fp.consoleErrors.Count -gt 0) {
        Add-Row "Filter Perf Errors" "Console Errors Count" $fp.consoleErrors.Count
    }
}
Add-Blank

###########################################################################
# SECTION C – TEST 6: TRACKING LIST TAB PERFORMANCE
###########################################################################
Add-SectionTitle "TEST 6: Tracking List Tab Performance Profiling"
if ($tltp) {
    Add-Row "Tracking List Nav" "Navigation to Tracking List" (MsToSec $tltp.navigationToTrackingListMs)
    Add-Blank

    # First Visit tabs
    if ($tltp.firstVisit) {
        foreach ($tab in $tltp.firstVisit) {
            Add-Row "Tracking List (First Visit)" "$($tab.tabName) - Data Load" (MsToSec $tab.dataLoadTimeMs)
            if ($tab.switchTimeMs) {
                Add-Row "Tracking List (First Visit)" "$($tab.tabName) - Tab Switch" (MsToSec $tab.switchTimeMs)
            }
            if ($tab.networkIdleTimeMs) {
                Add-Row "Tracking List (First Visit)" "$($tab.tabName) - Network Idle" (MsToSec $tab.networkIdleTimeMs)
            }
            if ($tab.rowCount) {
                Add-Row "Tracking List (First Visit)" "$($tab.tabName) - Row Count" $tab.rowCount
            }
            if ($tab.slowestApiMs) {
                Add-Row "Tracking List (First Visit)" "$($tab.tabName) - Slowest API" (MsToSec $tab.slowestApiMs)
            }
        }
        Add-Blank
    }

    # Revisit tabs
    if ($tltp.revisit) {
        foreach ($tab in $tltp.revisit) {
            Add-Row "Tracking List (Revisit)" "$($tab.tabName) - Data Load" (MsToSec $tab.dataLoadTimeMs)
            if ($tab.switchTimeMs) {
                Add-Row "Tracking List (Revisit)" "$($tab.tabName) - Tab Switch" (MsToSec $tab.switchTimeMs)
            }
            if ($tab.networkIdleTimeMs) {
                Add-Row "Tracking List (Revisit)" "$($tab.tabName) - Network Idle" (MsToSec $tab.networkIdleTimeMs)
            }
            if ($tab.rowCount) {
                Add-Row "Tracking List (Revisit)" "$($tab.tabName) - Row Count" $tab.rowCount
            }
            if ($tab.slowestApiMs) {
                Add-Row "Tracking List (Revisit)" "$($tab.tabName) - Slowest API" (MsToSec $tab.slowestApiMs)
            }
        }
        Add-Blank
    }

    # Cache Comparison
    if ($tltp.cacheComparison) {
        foreach ($cc in $tltp.cacheComparison) {
            Add-Row "Tracking List Cache Comparison" "$($cc.tabName) - First Visit" (MsToSec $cc.firstVisitMs)
            Add-Row "Tracking List Cache Comparison" "$($cc.tabName) - Revisit" (MsToSec $cc.revisitMs)
            $impPct = [math]::Round($cc.improvementPct, 1)
            Add-Row "Tracking List Cache Comparison" "$($cc.tabName) - Improvement %" "$impPct%"
        }
        Add-Blank
    }

    # Search Profiling
    if ($tltp.searchProfiling) {
        $sp = $tltp.searchProfiling
        Add-Row "Tracking List Search" "Search Term: $($sp.searchTerm)" ""
        Add-Row "Tracking List Search" "Search Time" (MsToSec $sp.searchTimeMs)
        if ($sp.networkIdleMs) {
            Add-Row "Tracking List Search" "Network Idle" (MsToSec $sp.networkIdleMs)
        }
        if ($sp.resultRowCount) {
            Add-Row "Tracking List Search" "Result Row Count" $sp.resultRowCount
        }
        if ($sp.slowestApiMs) {
            Add-Row "Tracking List Search" "Slowest API" (MsToSec $sp.slowestApiMs)
        }
        Add-Blank
    }

    # Shipment Detail Profiling
    if ($tltp.shipmentDetailProfiling) {
        $sd = $tltp.shipmentDetailProfiling
        Add-Row "Tracking List to Detail" "Shipment: $($sd.shipmentNumber)" ""
        Add-Row "Tracking List to Detail" "Navigation Time" (MsToSec $sd.navigationTimeMs)
        if ($sd.networkIdleMs) {
            Add-Row "Tracking List to Detail" "Network Idle" (MsToSec $sd.networkIdleMs)
        }
        if ($sd.totalApiTimeMs) {
            Add-Row "Tracking List to Detail" "Total API Time" (MsToSec $sd.totalApiTimeMs)
        }
        if ($sd.slowestApiMs) {
            Add-Row "Tracking List to Detail" "Slowest API" (MsToSec $sd.slowestApiMs)
        }
        Add-Blank
    }

    # API Summary
    if ($tltp.apiSummary) {
        $a = $tltp.apiSummary
        Add-Row "Tracking List API Summary" "Total API Calls" $a.totalCalls
        Add-Row "Tracking List API Summary" "Failed API Calls" $a.failedCalls
        Add-Row "Tracking List API Summary" "Avg Response" (MsToSec $a.avgResponseMs)
        Add-Row "Tracking List API Summary" "P50 Response" (MsToSec $a.p50Ms)
        Add-Row "Tracking List API Summary" "P90 Response" (MsToSec $a.p90Ms)
        Add-Row "Tracking List API Summary" "P99 Response" (MsToSec $a.p99Ms)
        Add-Row "Tracking List API Summary" "Max Response" (MsToSec $a.maxMs)
        Add-Row "Tracking List API Summary" "Min Response" (MsToSec $a.minMs)
        if ($a.slowCalls) { Add-Row "Tracking List API Summary" "Slow Calls (>3s)" $a.slowCalls }
    }
    Add-Blank

    # Memory Snapshots
    if ($tltp.memorySnapshots) {
        foreach ($m in $tltp.memorySnapshots) {
            Add-Row "Tracking List Memory" "$($m.stage) - Used MB" ([math]::Round($m.usedMB, 1))
            Add-Row "Tracking List Memory" "$($m.stage) - Total MB" ([math]::Round($m.totalMB, 1))
        }
    }
    if ($tltp.consoleErrors -and $tltp.consoleErrors.Count -gt 0) {
        Add-Row "Tracking List Errors" "Console Errors Count" $tltp.consoleErrors.Count
        $uniqueErrs = $tltp.consoleErrors | ForEach-Object { ($_ -split "`n")[0].Substring(0, [math]::Min($_.Length, 120)) } | Select-Object -Unique
        foreach ($err in $uniqueErrs) {
            Add-Row "Tracking List Errors" "Error" (CsvEscape $err)
        }
    }
}
Add-Blank

###########################################################################
# SECTION D – TEST 2: GLOBAL SEARCH → SHIPMENT DETAILS
###########################################################################
Add-SectionTitle "TEST 2: Global Search to Shipment Details"
if ($gsd) {
    Add-Row "Search Details" "Home Page Load" (MsToSec $gsd.homePageLoadMs)
    if ($gsd.homePageNetworkIdleMs) {
        Add-Row "Search Details" "Home Page Network Idle" (MsToSec $gsd.homePageNetworkIdleMs)
    }
    Add-Blank

    # Search 1 (Exact)
    if ($gsd.search1) {
        $s1 = $gsd.search1
        Add-Row "Global Search (Exact)" "Search Term: $($s1.searchTerm)" ""
        Add-Row "Global Search (Exact)" "Search Time" (MsToSec $s1.searchTimeMs)
        if ($s1.networkIdleMs) {
            Add-Row "Global Search (Exact)" "Network Idle" (MsToSec $s1.networkIdleMs)
        }
        if ($s1.totalApiTimeMs) {
            Add-Row "Global Search (Exact)" "Total API Time" (MsToSec $s1.totalApiTimeMs)
        }
        if ($s1.slowestApiMs) {
            Add-Row "Global Search (Exact)" "Slowest API" (MsToSec $s1.slowestApiMs)
        }
        Add-Blank
    }

    # Detail Page Navigation
    if ($gsd.detailPage) {
        $dp = $gsd.detailPage
        Add-Row "Shipment Detail Page" "Shipment: $($dp.shipmentNumber)" ""
        Add-Row "Shipment Detail Page" "Navigation Time" (MsToSec $dp.navigationTimeMs)
        if ($dp.networkIdleMs) {
            Add-Row "Shipment Detail Page" "Network Idle" (MsToSec $dp.networkIdleMs)
        }
        if ($dp.dataVisibleTimeMs) {
            Add-Row "Shipment Detail Page" "Data Visible Time" (MsToSec $dp.dataVisibleTimeMs)
        }
        if ($dp.totalApiTimeMs) {
            Add-Row "Shipment Detail Page" "Total API Time" (MsToSec $dp.totalApiTimeMs)
        }
        if ($dp.slowestApiMs) {
            Add-Row "Shipment Detail Page" "Slowest API" (MsToSec $dp.slowestApiMs)
        }
        Add-Blank
    }

    # Detail Tabs
    if ($gsd.detailTabs) {
        foreach ($tab in $gsd.detailTabs) {
            Add-Row "Shipment Detail Tab" "$($tab.tabName) - Switch Time" (MsToSec $tab.switchTimeMs)
            Add-Row "Shipment Detail Tab" "$($tab.tabName) - Data Load" (MsToSec $tab.dataLoadTimeMs)
            if ($tab.totalApiTimeMs) {
                Add-Row "Shipment Detail Tab" "$($tab.tabName) - Total API Time" (MsToSec $tab.totalApiTimeMs)
            }
            if ($tab.slowestApiMs) {
                Add-Row "Shipment Detail Tab" "$($tab.tabName) - Slowest API" (MsToSec $tab.slowestApiMs)
            }
        }
        Add-Blank
    }

    # Shipment Info Sections (expandable sections)
    if ($gsd.shipmentInfoSections) {
        foreach ($sec in $gsd.shipmentInfoSections) {
            $expanded = if ($sec.isExpanded) { "expanded" } else { "collapsed" }
            Add-Row "Shipment Info Section" "$($sec.sectionName) - Expand Time ($expanded)" (MsToSec $sec.expandTimeMs)
        }
        Add-Blank
    }

    # Back to Home
    if ($gsd.backToHomeMs) {
        Add-Row "Search Details Navigation" "Back to Home" (MsToSec $gsd.backToHomeMs)
        Add-Blank
    }

    # Search 2 (Partial)
    if ($gsd.search2) {
        $s2 = $gsd.search2
        Add-Row "Global Search (Partial)" "Search Term: $($s2.searchTerm)" ""
        Add-Row "Global Search (Partial)" "Search Time" (MsToSec $s2.searchTimeMs)
        if ($s2.networkIdleMs) {
            Add-Row "Global Search (Partial)" "Network Idle" (MsToSec $s2.networkIdleMs)
        }
        if ($s2.totalApiTimeMs) {
            Add-Row "Global Search (Partial)" "Total API Time" (MsToSec $s2.totalApiTimeMs)
        }
        if ($s2.slowestApiMs) {
            Add-Row "Global Search (Partial)" "Slowest API" (MsToSec $s2.slowestApiMs)
        }
        Add-Blank
    }

    # API Summary
    if ($gsd.apiSummary) {
        $a = $gsd.apiSummary
        Add-Row "Search Details API Summary" "Total API Calls" $a.totalCalls
        Add-Row "Search Details API Summary" "Failed API Calls" $a.failedCalls
        Add-Row "Search Details API Summary" "Avg Response" (MsToSec $a.avgResponseMs)
        Add-Row "Search Details API Summary" "P50 Response" (MsToSec $a.p50Ms)
        Add-Row "Search Details API Summary" "P90 Response" (MsToSec $a.p90Ms)
        Add-Row "Search Details API Summary" "P99 Response" (MsToSec $a.p99Ms)
        Add-Row "Search Details API Summary" "Max Response" (MsToSec $a.maxMs)
        Add-Row "Search Details API Summary" "Min Response" (MsToSec $a.minMs)
        if ($a.slowCalls) { Add-Row "Search Details API Summary" "Slow Calls (>3s)" $a.slowCalls }
    }
    Add-Blank

    # Memory Snapshots
    if ($gsd.memorySnapshots) {
        foreach ($m in $gsd.memorySnapshots) {
            Add-Row "Search Details Memory" "$($m.stage) - Used MB" ([math]::Round($m.usedMB, 1))
            Add-Row "Search Details Memory" "$($m.stage) - Total MB" ([math]::Round($m.totalMB, 1))
        }
    }
    if ($gsd.consoleErrors -and $gsd.consoleErrors.Count -gt 0) {
        Add-Row "Search Details Errors" "Console Errors Count" $gsd.consoleErrors.Count
        $uniqueErrs = $gsd.consoleErrors | ForEach-Object { ($_ -split "`n")[0].Substring(0, [math]::Min($_.Length, 120)) } | Select-Object -Unique
        foreach ($err in $uniqueErrs) {
            Add-Row "Search Details Errors" "Error" (CsvEscape $err)
        }
    }
}
Add-Blank

###########################################################################
# SECTION E – TEST 3: TRACKING LIST FILTER PERFORMANCE
###########################################################################
Add-SectionTitle "TEST 3: Tracking List Filter Performance"
if ($tlf) {
    Add-Row "TL Filter Perf" "Login to Page" (MsToSec $tlf.loginToPageMs)
    Add-Row "TL Filter Perf" "Initial Page Load" (MsToSec $tlf.initialPageLoadMs)
    if ($tlf.initialRowCount) {
        Add-Row "TL Filter Perf" "Initial Row Count" $tlf.initialRowCount
    }
    Add-Blank

    # Filter Apply
    if ($tlf.filterApply) {
        $fa = $tlf.filterApply
        Add-Row "TL Filter Apply" "Filter Name" (CsvEscape $fa.filterName)
        Add-Row "TL Filter Apply" "Show Filter Click (sidebar open)" (MsToSec $fa.showFilterClickMs)
        Add-Row "TL Filter Apply" "Settings Icon Click (saved filters)" (MsToSec $fa.settingsIconClickMs)
        Add-Row "TL Filter Apply" "Filter Apply Time" (MsToSec $fa.filterApplyTimeMs)
        if ($fa.rowCountAfterFilter) {
            Add-Row "TL Filter Apply" "Row Count After Filter" $fa.rowCountAfterFilter
        }
        if ($fa.slowestApiMs) {
            Add-Row "TL Filter Apply" "Slowest API during filter" (MsToSec $fa.slowestApiMs)
        }
        Add-Blank
    }

    # Tab Results (Post-Filter)
    if ($tlf.tabResults) {
        foreach ($tab in $tlf.tabResults) {
            Add-Row "TL Filter Tab (Post-Filter)" "$($tab.tabName) - Time to First Row" (MsToSec $tab.timeToFirstRowMs)
            if ($tab.switchTimeMs) {
                Add-Row "TL Filter Tab (Post-Filter)" "$($tab.tabName) - Switch Time" (MsToSec $tab.switchTimeMs)
            }
            if ($tab.networkIdleTimeMs) {
                Add-Row "TL Filter Tab (Post-Filter)" "$($tab.tabName) - Network Idle" (MsToSec $tab.networkIdleTimeMs)
            }
            if ($tab.rowCount) {
                Add-Row "TL Filter Tab (Post-Filter)" "$($tab.tabName) - Row Count" $tab.rowCount
            }
            if ($tab.slowestApiMs) {
                Add-Row "TL Filter Tab (Post-Filter)" "$($tab.tabName) - Slowest API" (MsToSec $tab.slowestApiMs)
            }
        }
        Add-Blank
    }

    # API Summary
    if ($tlf.apiSummary) {
        $a = $tlf.apiSummary
        Add-Row "TL Filter API Summary" "Total API Calls" $a.totalCalls
        Add-Row "TL Filter API Summary" "Failed API Calls" $a.failedCalls
        Add-Row "TL Filter API Summary" "Avg Response" (MsToSec $a.avgResponseMs)
        Add-Row "TL Filter API Summary" "P50 Response" (MsToSec $a.p50Ms)
        Add-Row "TL Filter API Summary" "P90 Response" (MsToSec $a.p90Ms)
        Add-Row "TL Filter API Summary" "P99 Response" (MsToSec $a.p99Ms)
        Add-Row "TL Filter API Summary" "Max Response" (MsToSec $a.maxMs)
        Add-Row "TL Filter API Summary" "Min Response" (MsToSec $a.minMs)
        if ($a.slowCalls) { Add-Row "TL Filter API Summary" "Slow Calls (>3s)" $a.slowCalls }
    }
    Add-Blank

    # Memory Snapshots
    if ($tlf.memorySnapshots) {
        foreach ($m in $tlf.memorySnapshots) {
            Add-Row "TL Filter Memory" "$($m.stage) - Used MB" ([math]::Round($m.usedMB, 1))
            Add-Row "TL Filter Memory" "$($m.stage) - Total MB" ([math]::Round($m.totalMB, 1))
        }
    }
    if ($tlf.consoleErrors -and $tlf.consoleErrors.Count -gt 0) {
        Add-Row "TL Filter Errors" "Console Errors Count" $tlf.consoleErrors.Count
        $uniqueErrs = $tlf.consoleErrors | ForEach-Object { ($_ -split "`n")[0].Substring(0, [math]::Min($_.Length, 120)) } | Select-Object -Unique
        foreach ($err in $uniqueErrs) {
            Add-Row "TL Filter Errors" "Error" (CsvEscape $err)
        }
    }
}
Add-Blank

###########################################################################
# SECTION F – TEST 1: HOME ↔ TRACKING LIST FILTER PERF (ROUND-TRIP)
###########################################################################
Add-SectionTitle "TEST 1: Home to Tracking List Filter Round-Trip"
if ($htf) {
    Add-Row "Round-Trip" "Login to Home" (MsToSec $htf.loginToHomeMs)
    Add-Row "Round-Trip" "Home Page Load (initial)" (MsToSec $htf.homePageLoadMs)
    Add-Blank

    # Navigation Timing (browser-level)
    if ($htf.homePageNavTiming) {
        $nt = $htf.homePageNavTiming
        if ($nt.dnsLookup) { Add-Row "Round-Trip Nav Timing" "DNS Lookup" (MsToSec $nt.dnsLookup) }
        if ($nt.tcpConnection) { Add-Row "Round-Trip Nav Timing" "TCP Connection" (MsToSec $nt.tcpConnection) }
        if ($nt.tlsNegotiation) { Add-Row "Round-Trip Nav Timing" "TLS Negotiation" (MsToSec $nt.tlsNegotiation) }
        if ($nt.serverResponseTime) { Add-Row "Round-Trip Nav Timing" "Server Response Time" (MsToSec $nt.serverResponseTime) }
        if ($nt.domContentLoaded) { Add-Row "Round-Trip Nav Timing" "DOM Content Loaded" (MsToSec $nt.domContentLoaded) }
        if ($nt.domInteractive) { Add-Row "Round-Trip Nav Timing" "DOM Interactive" (MsToSec $nt.domInteractive) }
        if ($nt.domComplete) { Add-Row "Round-Trip Nav Timing" "DOM Complete" (MsToSec $nt.domComplete) }
        if ($nt.pageLoad) { Add-Row "Round-Trip Nav Timing" "Full Page Load" (MsToSec $nt.pageLoad) }
        Add-Blank
    }

    Add-Row "Round-Trip" "Home to Tracking List" (MsToSec $htf.homeToTrackingListMs)
    Add-Row "Round-Trip" "Tracking List Page Load" (MsToSec $htf.trackingListPageLoadMs)
    Add-Row "Round-Trip" "Show Filters to sidebar open" (MsToSec $htf.showFilterClickMs)
    Add-Row "Round-Trip" "Settings to saved filters panel" (MsToSec $htf.settingsIconClickMs)
    Add-Row "Round-Trip" "Filter Apply Click" (MsToSec $htf.filterApplyMs)
    Add-Row "Round-Trip" "Filter Data Load" (MsToSec $htf.filterDataLoadMs)
    if ($htf.filterSlowestApiMs) {
        Add-Row "Round-Trip" "Filter Slowest API" (MsToSec $htf.filterSlowestApiMs)
    }
    Add-Row "Round-Trip" "Tracking List to Home (filtered)" (MsToSec $htf.trackingListToHomeMs)
    Add-Row "Round-Trip" "Home After Filter Load" (MsToSec $htf.homeAfterFilterLoadMs)
    Add-Row "Round-Trip" "Home to Tracking List (return trip)" (MsToSec $htf.homeToTrackingListReturnMs)
    Add-Row "Round-Trip" "Tracking List Return Load" (MsToSec $htf.trackingListReturnLoadMs)

    $totalRoundTrip = $htf.homePageLoadMs + $htf.homeToTrackingListMs + $htf.showFilterClickMs + $htf.settingsIconClickMs + $htf.filterDataLoadMs + $htf.trackingListToHomeMs + $htf.homeToTrackingListReturnMs
    Add-Row "Round-Trip" "TOTAL ROUND-TRIP TIME" (MsToSec $totalRoundTrip)
    Add-Blank

    # API Summary
    if ($htf.apiSummary) {
        $a = $htf.apiSummary
        Add-Row "Round-Trip API Summary" "Total API Calls" $a.totalCalls
        Add-Row "Round-Trip API Summary" "Failed API Calls" $a.failedCalls
        Add-Row "Round-Trip API Summary" "Avg Response" (MsToSec $a.avgResponseMs)
        Add-Row "Round-Trip API Summary" "P50 Response" (MsToSec $a.p50Ms)
        Add-Row "Round-Trip API Summary" "P90 Response" (MsToSec $a.p90Ms)
        Add-Row "Round-Trip API Summary" "P99 Response" (MsToSec $a.p99Ms)
        Add-Row "Round-Trip API Summary" "Max Response" (MsToSec $a.maxMs)
        Add-Row "Round-Trip API Summary" "Min Response" (MsToSec $a.minMs)
        if ($a.slowCalls) { Add-Row "Round-Trip API Summary" "Slow Calls (>3s)" $a.slowCalls }
    }
    Add-Blank

    # Memory Snapshots
    if ($htf.memorySnapshots) {
        foreach ($m in $htf.memorySnapshots) {
            Add-Row "Round-Trip Memory" "$($m.stage) - Used MB" ([math]::Round($m.usedMB, 1))
            Add-Row "Round-Trip Memory" "$($m.stage) - Total MB" ([math]::Round($m.totalMB, 1))
        }
    }
    if ($htf.consoleErrors -and $htf.consoleErrors.Count -gt 0) {
        Add-Row "Round-Trip Errors" "Console Errors Count" $htf.consoleErrors.Count
    }
}
Add-Blank

###########################################################################
# SECTION G – TEST 7: EVENT MANAGER PERFORMANCE
###########################################################################
Add-SectionTitle "TEST 7: Data Management - Event Manager Performance"
if ($emp) {
    Add-Row "Event Manager" "Home Page Load" (MsToSec $emp.homePageLoadMs)
    Add-Row "Event Manager" "Data Management Click" (MsToSec $emp.dataManagementClickMs)
    Add-Row "Event Manager" "Event Manager Navigation" (MsToSec $emp.eventManagerNavMs)
    Add-Row "Event Manager" "Event Manager Page Load" (MsToSec $emp.eventManagerPageLoadMs)
    Add-Blank

    Add-Row "Event Manager Search" "Search String" (CsvEscape $emp.searchString)
    Add-Row "Event Manager Search" "Search Input Time" (MsToSec $emp.searchInputTimeMs)
    Add-Row "Event Manager Search" "Search Execution" (MsToSec $emp.searchExecutionMs)
    Add-Row "Event Manager Search" "Result Display Time" (MsToSec $emp.searchResultDisplayMs)
    Add-Row "Event Manager Search" "Network Idle" (MsToSec $emp.searchNetworkIdleMs)
    Add-Row "Event Manager Search" "Result Mode" $emp.resultMode
    Add-Blank

    if ($emp.resultMode -eq 'single') {
        Add-Row "Event Manager Result" "Single Result Load" (MsToSec $emp.singleResultLoadMs)
    } else {
        Add-Row "Event Manager Result" "Blocks Appear Time" (MsToSec $emp.blocksAppearTimeMs)
        Add-Row "Event Manager Result" "Block Count" $emp.blockCount
        if ($emp.blockResults) {
            foreach ($block in $emp.blockResults) {
                Add-Row "Event Manager Block" "$($block.shipmentNumber) - Block Click" (MsToSec $block.blockClickTimeMs)
                Add-Row "Event Manager Block" "$($block.shipmentNumber) - Detail Load" (MsToSec $block.detailLoadTimeMs)
                Add-Row "Event Manager Block" "$($block.shipmentNumber) - Network Idle" (MsToSec $block.networkIdleMs)
                if ($block.slowestApiMs) {
                    Add-Row "Event Manager Block" "$($block.shipmentNumber) - Slowest API" (MsToSec $block.slowestApiMs)
                }
            }
        }
    }
    Add-Blank

    # API Summary
    if ($emp.apiSummary) {
        $a = $emp.apiSummary
        Add-Row "Event Manager API Summary" "Total API Calls" $a.totalCalls
        Add-Row "Event Manager API Summary" "Failed API Calls" $a.failedCalls
        Add-Row "Event Manager API Summary" "Avg Response" (MsToSec $a.avgResponseMs)
        Add-Row "Event Manager API Summary" "P50 Response" (MsToSec $a.p50Ms)
        Add-Row "Event Manager API Summary" "P90 Response" (MsToSec $a.p90Ms)
        Add-Row "Event Manager API Summary" "P99 Response" (MsToSec $a.p99Ms)
        Add-Row "Event Manager API Summary" "Max Response" (MsToSec $a.maxMs)
        Add-Row "Event Manager API Summary" "Min Response" (MsToSec $a.minMs)
        if ($a.slowCalls) { Add-Row "Event Manager API Summary" "Slow Calls (>3s)" $a.slowCalls }
    }
    Add-Blank

    # Memory Snapshots
    if ($emp.memorySnapshots) {
        foreach ($m in $emp.memorySnapshots) {
            Add-Row "Event Manager Memory" "$($m.stage) - Used MB" ([math]::Round($m.usedMB, 1))
            Add-Row "Event Manager Memory" "$($m.stage) - Total MB" ([math]::Round($m.totalMB, 1))
        }
    }
    if ($emp.consoleErrors -and $emp.consoleErrors.Count -gt 0) {
        Add-Row "Event Manager Errors" "Console Errors Count" $emp.consoleErrors.Count
    }
}
Add-Blank

###########################################################################
# CONSOLIDATED SUMMARY SECTIONS (keep existing cross-test views)
###########################################################################

# -- HOME PAGE (consolidated) --
Add-SectionTitle "CONSOLIDATED: Home Page"
if ($hpt) { Add-Row "Home Page" "Dashboard" (MsToSec $hpt.pageLoadMs) }
Add-Blank

# -- TRACKING LIST (consolidated) --
Add-Header
if ($tltp) {
    foreach ($tab in $tltp.firstVisit) {
        Add-Row "Tracking List" "Table View ($($tab.tabName) - First Visit)" (MsToSec $tab.dataLoadTimeMs)
    }
    foreach ($tab in $tltp.revisit) {
        Add-Row "Tracking List" "Table View ($($tab.tabName) - Revisit)" (MsToSec $tab.dataLoadTimeMs)
    }
}
Add-Blank

# -- TRACKING DETAILS (consolidated) --
Add-Header
if ($gsd) {
    Add-Row "Tracking Details" "Home page to tracking details page" (MsToSec $gsd.detailPage.navigationTimeMs)
}
if ($tltp -and $tltp.shipmentDetailProfiling) {
    Add-Row "Tracking Details" "Tracking list to tracking details page" (MsToSec $tltp.shipmentDetailProfiling.navigationTimeMs)
}
if ($gsd) {
    foreach ($tab in $gsd.detailTabs) {
        Add-Row "Tracking Details" "Detail Tab - $($tab.tabName)" (MsToSec $tab.dataLoadTimeMs)
    }
}
Add-Blank

# -- GLOBAL SEARCH (consolidated) --
Add-Header
if ($gsd) {
    Add-Row "Global Search" "Exact search using key reference number ($($gsd.search1.searchTerm))" (MsToSec $gsd.search1.searchTimeMs)
    Add-Row "Global Search" "Partial string search using key reference number ($($gsd.search2.searchTerm))" (MsToSec $gsd.search2.searchTimeMs)
}
if ($hpt -and $hpt.globalSearch) {
    Add-Row "Global Search" "Global Search from Home Page ($($hpt.globalSearch.searchTerm))" (MsToSec $hpt.globalSearch.searchTimeMs)
}
if ($tltp -and $tltp.searchProfiling) {
    Add-Row "Global Search" "Search from Tracking List ($($tltp.searchProfiling.searchTerm))" (MsToSec $tltp.searchProfiling.searchTimeMs)
}
Add-Blank

# -- SHOW FILTERS (consolidated) --
Add-Header
if ($fp -and $fp.filterApply) {
    Add-Row "Show Filters" "Application of certain filter in the home page" (MsToSec $fp.filterApply.filterApplyTimeMs)
}
if ($tlf -and $tlf.filterApply) {
    Add-Row "Show Filters" "Application of certain filter in the tracking list page" (MsToSec $tlf.filterApply.filterApplyTimeMs)
}
if ($htf) {
    Add-Row "Show Filters" "Applying saved filter (Home to TrackingList round-trip)" (MsToSec $htf.filterDataLoadMs)
}
Add-Blank

# -- CLEAR FILTER (sidebar / settings panel timings) --
Add-Header
if ($fp -and $fp.filterApply) {
    Add-Row "Clear filter" "Show Filter sidebar open (Home)" (MsToSec $fp.filterApply.showFilterClickMs)
}
if ($tlf -and $tlf.filterApply) {
    Add-Row "Clear filter" "Show Filter sidebar open (Tracking List)" (MsToSec $tlf.filterApply.showFilterClickMs)
}
if ($fp -and $fp.filterApply) {
    Add-Row "Clear filter" "Settings icon to saved filters panel (Home)" (MsToSec $fp.filterApply.settingsIconClickMs)
}
if ($tlf -and $tlf.filterApply) {
    Add-Row "Clear filter" "Settings icon to saved filters panel (Tracking List)" (MsToSec $tlf.filterApply.settingsIconClickMs)
}
Add-Blank

# -- HOME to TRACKING LIST ROUND-TRIP (consolidated) --
Add-Header
if ($htf) {
    Add-Row "Home to Tracking List Round-Trip" "Home Page Load (initial)" (MsToSec $htf.homePageLoadMs)
    Add-Row "Home to Tracking List Round-Trip" "Home to Tracking List" (MsToSec $htf.homeToTrackingListMs)
    Add-Row "Home to Tracking List Round-Trip" "Show Filters to sidebar open" (MsToSec $htf.showFilterClickMs)
    Add-Row "Home to Tracking List Round-Trip" "Settings to saved filters panel" (MsToSec $htf.settingsIconClickMs)
    Add-Row "Home to Tracking List Round-Trip" "Filter Apply to data loaded" (MsToSec $htf.filterDataLoadMs)
    Add-Row "Home to Tracking List Round-Trip" "Tracking List to Home (filtered)" (MsToSec $htf.trackingListToHomeMs)
    Add-Row "Home to Tracking List Round-Trip" "Home to Tracking List (return trip)" (MsToSec $htf.homeToTrackingListReturnMs)
    $totalRoundTrip = $htf.homePageLoadMs + $htf.homeToTrackingListMs + $htf.showFilterClickMs + $htf.settingsIconClickMs + $htf.filterDataLoadMs + $htf.trackingListToHomeMs + $htf.homeToTrackingListReturnMs
    Add-Row "Home to Tracking List Round-Trip" "TOTAL ROUND-TRIP TIME" (MsToSec $totalRoundTrip)
}
Add-Blank

# -- TRANSPORT TABS (HOME PAGE - consolidated) --
Add-Header
if ($hpt) {
    foreach ($tab in $hpt.transportTabs) {
        Add-Row "Transport Tabs (Home Page)" $tab.tabName (MsToSec $tab.switchTimeMs)
    }
    if ($hpt.mapToggle) {
        Add-Row "Transport Tabs (Home Page)" "Map Toggle (Origin to Destination)" (MsToSec $hpt.mapToggle.switchTimeMs)
    }
}
Add-Blank

# -- TRANSPORT TABS (POST-FILTER - consolidated) --
Add-Header
if ($fp) {
    foreach ($tab in $fp.transportTabs) {
        Add-Row "Transport Tabs (Post-Filter)" $tab.tabName (MsToSec $tab.switchTimeMs)
    }
    if ($fp.mapToggle) {
        Add-Row "Transport Tabs (Post-Filter)" "Map Toggle (Post-Filter Destination)" (MsToSec $fp.mapToggle.switchTimeMs)
    }
}
Add-Blank

# -- TRACKING LIST FILTER TABS (POST-FILTER - consolidated) --
Add-Header
if ($tlf) {
    foreach ($tab in $tlf.tabResults) {
        Add-Row "Tracking List Filter Tabs (Post-Filter)" $tab.tabName (MsToSec $tab.timeToFirstRowMs)
    }
}
Add-Blank

# -- EVENT MANAGER (consolidated) --
Add-Header
if ($emp) {
    Add-Row "Event Manager" "Data Management to Event Manager" (MsToSec $emp.eventManagerNavMs)
    Add-Row "Event Manager" "Event Manager Page Load" (MsToSec $emp.eventManagerPageLoadMs)
    Add-Row "Event Manager" "Search Execution ($($emp.searchString))" (MsToSec $emp.searchExecutionMs)
    Add-Row "Event Manager" "Result Display" (MsToSec $emp.searchResultDisplayMs)
    if ($emp.resultMode -eq 'multiple' -and $emp.blockResults) {
        foreach ($block in $emp.blockResults) {
            Add-Row "Event Manager" "Block Detail Load - $($block.shipmentNumber)" (MsToSec $block.detailLoadTimeMs)
        }
    }
}
Add-Blank

# -- TEST EXECUTION INFO --
Add-Header
Add-Row "Test Execution Info" "Environment" "stage.itt.bdpsmart.com"
Add-Row "Test Execution Info" "Browser" $BrowserLabel
Add-Row "Test Execution Info" "Playwright Project" $ProjectName
Add-Row "Test Execution Info" "Test Date" $today
Add-Row "Test Execution Info" "Total Test Duration (all 7 tests)" "${totalDur}s"
foreach ($r in $testResults) {
    Add-Row "Test Execution Info" "Test $($r.Num) - $($tests[$r.Num - 1].Name)" "$($r.Duration)s ($($r.Status))"
}
Add-Row "Test Execution Info" "All Tests Passed" "$passCount/$($testResults.Count)"
Add-Blank

# -- INDIVIDUAL TEST DURATIONS & JSON SOURCES --
Add-Row "Test JSON Sources" "Test 1 JSON" $(if ($testJsonPaths[0]) { Split-Path $testJsonPaths[0] -Leaf } else { "N/A" })
Add-Row "Test JSON Sources" "Test 2 JSON" $(if ($testJsonPaths[1]) { Split-Path $testJsonPaths[1] -Leaf } else { "N/A" })
Add-Row "Test JSON Sources" "Test 3 JSON" $(if ($testJsonPaths[2]) { Split-Path $testJsonPaths[2] -Leaf } else { "N/A" })
Add-Row "Test JSON Sources" "Test 4 JSON" $(if ($testJsonPaths[3]) { Split-Path $testJsonPaths[3] -Leaf } else { "N/A" })
Add-Row "Test JSON Sources" "Test 5 JSON" $(if ($testJsonPaths[4]) { Split-Path $testJsonPaths[4] -Leaf } else { "N/A" })
Add-Row "Test JSON Sources" "Test 6 JSON" $(if ($testJsonPaths[5]) { Split-Path $testJsonPaths[5] -Leaf } else { "N/A" })
Add-Row "Test JSON Sources" "Test 7 JSON" $(if ($testJsonPaths[6]) { Split-Path $testJsonPaths[6] -Leaf } else { "N/A" })

# -- Write CSV --
$csv -join "`n" | Set-Content -Path $csvPath -Encoding UTF8

Write-Host ""
Write-Host "  CSV report saved: $csvPath" -ForegroundColor Green
Write-Host ""

###############################################################################
#  STEP 4 -- PRINT KEY METRICS TO CONSOLE
###############################################################################

Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "  KEY PERFORMANCE METRICS ($dateLabel)" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""
Write-Host ("{0,-55} {1,10}" -f "Metric", "Time (s)")
Write-Host ("{0,-55} {1,10}" -f ("-" * 55), "--------")

if ($hpt)  { Write-Host ("{0,-55} {1,10}" -f "Home Page - Dashboard Load", (MsToSec $hpt.pageLoadMs)) }
if ($hpt -and $hpt.kpiResults) {
    foreach ($kpi in $hpt.kpiResults) {
        Write-Host ("{0,-55} {1,10}" -f "Home Page KPI - $($kpi.name)", (MsToSec $kpi.renderTimeMs))
    }
}
if ($tltp) { Write-Host ("{0,-55} {1,10}" -f "Tracking List - All Shipments (First Visit)", (MsToSec $tltp.firstVisit[0].dataLoadTimeMs)) }
if ($gsd)  { Write-Host ("{0,-55} {1,10}" -f "Tracking Details - Home to Details", (MsToSec $gsd.detailPage.navigationTimeMs)) }
if ($tltp -and $tltp.shipmentDetailProfiling) {
    Write-Host ("{0,-55} {1,10}" -f "Tracking Details - List to Details", (MsToSec $tltp.shipmentDetailProfiling.navigationTimeMs))
}
if ($gsd)  { Write-Host ("{0,-55} {1,10}" -f "Global Search - Exact ($($gsd.search1.searchTerm))", (MsToSec $gsd.search1.searchTimeMs)) }
if ($gsd)  { Write-Host ("{0,-55} {1,10}" -f "Global Search - Partial ($($gsd.search2.searchTerm))", (MsToSec $gsd.search2.searchTimeMs)) }
if ($hpt -and $hpt.globalSearch) {
    Write-Host ("{0,-55} {1,10}" -f "Global Search - Home Page ($($hpt.globalSearch.searchTerm))", (MsToSec $hpt.globalSearch.searchTimeMs))
}
if ($tltp -and $tltp.searchProfiling) {
    Write-Host ("{0,-55} {1,10}" -f "Global Search - Tracking List ($($tltp.searchProfiling.searchTerm))", (MsToSec $tltp.searchProfiling.searchTimeMs))
}
if ($fp -and $fp.filterApply) {
    Write-Host ("{0,-55} {1,10}" -f "Filter Apply - Home Page", (MsToSec $fp.filterApply.filterApplyTimeMs))
}
if ($tlf -and $tlf.filterApply) {
    Write-Host ("{0,-55} {1,10}" -f "Filter Apply - Tracking List", (MsToSec $tlf.filterApply.filterApplyTimeMs))
}
if ($htf) {
    $totalRT = $htf.homePageLoadMs + $htf.homeToTrackingListMs + $htf.showFilterClickMs + $htf.settingsIconClickMs + $htf.filterDataLoadMs + $htf.trackingListToHomeMs + $htf.homeToTrackingListReturnMs
    Write-Host ("{0,-55} {1,10}" -f "Full Round-Trip (Home to TrackingList+Filter)", (MsToSec $totalRT))
}
if ($emp) {
    Write-Host ("{0,-55} {1,10}" -f "Event Manager - Page Load", (MsToSec $emp.eventManagerPageLoadMs))
    Write-Host ("{0,-55} {1,10}" -f "Event Manager - Search Execution ($($emp.searchString))", (MsToSec $emp.searchExecutionMs))
    Write-Host ("{0,-55} {1,10}" -f "Event Manager - Result Display", (MsToSec $emp.searchResultDisplayMs))
    if ($emp.resultMode -eq 'multiple' -and $emp.blockResults) {
        foreach ($block in $emp.blockResults) {
            Write-Host ("{0,-55} {1,10}" -f "Event Manager - Block Detail ($($block.shipmentNumber))", (MsToSec $block.detailLoadTimeMs))
        }
    }
}

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "  IMPORTANT OBSERVATIONS" -ForegroundColor Yellow
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""

# Automatically flag slow operations
$warnings = @()
if ($hpt -and $hpt.pageLoadMs -gt 5000) { $warnings += "  [!] Home page load exceeds 5s: $(MsToSec $hpt.pageLoadMs)s" }
if ($gsd -and $gsd.search2.searchTimeMs -gt 15000) { $warnings += "  [!] Partial search is very slow: $(MsToSec $gsd.search2.searchTimeMs)s" }
if ($tltp -and $tltp.shipmentDetailProfiling -and $tltp.shipmentDetailProfiling.navigationTimeMs -gt 10000) {
    $warnings += "  [!] Tracking list to detail nav exceeds 10s: $(MsToSec $tltp.shipmentDetailProfiling.navigationTimeMs)s"
}
if ($gsd -and $gsd.apiSummary -and $gsd.apiSummary.failedCalls -gt 0) {
    $warnings += "  [!] $($gsd.apiSummary.failedCalls) failed API call(s) in Search Details test"
}
if ($tlf -and $tlf.consoleErrors -and $tlf.consoleErrors.Count -gt 0) {
    $warnings += "  [!] $($tlf.consoleErrors.Count) console error(s) in Tracking List Filter test"
}
if ($tltp -and $tltp.consoleErrors -and $tltp.consoleErrors.Count -gt 0) {
    $warnings += "  [!] $($tltp.consoleErrors.Count) console error(s) in Tracking List Tab test"
}
if ($hpt -and $hpt.transportTabs) {
    foreach ($tab in $hpt.transportTabs) {
        if ($tab.dataDisplayTimeMs -and $tab.dataDisplayTimeMs -gt 20000) {
            $warnings += "  [!] Transport tab '$($tab.tabName)' data display exceeds 20s: $(MsToSec $tab.dataDisplayTimeMs)s"
        }
    }
}
if ($emp -and $emp.eventManagerPageLoadMs -gt 10000) {
    $warnings += "  [!] Event Manager page load exceeds 10s: $(MsToSec $emp.eventManagerPageLoadMs)s"
}
if ($emp -and $emp.searchResultDisplayMs -gt 15000) {
    $warnings += "  [!] Event Manager search result display exceeds 15s: $(MsToSec $emp.searchResultDisplayMs)s"
}
if ($emp -and $emp.apiSummary -and $emp.apiSummary.failedCalls -gt 0) {
    $warnings += "  [!] $($emp.apiSummary.failedCalls) failed API call(s) in Event Manager test"
}
if ($emp -and $emp.consoleErrors -and $emp.consoleErrors.Count -gt 0) {
    $warnings += "  [!] $($emp.consoleErrors.Count) console error(s) in Event Manager test"
}

if ($warnings.Count -eq 0) {
    Write-Host "  No critical performance issues detected." -ForegroundColor Green
} else {
    foreach ($w in $warnings) {
        Write-Host $w -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "  All done! CSV at: $csvPath" -ForegroundColor Green
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""
