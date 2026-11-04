import { loginBodySchema, type LoginBody } from '@sitecheck/shared';

/**
 * The read-only account a public demo offers its visitors, set when building it with
 * VITE_DEMO_EMAIL and VITE_DEMO_PASSWORD. Anything built into the web app can be read
 * by anyone, which is fine for this account and for no other. Null when not set.
 */
export function demoAccount(): LoginBody | null {
  const account = loginBodySchema.safeParse({
    email: import.meta.env.VITE_DEMO_EMAIL,
    password: import.meta.env.VITE_DEMO_PASSWORD,
  });
  return account.success ? account.data : null;
}
