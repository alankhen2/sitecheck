import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { recordUnhandled, server, takeUnhandled } from './server';

// jsdom has <dialog> but not its methods. This stand-in covers what the app
// uses: open/close toggle the `open` attribute (which makes the element a
// visible "dialog" for Testing Library) and close fires the "close" event.
// Focus trapping and Esc are the browser's job and are checked in Chrome.
// Typed as Partial because the methods may be missing, which the DOM types do not allow for.
const dialogPrototype: Partial<HTMLDialogElement> = HTMLDialogElement.prototype;
if (!dialogPrototype.showModal) {
  dialogPrototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  dialogPrototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

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
