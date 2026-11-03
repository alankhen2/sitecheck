/**
 * Which database the integration tests use, and the guard that keeps them off
 * any other database. The tests TRUNCATE every table, so pointing them at the
 * dev or production database by mistake must be impossible, not just unlikely.
 */

const TEST_DB_NAME = /^[a-z0-9_]+_test$/;

export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

export function assertTestDatabase(url: string): void {
  const name = databaseName(url);
  if (!TEST_DB_NAME.test(name)) {
    throw new Error(
      `Refusing to run integration tests against database "${name}": its name must end with "_test".`,
    );
  }
}

/**
 * TEST_DATABASE_URL if set (CI), otherwise DATABASE_URL with "_test" added to the
 * database name (local: sitecheck -> sitecheck_test, next to your dev data).
 */
export function testDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const base = env.TEST_DATABASE_URL ?? env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'Set TEST_DATABASE_URL, or DATABASE_URL in apps/api/.env, to run integration tests.',
    );
  }
  const url = new URL(base);
  const name = databaseName(base);
  if (env.TEST_DATABASE_URL === undefined && !name.endsWith('_test')) {
    url.pathname = `/${name}_test`;
  }
  const result = url.toString();
  assertTestDatabase(result);
  return result;
}
