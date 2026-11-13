# README.md

Source: [tests/performance/README.md](../../tests/performance/README.md)

## Purpose

This file is the guidebook for the performance test suite. It explains what each spec measures, how to run the suite, which performance standards inspired the work, and what thresholds the team considers acceptable.

## Story of the file

### 1. It sets the overall intent of the performance suite

The opening section positions the project against well-known standards such as Lighthouse, Core Web Vitals, and the Navigation Timing APIs. This tells the reader that the suite is trying to use recognizable metrics instead of ad hoc timings.

### 2. It catalogs the major spec files

The file includes a table that maps each performance spec to its measurement focus. That table is the quickest way to decide which spec to inspect when you want page load, API timing, memory, or routing behavior.

### 3. It documents the main run commands

The next sections explain how to run the suite in Edge, Firefox, single-file mode, headed mode, verbose mode, or multi-project mode. This block is operational guidance for the person executing the suite.

### 4. It explains the metric families being captured

The file then groups metrics into categories such as Core Web Vitals, navigation timing, network behavior, memory, and DOM complexity. This helps connect the raw spec files to the concepts they measure.

### 5. It states the performance budgets

Another section lists thresholds for page load, TTFB, FCP, LCP, CLS, DOM content loaded time, total transfer size, and request counts. Those numbers are the acceptance targets behind many of the assertions inside the specs.

### 6. It shows the project architecture

The architecture block explains that the helper utilities live under `utils` and that the major performance specs live under `tests/performance`. That is useful when tracing an imported helper from a spec back to its shared implementation.

### 7. It describes output expectations

The closing section explains that console output is color-coded and that JSON reports are saved for later analysis or CI use.

## Why this file matters

Before reading any single performance spec, this file gives the vocabulary and expectations needed to understand the rest of the suite.