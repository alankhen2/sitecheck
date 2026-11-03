import { setupServer } from 'msw/node';

/**
 * A fake API at the network level. Tests add handlers with `server.use(...)`;
 * the code under test calls fetch exactly as in the browser and does not know
 * it is talking to a stand-in.
 */
export const server = setupServer();

/** Absolute URL of an API path, as the app requests it from jsdom's origin. */
export const apiUrl = (path: string) => new URL(`/api${path}`, window.location.origin).toString();

const unhandled: string[] = [];

/**
 * Called by MSW for a request no handler matched. MSW then fails that request
 * with a network error, but apiFetch turns network errors into "Cannot reach
 * the server", which a test checking an error state could mistake for success.
 * So every unhandled request is also recorded, and setup.ts fails the test.
 */
export function recordUnhandled(frame: { protocol: string; data: unknown }) {
  const { data } = frame;
  const request =
    typeof data === 'object' &&
    data !== null &&
    'request' in data &&
    data.request instanceof Request
      ? data.request
      : undefined;
  unhandled.push(request ? `${request.method} ${request.url}` : frame.protocol);
}

/** Returns and clears the unhandled requests recorded so far. */
export function takeUnhandled(): string[] {
  return unhandled.splice(0);
}
