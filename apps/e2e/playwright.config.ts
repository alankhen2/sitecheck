import { defineConfig, devices } from '@playwright/test';
import { E2E_DEMO_PASSWORD, E2E_PASSWORD } from './tests/test-data';

// Not the dev ports: a dev server left running must not be mistaken for the test
// one, because these tests write to whatever database that server uses.
const API_PORT = 3100;
const WEB_PORT = 4173;
const apiUrl = `http://127.0.0.1:${String(API_PORT)}`;
const webUrl = `http://localhost:${String(WEB_PORT)}`;

const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  'postgresql://sitecheck:sitecheck@localhost:5432/sitecheck_e2e?schema=public';

export default defineConfig({
  testDir: './tests',
  // One database, so one test at a time.
  workers: 1,
  // A flow that only passes the second time is a bug to look at, not to hide.
  retries: 0,
  // A stray test.only must not make CI pass by skipping the rest.
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: webUrl,
    // On a failure, keep what is needed to see why without running it again.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @sitecheck/api e2e:serve',
      url: `${apiUrl}/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(API_PORT),
        DATABASE_URL: databaseUrl,
        JWT_SECRET: 'e2e-only-secret-that-signs-nothing-real',
        SEED_PASSWORD: E2E_PASSWORD,
        DEMO_PASSWORD: E2E_DEMO_PASSWORD,
      },
    },
    {
      // The production build, not the dev server: what users would really get.
      command: `pnpm --filter @sitecheck/web exec vite preview --port ${String(WEB_PORT)} --strictPort`,
      url: webUrl,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: apiUrl },
    },
  ],
});
