const DEV_STAFF_PASSWORD = 'sitecheck-dev';
const DEV_DEMO_PASSWORD = 'sitecheck-demo';

/**
 * Passwords for the seeded users: `staff` for those who can change data, `demo`
 * for the read-only account. The demo password is meant to be published, so in
 * production it must not also open the accounts that can write.
 */
export function seedPasswords(env: Record<string, string | undefined>): {
  staff: string;
  demo: string;
} {
  const { NODE_ENV, SEED_PASSWORD, DEMO_PASSWORD } = env;

  if (NODE_ENV !== 'production') {
    return { staff: SEED_PASSWORD ?? DEV_STAFF_PASSWORD, demo: DEMO_PASSWORD ?? DEV_DEMO_PASSWORD };
  }

  if (!SEED_PASSWORD) throw new Error('Set SEED_PASSWORD when seeding in production.');
  if (!DEMO_PASSWORD) throw new Error('Set DEMO_PASSWORD when seeding in production.');
  if (SEED_PASSWORD === DEMO_PASSWORD) {
    throw new Error('SEED_PASSWORD and DEMO_PASSWORD must differ: the demo password is public.');
  }
  if (SEED_PASSWORD === DEV_STAFF_PASSWORD) {
    throw new Error('SEED_PASSWORD is still the value from .env.example, which is public.');
  }
  return { staff: SEED_PASSWORD, demo: DEMO_PASSWORD };
}
