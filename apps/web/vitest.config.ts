import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/** Component tests: the Vite setup (React plugin) plus a simulated browser (jsdom). */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test/setup.ts'],
    },
  }),
);
