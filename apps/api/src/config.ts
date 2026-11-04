import { z } from 'zod';

// Environment variables are outside input too: parse them once at startup so a
// missing or weak secret stops the server immediately, not on the first login.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  // HS256 needs at least 256 bits of key; 32 characters is the floor, a random 43+ is better.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // How many proxies sit in front of the app. 0 ignores X-Forwarded-For, which a
  // client could otherwise fill in to get a fresh rate limit on every request.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Off unless asked for: anyone who can register gets an inspector's write access.
  ALLOW_REGISTRATION: z.stringbool().default(false),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
