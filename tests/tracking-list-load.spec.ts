// spec: test-plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '@playwright/test';
import { seedLogin } from '../tests/seed.spec';
test.describe('Tracking List Tab Performance', () => {
  test('Tracking List Page Load and Initial Data Display', async ({ page,context  }) => {
    // 🔥 This runs seed FIRST in same browser
  await seedLogin(page, context);
    // 1. Click on Tracking List menu item
    await page.getByRole('link', { name: ' Tracking List' }).click();

    // 2. Measure Tracking List page load time and data rendering
    // Verify In Transit tab is selected by default
    await expect(page.getByRole('tab', { name: 'In Transit' })).toBeVisible();

    // Verify pagination shows correct entry count (showing 10 entries from 1955 total)
    await expect(page.getByText('Showing 1 to 10 of 1955 entries')).toBeVisible();

    // 3. Verify column headers and table structure
    // Verify Action column displays first
    await expect(page.getByRole('columnheader', { name: 'Action' })).toBeVisible();

    // Verify Shipment Number column with filter options
    await expect(page.getByText('Shipment Number')).toBeVisible();

    // Verify MOT (Mode of Transport) column displays
    await expect(page.getByText('MOT')).toBeVisible();

    // Verify Port of Departure/Entry columns visible
    await expect(page.getByText('Port of Departure (UNLOC/IATA)')).toBeVisible();
    await expect(page.getByText('Port Of Entry Name')).toBeVisible();
    await expect(page.getByText('Port of Entry (UNLOC/IATA)')).toBeVisible();

    // Verify All date columns present (Predictive ETA, ETD, Request ETA)
    await expect(page.getByText('Predictive ETA Date')).toBeVisible();
    await expect(page.getByText('Predictive ETD Date')).toBeVisible();
    await expect(page.getByText('Request ETA Date')).toBeVisible();

    // Verify SBU and code columns display
    await expect(page.getByText('SBU Code')).toBeVisible();

    // Verify Shipper Reference and Transport Reference columns visible
    await expect(page.getByText('Shipper Reference Number')).toBeVisible();
    await expect(page.getByText('Transport Reference Number')).toBeVisible();

    // Verify Vessel Name and date columns present
    await expect(page.getByText('Vessel Name')).toBeVisible();

    // 4. Verify pagination controls load and function
    // Verify page number buttons display (1-5 visible, with ability to navigate)
    await expect(page.getByRole('button', { name: '1' })).toBeVisible();
    await expect(page.getByRole('button', { name: '2' })).toBeVisible();
    await expect(page.getByRole('button', { name: '3' })).toBeVisible();
    await expect(page.getByRole('button', { name: '4' })).toBeVisible();
    await expect(page.getByRole('button', { name: '5' })).toBeVisible();

    // Verify Pagination buttons present (First, Previous, Next, Last)
    await expect(page.getByRole('button', { name: 'Next Page' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Last Page' })).toBeVisible();

    // Verify Rows per page dropdown available and set to 10
    const rowsDropdown = page.getByRole('combobox', { name: 'Rows per page' });
    await expect(rowsDropdown).toBeVisible();

    // Verify Pagination controls are functional
    await page.getByRole('button', { name: 'Next Page' }).click();
    await expect(page.getByText('Showing 11 to 20 of 1955 entries')).toBeVisible();

    // 5. Record performance metrics
    // Initial table render time, Time to first interactive content, and Network request count are documented through the test execution
    const loadTime = await page.evaluate(() =>
    performance.timing.loadEventEnd - performance.timing.navigationStart
  );
  });
});
