  
 
import { test, expect } from '@playwright/test';
 
// import * as fs from 'fs';
 
// import * as path from 'path';
 
import { seedLogin } from '../seed.spec';
 
const BASE_URL="https://sdmstage.bdpsmart.com"
 
const HOME_URL=`${BASE_URL}/arrival`
 
 
 
test.describe('📦 Data Management → Event Manager Performance Profiling', () => {
 
 
 
  test.setTimeout(480_000); // 8 minutes
 
test('EMP-01: Event Manager search & result display — full performance profile', async ({ page, context, browserName }) =>{
 
const testStart = Date.now();
 
await seedLogin(page, context);
 
 await page.waitForURL(/bdpsmart\.com/, { timeout: 30_000 });
 
  await page.goto(HOME_URL, { waitUntil: 'load' });
 
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
 
    await page.waitForTimeout(1500);
 
 
 
 await page.locator('button.shipment-link')
 
    .filter({ hasText: '2111841277' })
 
    .click();
 
    const shipment =123
 
 
 
})
 
 
 
 
 
 
 
});
 
 