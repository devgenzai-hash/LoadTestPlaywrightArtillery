@echo off
:: ============================================================================
::  Double-click this file to run all performance tests & deliver the CSV
::  (copies to Desktop + optionally emails)
:: ============================================================================
title Performance Test Suite - Running...
echo.
echo  ============================================================
echo   BDP Smart Performance Test Suite
echo   Starting at %date% %time%
echo  ============================================================
echo.

cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0run-and-deliver.ps1"

echo.
echo  ============================================================
echo   Done! Check your Desktop for the CSV report.
echo  ============================================================
echo.
pause
