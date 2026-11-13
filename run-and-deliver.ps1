###############################################################################
#  WRAPPER: Run perf tests → Copy CSV to Desktop → Email (optional)
#
#  Usage (interactive):    .\run-and-deliver.ps1
#  Usage (scheduled):      powershell -ExecutionPolicy Bypass -NoProfile -File "C:\Users\aranjan\Documents\Automation\LoadTestPlaywrightArtillery\run-and-deliver.ps1"
#
#  CONFIGURATION — edit these once:
###############################################################################

# ── EMAIL SETTINGS ──────────────────────────────────────────────────────────
# Set $SendEmail = $true and fill in the fields below to get the CSV emailed.
# For Office 365 you'll need an App Password (see instructions below).
#
# To create an App Password for Office 365:
#   1. Go to https://mysignins.microsoft.com/security-info
#   2. Click "Add sign-in method" → "App password"
#   3. Name it "PerfTestScript" and copy the generated password below
#
$SendEmail       = $false                               # ← set to $true to enable
$SmtpServer      = "smtp.office365.com"
$SmtpPort        = 587
$EmailFrom       = "aranjan@bdpint.com"                 # ← your email
$EmailTo         = "aranjan@bdpint.com"                 # ← recipient email
$EmailPassword   = "YOUR_APP_PASSWORD_HERE"             # ← app password (not your normal password)

# ── COPY SETTINGS ──────────────────────────────────────────────────────────
$CopyToDesktop   = $true                                # always copy CSV to Desktop
$DesktopPath     = [Environment]::GetFolderPath('Desktop')

# ── LOGGING ─────────────────────────────────────────────────────────────────
$ROOT            = $PSScriptRoot
$LogFile         = Join-Path $ROOT "run-and-deliver.log"

###############################################################################
#  FUNCTIONS
###############################################################################

function Write-Log([string]$msg) {
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts] $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

###############################################################################
#  STEP 1 — RUN THE PERFORMANCE TESTS
###############################################################################

Write-Log "========== PERF TEST RUN STARTED =========="

$mainScript = Join-Path $ROOT "run-all-perf-tests.ps1"

if (-not (Test-Path $mainScript)) {
    Write-Log "ERROR: Cannot find run-all-perf-tests.ps1 at $mainScript"
    exit 1
}

Write-Log "Executing: $mainScript"
$sw = [System.Diagnostics.Stopwatch]::StartNew()

# Run the main test script (inherits current console)
& $mainScript
$testExitCode = $LASTEXITCODE

$sw.Stop()
Write-Log "Test script finished in $([math]::Round($sw.Elapsed.TotalMinutes, 1)) minutes (exit code: $testExitCode)"

###############################################################################
#  STEP 2 — FIND TODAY'S CSV
###############################################################################

$today   = Get-Date -Format 'yyyy-MM-dd'
$csvName = "performance-report-$today.csv"
$csvPath = Join-Path $ROOT $csvName

# If exact date match not found, grab the newest CSV
if (-not (Test-Path $csvPath)) {
    Write-Log "CSV for today not found at: $csvPath — looking for newest CSV..."
    $newest = Get-ChildItem $ROOT -Filter "performance-report-*.csv" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($newest) {
        $csvPath = $newest.FullName
        $csvName = $newest.Name
        Write-Log "Using newest CSV: $csvName"
    } else {
        Write-Log "ERROR: No performance CSV found. Aborting delivery."
        exit 1
    }
}

Write-Log "CSV to deliver: $csvPath"

###############################################################################
#  STEP 3 — COPY TO DESKTOP
###############################################################################

if ($CopyToDesktop) {
    $destPath = Join-Path $DesktopPath $csvName
    try {
        Copy-Item -Path $csvPath -Destination $destPath -Force
        Write-Log "CSV copied to Desktop: $destPath"
    } catch {
        Write-Log "ERROR copying to Desktop: $($_.Exception.Message)"
    }
}

###############################################################################
#  STEP 4 — EMAIL THE CSV
###############################################################################

if ($SendEmail) {
    if ($EmailPassword -eq "YOUR_APP_PASSWORD_HERE") {
        Write-Log "WARNING: Email is enabled but app password is not configured. Skipping email."
    } else {
        Write-Log "Sending email to $EmailTo..."

        $dateLabel = Get-Date -Format 'dd MMM yyyy'
        $subject   = "Performance Test Report - $dateLabel"

        # Build a quick summary for the email body
        $body = @"
Performance Test Report - $dateLabel
====================================

Environment: stage.itt.bdpsmart.com
Browser:     Microsoft Edge (Chromium)
Test Date:   $today

The CSV report is attached.

---
This email was sent automatically by the Performance Test Suite.
Script: $mainScript
CSV:    $csvName
"@

        try {
            $secPassword = ConvertTo-SecureString $EmailPassword -AsPlainText -Force
            $credential  = New-Object System.Management.Automation.PSCredential ($EmailFrom, $secPassword)

            Send-MailMessage `
                -From       $EmailFrom `
                -To         $EmailTo `
                -Subject    $subject `
                -Body       $body `
                -SmtpServer $SmtpServer `
                -Port       $SmtpPort `
                -UseSsl `
                -Credential $credential `
                -Attachments $csvPath `
                -Priority   Normal

            Write-Log "Email sent successfully to $EmailTo"
        } catch {
            Write-Log "ERROR sending email: $($_.Exception.Message)"
        }
    }
}

###############################################################################
#  DONE
###############################################################################

Write-Log "========== DELIVERY COMPLETE =========="
Write-Log ""

# Show summary
Write-Host ""
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "  DELIVERY SUMMARY" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host ""
Write-Host "  CSV Report:    $csvName" -ForegroundColor Green
if ($CopyToDesktop) {
    Write-Host "  Desktop Copy:  $(Join-Path $DesktopPath $csvName)" -ForegroundColor Green
}
if ($SendEmail -and $EmailPassword -ne "YOUR_APP_PASSWORD_HERE") {
    Write-Host "  Emailed To:    $EmailTo" -ForegroundColor Green
}
Write-Host "  Log File:      $LogFile" -ForegroundColor Gray
Write-Host ""
Write-Host ("=" * 60) -ForegroundColor Cyan
