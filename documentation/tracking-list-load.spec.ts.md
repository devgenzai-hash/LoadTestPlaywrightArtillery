# tracking-list-load.spec.ts

Source: [tests/tracking-list-load.spec.ts](../tests/tracking-list-load.spec.ts)

## Purpose

This file is a lightweight Tracking List smoke and timing check. It confirms that the page opens, key table headings appear, pagination controls exist, and a simple page move works.

## Imported helpers worth following

- `seedLogin()` — shared login bootstrap in [tests/seed.spec.ts](../tests/seed.spec.ts#L4)

## Other imports

- `test` and `expect` from Playwright run the test and verify the UI.

## Story of the file

### 1. A small suite is declared for Tracking List performance

The file groups its behavior under one suite title and keeps everything inside a single test. That tells you the file is intended as a quick validation rather than a multi-angle audit.

### 2. The test starts by establishing an authenticated session

It immediately calls `seedLogin()` so the rest of the logic can assume a logged-in user and skip repeated auth code.

### 3. It opens the Tracking List section from the application menu

After login, the script clicks the Tracking List navigation link instead of going straight to a hard-coded route. That means it is measuring the real user path from the application shell.

### 4. It validates the default landing state

The first expectation checks that the `In Transit` tab is visible. The next expectation confirms the initial pagination text is present, which doubles as proof that the table has already loaded data.

### 5. It verifies the most important column headers

The next sequence walks through the major headers one by one. It confirms operational columns, transport mode, departure and entry fields, predictive dates, business unit data, reference numbers, and vessel information.

### 6. It checks that pagination controls are ready

The test then verifies numbered page buttons, next and last controls, and the rows-per-page dropdown. This proves that the page is not only visible but also interactive.

### 7. It performs one actual pagination move

The script clicks the next-page button and checks that the visible range text changes. This is the one active performance-style interaction in the file because it proves the table can fetch or display the next slice of data.

### 8. It reads a browser timing value at the end

The final block calculates a load duration using the browser performance timing API, but the value is not asserted or stored. It serves more as a placeholder for future reporting than as a current test output.

## What this file gives you

- A fast sanity pass for Tracking List.
- A readable checklist of core table elements.
- A simple example of how the suite uses `seedLogin()` before page work starts.