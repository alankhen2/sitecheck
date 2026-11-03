import { describe, expect, it } from 'vitest';
import { assertTestDatabase, testDatabaseUrl } from './database-url.js';

const dev = 'postgresql://sitecheck:pw@localhost:5432/sitecheck?schema=public';

describe('testDatabaseUrl', () => {
  it('adds _test to the dev database name, keeping host and options', () => {
    expect(testDatabaseUrl({ DATABASE_URL: dev })).toBe(
      'postgresql://sitecheck:pw@localhost:5432/sitecheck_test?schema=public',
    );
  });

  it('does not add _test twice', () => {
    const url = 'postgresql://u:p@localhost:5432/app_test';
    expect(testDatabaseUrl({ DATABASE_URL: url })).toBe(url);
  });

  it('prefers TEST_DATABASE_URL', () => {
    const url = 'postgresql://ci:ci@localhost:5432/ci_test';
    expect(testDatabaseUrl({ DATABASE_URL: dev, TEST_DATABASE_URL: url })).toBe(url);
  });

  it('refuses a TEST_DATABASE_URL that is not a _test database', () => {
    expect(() => testDatabaseUrl({ TEST_DATABASE_URL: dev })).toThrow(/must end with "_test"/);
  });

  it('explains what to set when nothing is configured', () => {
    expect(() => testDatabaseUrl({})).toThrow(/TEST_DATABASE_URL/);
  });
});

describe('assertTestDatabase', () => {
  it.each(['sitecheck', 'production', 'test', 'my_test_db', 'x_test; DROP'])(
    'rejects "%s"',
    (name) => {
      expect(() => {
        assertTestDatabase(`postgresql://u:p@h:5432/${name}`);
      }).toThrow();
    },
  );
});
