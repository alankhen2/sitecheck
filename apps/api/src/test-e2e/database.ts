import { databaseName } from '../test-integration/database-url.js';

const E2E_DB_NAME = /^[a-z0-9_]+_e2e$/;

/**
 * The end-to-end server drops its database on every start, so pointing it at the
 * dev or production database by mistake must be impossible, not just unlikely.
 */
export function assertE2eDatabase(url: string): void {
  const name = databaseName(url);
  if (!E2E_DB_NAME.test(name)) {
    throw new Error(
      `Refusing to start the end-to-end server on database "${name}": its name must end with "_e2e".`,
    );
  }
}
