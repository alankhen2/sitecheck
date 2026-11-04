import { describe, expect, it } from 'vitest';
import { seedPasswords } from './seed-passwords.js';

const production = { NODE_ENV: 'production' };

describe('seedPasswords', () => {
  it('gives development its defaults, with different passwords for staff and demo', () => {
    const { staff, demo } = seedPasswords({});

    expect(staff).toBeTruthy();
    expect(demo).toBeTruthy();
    expect(staff).not.toBe(demo);
  });

  it('uses the passwords it is given', () => {
    expect(seedPasswords({ SEED_PASSWORD: 'staff one', DEMO_PASSWORD: 'demo one' })).toEqual({
      staff: 'staff one',
      demo: 'demo one',
    });
  });

  describe('in production', () => {
    it('accepts two different passwords of its own', () => {
      const env = { ...production, SEED_PASSWORD: 'staff secret', DEMO_PASSWORD: 'public demo' };

      expect(seedPasswords(env)).toEqual({ staff: 'staff secret', demo: 'public demo' });
    });

    it('refuses a missing staff password', () => {
      expect(() => seedPasswords({ ...production, DEMO_PASSWORD: 'public demo' })).toThrow(
        'SEED_PASSWORD',
      );
    });

    it('refuses a missing demo password', () => {
      expect(() => seedPasswords({ ...production, SEED_PASSWORD: 'staff secret' })).toThrow(
        'DEMO_PASSWORD',
      );
    });

    // The demo password is published, so sharing it would publish the admin's too.
    it('refuses the same password for both', () => {
      const env = { ...production, SEED_PASSWORD: 'same', DEMO_PASSWORD: 'same' };

      expect(() => seedPasswords(env)).toThrow('must differ');
    });

    it('refuses the staff password from .env.example', () => {
      const env = { ...production, SEED_PASSWORD: 'sitecheck-dev', DEMO_PASSWORD: 'public demo' };

      expect(() => seedPasswords(env)).toThrow('.env.example');
    });
  });
});
