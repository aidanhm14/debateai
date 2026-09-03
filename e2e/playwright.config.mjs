// Browser smoke tests for itsdebatable.com.
//
// These run against PRODUCTION by default (BASE_URL overrides), because
// the functions 500 locally without ~20 env keys and App Check is
// hard-enforced in prod. Every test here is read-only or hits a gate that
// refuses before spending anything: no AI round is ever started.
//
// The user agent is overridden on purpose. app/netlify/edge-functions/
// traffic-quality.js answers a bodyless 204 to any document request whose
// UA or client hints say HeadlessChrome / Playwright, so the stock
// Playwright UA would make every page test fail at the edge. The suffix
// keeps the runs identifiable in logs. navigator.webdriver stays true, so
// the presence beat and the sign-in wall veto themselves.
//
// channel: 'chromium' is load-bearing, not a preference. The default
// headless SHELL still sends "HeadlessChrome" in the sec-ch-ua client hint,
// which the edge filter also reads, and a 204 on a navigation surfaces as
// net::ERR_ABORTED. The full Chromium build in new headless mode sends a
// plain "Chromium" brand. Measured 2026-09-03, all three channels.
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://itsdebatable.com';
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: CI ? 2 : 3,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    ...devices['Desktop Chrome'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 DebatableE2E/1',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', channel: 'chromium' } }],
});
