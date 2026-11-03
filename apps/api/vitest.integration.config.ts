import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './src/test-integration/database-url.js';

// Local runs take DATABASE_URL from apps/api/.env; CI sets TEST_DATABASE_URL.
// dotenv never overrides variables that are already set.
loadDotenv({ quiet: true });

const databaseUrl = testDatabaseUrl();

/**
 * Integration tests: the real app against a real Postgres database (`*_test`).
 * Run with `pnpm test:integration`; needs `docker compose up -d db` locally.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    environment: 'node',
    globalSetup: ['src/test-integration/global-setup.ts'],
    // One database, so test files run one after another, never in parallel.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      JWT_SECRET: 'integration-test-secret-at-least-32-chars',
    },
  },
});
