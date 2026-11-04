export interface RateLimiterOptions {
  max: number;
  windowMs: number;
  /** Upper bound on remembered keys, so many different keys cannot exhaust memory. */
  maxKeys?: number;
  /** The clock, so tests can move time. */
  now?: () => number;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * Counts tries per key in fixed windows: the first try starts a window, and the
 * count starts over when it ends. Refused tries do not extend it, so someone who
 * keeps trying is still let back in on time.
 *
 * Counts live in this process's memory. That fits one server; several would each
 * count separately and need a shared store such as Redis, and a restart forgets them.
 */
export function createRateLimiter({
  max,
  windowMs,
  maxKeys = 10_000,
  now = () => Date.now(),
}: RateLimiterOptions) {
  // A Map remembers insertion order, so its first entry is the oldest window.
  const windows = new Map<string, { count: number; endsAt: number }>();

  function makeRoom(time: number) {
    if (windows.size < maxKeys) return;
    for (const [key, { endsAt }] of windows) {
      if (endsAt <= time) windows.delete(key);
    }
    const oldest = windows.keys().next();
    if (windows.size >= maxKeys && !oldest.done) windows.delete(oldest.value);
  }

  return {
    hit(key: string): RateLimitResult {
      const time = now();
      const current = windows.get(key);

      if (!current || current.endsAt <= time) {
        // Delete first, so a restarted window moves to the end of the Map's order.
        windows.delete(key);
        makeRoom(time);
        windows.set(key, { count: 1, endsAt: time + windowMs });
        return { allowed: true };
      }
      if (current.count >= max) return { allowed: false, retryAfterMs: current.endsAt - time };
      current.count += 1;
      return { allowed: true };
    },
    /** How many keys are remembered; for tests of the memory bound. */
    get size() {
      return windows.size;
    },
  };
}
