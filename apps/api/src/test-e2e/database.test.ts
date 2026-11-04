import { describe, expect, it } from 'vitest';
import { assertE2eDatabase } from './database.js';

const urlFor = (name: string) => `postgresql://user:pass@localhost:5432/${name}?schema=public`;

describe('assertE2eDatabase', () => {
  it('accepts a database whose name ends with _e2e', () => {
    expect(() => {
      assertE2eDatabase(urlFor('sitecheck_e2e'));
    }).not.toThrow();
  });

  it.each(['sitecheck', 'sitecheck_test', 'sitecheck_e2e_copy', 'e2e', '_e2e', 'bad"name_e2e'])(
    'refuses %s',
    (name) => {
      expect(() => {
        assertE2eDatabase(urlFor(name));
      }).toThrow('must end with "_e2e"');
    },
  );
});
