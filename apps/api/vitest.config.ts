import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Integration tests need Postgres; they run with `pnpm test:integration`.
    exclude: ['src/**/*.int.test.ts'],
    environment: 'node',
    env: { NODE_ENV: 'test' },
  },
});
