import { test } from '@playwright/test';
import { seedLogin } from './seed.spec';

test('seed', async ({ page, context }) => {
  await seedLogin(page, context);
});
