import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limiter.js';

function setup(options: { max?: number; maxKeys?: number } = {}) {
  let time = 1_000_000;
  const limiter = createRateLimiter({
    max: options.max ?? 2,
    windowMs: 60_000,
    ...(options.maxKeys !== undefined && { maxKeys: options.maxKeys }),
    now: () => time,
  });
  return {
    limiter,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('createRateLimiter', () => {
  it('allows up to the maximum, then refuses and says how long to wait', () => {
    const { limiter, advance } = setup();

    expect(limiter.hit('a')).toEqual({ allowed: true });
    advance(10_000);
    expect(limiter.hit('a')).toEqual({ allowed: true });
    advance(10_000);
    expect(limiter.hit('a')).toEqual({ allowed: false, retryAfterMs: 40_000 });
  });

  it('counts each key on its own', () => {
    const { limiter } = setup({ max: 1 });

    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('b').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(false);
  });

  it('allows again at the exact end of the window, not a moment before', () => {
    const { limiter, advance } = setup({ max: 1 });
    limiter.hit('a');

    advance(59_999);
    expect(limiter.hit('a').allowed).toBe(false);
    advance(1);
    expect(limiter.hit('a').allowed).toBe(true);
  });

  it('does not extend the wait for someone who keeps trying', () => {
    const { limiter, advance } = setup({ max: 1 });
    limiter.hit('a');

    for (let i = 0; i < 5; i += 1) {
      advance(10_000);
      limiter.hit('a');
    }
    advance(10_000);

    expect(limiter.hit('a').allowed).toBe(true);
  });

  it('never remembers more keys than allowed', () => {
    const { limiter } = setup({ maxKeys: 3 });

    for (const key of ['a', 'b', 'c', 'd', 'e']) limiter.hit(key);

    expect(limiter.size).toBe(3);
  });

  it('makes room by dropping finished windows before live ones', () => {
    const { limiter, advance } = setup({ max: 1, maxKeys: 2 });
    limiter.hit('old');
    advance(50_000);
    limiter.hit('live');
    advance(10_000); // "old" has ended, "live" has not.

    limiter.hit('new');

    expect(limiter.hit('live').allowed).toBe(false);
    expect(limiter.size).toBe(2);
  });

  it('drops the oldest live window when everything is still live', () => {
    const { limiter, advance } = setup({ max: 1, maxKeys: 2 });
    limiter.hit('first');
    advance(1000);
    limiter.hit('second');
    advance(1000);

    limiter.hit('third');

    expect(limiter.hit('second').allowed).toBe(false);
    expect(limiter.hit('third').allowed).toBe(false);
    expect(limiter.size).toBe(2);
  });
});
