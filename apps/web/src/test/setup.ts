import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { recordUnhandled, server, takeUnhandled } from './server';

beforeAll(() => {
  server.listen({
    onUnhandledFrame({ frame, defaults }) {
      recordUnhandled(frame);
      defaults.error();
    },
  });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  // A test that made a request without a handler fails, even if its own
  // assertions passed: no test may depend on a real (or missing) API.
  const unhandled = takeUnhandled();
  if (unhandled.length > 0) {
    throw new Error(`Requests without an MSW handler:\n  ${unhandled.join('\n  ')}`);
  }
});

afterAll(() => {
  server.close();
});
