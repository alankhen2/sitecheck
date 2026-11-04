import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const required = { JWT_SECRET: 'a-secret-that-is-at-least-32-characters' };

describe('ALLOW_REGISTRATION', () => {
  it('is off unless asked for, so a forgotten setting leaves the door closed', () => {
    expect(loadConfig(required).ALLOW_REGISTRATION).toBe(false);
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('reads %s as text, not as a value that is simply present', (value, expected) => {
    expect(loadConfig({ ...required, ALLOW_REGISTRATION: value }).ALLOW_REGISTRATION).toBe(
      expected,
    );
  });

  it('stops the server on a value it cannot read', () => {
    expect(() => loadConfig({ ...required, ALLOW_REGISTRATION: 'maybe' })).toThrow(
      'ALLOW_REGISTRATION',
    );
  });
});
