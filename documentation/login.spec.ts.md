# login.spec.ts

Source: [tests/login.spec.ts](../tests/login.spec.ts)

## Purpose

This file is a direct login walkthrough. It seeds browser cookies, opens the stage site, fills the hosted login form, and waits for the authenticated page to settle. It behaves like a manual bootstrap script more than a complete automated assertion test.

## Imports

- `test` from Playwright starts the single scenario.
- `expect` is imported from Playwright but is not used in this file.

## Story of the file

### 1. One standalone Playwright test is declared

The file opens with one simple test block. There is no suite wrapper, no helper extraction, and no reusable reporting structure. Everything happens inline inside that single scenario.

### 2. An older cookie setup is preserved but fully disabled

The first large section is an older cookie payload kept only as reference. Because it is commented out, it does not affect runtime. It shows that the author previously used a different environment or session seed and kept it nearby for quick switching.

### 3. The active stage cookie set is injected into the browser context

The next active block adds analytics cookies and authentication-related cookies into the shared browser context. This prepares the browser with state before navigation begins, which reduces how much of the login process must be done from a blank session.

### 4. A navigation start timestamp is captured

The script records a timestamp before moving into the page interaction section. In this file the value is not used later, so it acts only as a placeholder for future timing work.

### 5. The browser opens the stage application entry point

Instead of going to a dedicated local route inside the app, the test opens the stage base URL and lets the hosted login flow appear.

### 6. The email step is completed

The script finds the email textbox by accessible role and label, focuses it, and enters the configured email address. After that it clicks the continue button to move into the password step.

### 7. The password step is completed

The same pattern is repeated for the password field. The test focuses the field, fills the password, and clicks continue again to submit credentials.

### 8. The script waits for the page to go idle and then stops

The final action waits for network silence so the author can assume the login flow has finished loading. There are no assertions, screenshots, or persisted results, so success here simply means no interaction failed before the end.

## What to pay attention to

- This file is useful for understanding the raw login sequence.
- It is not ideal as a reusable utility because credentials and cookies are hard-coded inline.
- The real reusable version of this flow lives in [tests/seed.spec.ts](../tests/seed.spec.ts#L4).