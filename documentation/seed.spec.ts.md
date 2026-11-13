# seed.spec.ts

Source: [tests/seed.spec.ts](../tests/seed.spec.ts)

## Purpose

This file exports the shared login bootstrap used by many other specs. Its job is to put the browser into an authenticated state in a repeatable way so performance tests can focus on the page being measured instead of rewriting login logic every time.

## Imports

- `Page` and `BrowserContext` from Playwright provide the types for the helper inputs.

## Exported helper

- `seedLogin()` — defined in [tests/seed.spec.ts](../tests/seed.spec.ts#L4)

## Story of the file

### 1. The file is a reusable helper, not a test suite

Unlike a normal Playwright spec, this file exports a function instead of declaring a `test.describe()` block. That makes it a shared dependency for the rest of the test suite.

### 2. The helper receives the active page and browser context

The function accepts both the page object and the browser context so it can control browser state before navigation and then drive the visible login form.

### 3. It seeds the session with a fixed cookie bundle

The first major block writes a set of cookies into the browser context. These include analytics values and auth/session-related values. This reduces login friction and makes later tests more stable because they start from a known browser state.

### 4. It captures a start timestamp

The function records a timestamp before navigation. Like the simpler login file, this value is not used later, so it mainly signals that the helper was designed with performance timing in mind.

### 5. It opens the stage application

The helper navigates to the stage base URL rather than directly to a deep page. That lets the hosted authentication screen and redirect chain behave naturally.

### 6. It completes the login form in two phases

The helper fills the email field, advances, then fills the password field and advances again. All selectors are role-based, which makes the flow easier to read and usually more resilient than raw CSS selectors.

### 7. It waits for network idle before returning control

The last line waits until the page is quiet so callers can assume the authentication sequence has reached a stable state. The function then returns without assertions because its only responsibility is preparation.

## Why this file matters

Most of the performance specs import this helper. If login behavior changes, this is the first file to inspect because a break here can cascade into failures everywhere else.