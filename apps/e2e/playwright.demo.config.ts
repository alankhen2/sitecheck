import { defineConfig } from '@playwright/test';
import { apiServer, webServer } from './playwright.config';
import { E2E_DEMO_PASSWORD, demo } from './tests/test-data';

// Records the demo video. Not a test suite: CI never runs it (`pnpm demo:record`).
export default defineConfig({
  testDir: './demo',
  outputDir: './demo-output/runs',
  workers: 1,
  retries: 0,
  // The recording is slow on purpose.
  timeout: 5 * 60_000,
  reporter: 'list',
  use: { baseURL: webServer.url },
  webServer: [
    apiServer,
    {
      ...webServer,
      // Built here, with the demo account, so the login page shows its button.
      // These are the throwaway end-to-end values, never a real deployment's.
      command: `pnpm --filter @sitecheck/web build && ${webServer.command}`,
      timeout: 120_000,
      env: {
        ...webServer.env,
        VITE_DEMO_EMAIL: demo.email,
        VITE_DEMO_PASSWORD: E2E_DEMO_PASSWORD,
      },
    },
  ],
});
