import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/performance-report.json' }],
    ['list'],
  ],
  /* Global timeout for performance tests (2 minutes per test) */
  timeout: 120_000,
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'https://test.itt.bdpsmart.com',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Capture screenshot on failure for performance regression debugging */
    screenshot: 'only-on-failure',

    /* Navigation timeout */
    navigationTimeout: 60_000,

    /* Action timeout */
    actionTimeout: 30_000,
  },
  

  /* Configure projects for major browsers */
  projects: [
  //  {
  //     name: 'setup',
  //     testMatch: /seed\.spec\.ts/,
  //   },
    // {
    //   name: 'chromium',
    //   use: { ...devices['Desktop Chrome']  },
    // },

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge', video: 'on-first-retry',
        // storageState: 'storageState.json'
      },
      // dependencies: ['setup'],
    },

    /* Performance Testing - Microsoft Edge (Chromium-based, supports performance.memory) */
    {
      name: 'performance-edge',
      testMatch: /performance\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
        /* Enable performance-critical flags (Edge supports all Chromium flags) */
        launchOptions: {
          args: [
            '--enable-precise-memory-info',    // Enables performance.memory API
            '--js-flags=--expose-gc',          // Allows manual GC for memory tests
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
          ],
        },
        video: 'off',  // Disable video for perf tests (reduces overhead)
      },
    },

    /* Performance Testing - Chromium (Google Chrome, supports performance.memory) */
    {
      name: 'performance-chromium',
      testMatch: /performance\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        /* Enable performance-critical flags (Chromium-based browser) */
        launchOptions: {
          args: [
            '--enable-precise-memory-info',    // Enables performance.memory API
            '--js-flags=--expose-gc',          // Allows manual GC for memory tests
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
          ],
        },
        video: 'off',  // Disable video for perf tests (reduces overhead)
      },
    },

    /* Performance Testing - Firefox (cross-browser perf validation) */
    {
      name: 'performance-firefox',
      testMatch: /performance\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Firefox'],
        /* Firefox performance flags (Firefox uses preferences, not Chrome args) */
        launchOptions: {
          firefoxUserPrefs: {
            'dom.enable_performance': true,
            'dom.enable_resource_timing': true,
            'dom.enable_user_timing': true,
            'privacy.reduceTimerPrecision': false,  // Full-precision timestamps for perf testing
          },
        },
        video: 'off',  // Disable video for perf tests (reduces overhead)
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
