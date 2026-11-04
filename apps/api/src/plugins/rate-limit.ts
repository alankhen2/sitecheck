import type { LoginBody } from '@sitecheck/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { clientAddress } from '../lib/client-address.js';
import { createRateLimiter } from '../lib/rate-limiter.js';
import { RateLimitedError } from '../services/errors.js';

/**
 * How many tries the auth routes allow.
 *
 * Per account and address, 5 stops someone guessing one person's password. Per
 * address, 30 stops someone trying one password on many accounts. The account
 * limit also holds per address, so an attacker elsewhere cannot lock a person out
 * by failing on purpose: only the people behind the same address share a limit.
 */
export interface AuthLimits {
  loginPerAccount: number;
  loginPerAddress: number;
  registerPerAddress: number;
}

export const defaultAuthLimits: AuthLimits = {
  loginPerAccount: 5,
  loginPerAddress: 30,
  registerPerAddress: 10,
};

const MINUTE = 60_000;

/** A hook that refuses with 429 once `keyOf`'s key has used up its tries. */
function limitBy(max: number, windowMs: number, keyOf: (request: FastifyRequest) => string) {
  const limiter = createRateLimiter({ max, windowMs });

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const result = limiter.hit(keyOf(request));
    if (result.allowed) return;
    // void, not await: a reply is thenable, and awaiting one waits for it to be sent.
    void reply.header('retry-after', Math.ceil(result.retryAfterMs / 1000));
    throw new RateLimitedError(Math.ceil(result.retryAfterMs / MINUTE));
  };
}

/** One set of counters per app, so each app in the tests starts from zero. */
export function createAuthLimitHooks(limits: AuthLimits) {
  return {
    // onRequest: every request counts, even one that later fails validation.
    loginPerAddress: limitBy(limits.loginPerAddress, 15 * MINUTE, (request) =>
      clientAddress(request.ip),
    ),
    // preHandler: needs the email, which the schema has already trimmed and
    // lowercased by then, so "A@x.dev" cannot count separately from "a@x.dev".
    loginPerAccount: limitBy(
      limits.loginPerAccount,
      15 * MINUTE,
      (request) => `${clientAddress(request.ip)}|${(request.body as LoginBody).email}`,
    ),
    registerPerAddress: limitBy(limits.registerPerAddress, 60 * MINUTE, (request) =>
      clientAddress(request.ip),
    ),
  };
}
