import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,         // run serially — tests share auth state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    // 'line' shows one line per test — compact, easy to read in CI logs
    ['line'],
    // JSON written to working dir; docker command copies to /results
    ['json', { outputFile: 'test-results.json' }],
    // HTML report for deep-dive (opened manually)
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Setup: create auth state files for each role
    // testDir overrides the global './specs' for this project only
    {
      name: 'setup',
      testDir: './fixtures',
      testMatch: /.*\.setup\.ts/,
    },
    // Main test suite (depends on setup)
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  // Timeout per test
  timeout: 30_000,
  expect: { timeout: 8_000 },
});
