import { errorResponseSchema } from '@sitecheck/shared';

/**
 * The one place the web app talks to the API.
 *
 * - Every path goes through `/api`, which Vite (and later the host) proxies to
 *   Fastify, so the browser sees one origin and sends the httpOnly session
 *   cookie by itself. JavaScript never reads or stores the token.
 * - Every successful response is parsed with a Zod schema from
 *   packages/shared. What the server sent is `unknown` until a schema says
 *   otherwise, so a contract mismatch fails loudly here instead of as
 *   `undefined` somewhere in a component.
 */

const API_BASE = '/api';

/** Anything with Zod's `parse`; keeps this file free of a direct zod import. */
interface Schema<T> {
  parse(data: unknown): T;
}

/** The server answered with an error status (or could not be reached: status 0). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

/** The server answered 2xx, but not with the shape the shared schema describes. */
export class UnexpectedResponseError extends Error {
  constructor(path: string, cause: unknown) {
    super(`Unexpected response from ${path}`, { cause });
    this.name = 'UnexpectedResponseError';
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: Method;
  /** Sent as JSON. */
  body?: unknown;
  /** TanStack Query passes one, so leaving a page cancels its requests. */
  signal?: AbortSignal;
}

async function send(path: string, { method = 'GET', body, signal }: RequestOptions) {
  // An absolute URL built from the page's origin: the same request in the
  // browser, and it also works in tests, where Node's fetch rejects "/api/...".
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  if (signal) init.signal = signal;

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    // Let a cancelled request stay a cancellation; TanStack Query expects that.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }

  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res;
}

/** The API's `{ message }`, or a generic text if the body is something else (e.g. a proxy page). */
async function errorMessage(res: Response): Promise<string> {
  try {
    const parsed = errorResponseSchema.safeParse(await res.json());
    if (parsed.success) return parsed.data.message;
  } catch {
    // Not JSON.
  }
  return `Request failed (${String(res.status)})`;
}

/** A request whose response body is parsed with `schema`. */
export async function apiFetch<T>(
  path: string,
  schema: Schema<T>,
  options: RequestOptions = {},
): Promise<T> {
  const res = await send(path, options);
  const data: unknown = await res.json();
  try {
    return schema.parse(data);
  } catch (err) {
    throw new UnexpectedResponseError(path, err);
  }
}

/** A request whose success has no body (204), such as DELETE or logout. */
export async function apiFetchEmpty(path: string, options: RequestOptions = {}): Promise<void> {
  await send(path, options);
}
