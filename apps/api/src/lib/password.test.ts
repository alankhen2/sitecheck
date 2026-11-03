import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('hashPassword', () => {
  it('stores algorithm, parameters, salt and hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    const parts = hash.split('$');

    expect(parts).toHaveLength(6);
    expect(parts.slice(0, 4)).toEqual(['scrypt', '131072', '8', '1']);
  });

  it('never stores the plain password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).not.toContain('correct horse battery staple');
  });

  it('uses a fresh salt each time, so equal passwords give different hashes', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);

    expect(a).not.toBe(b);
    expect(a.split('$')[4]).not.toBe(b.split('$')[4]);
  });
});

describe('verifyPassword', () => {
  it('accepts the right password', async () => {
    const hash = await hashPassword('s3cret!');

    await expect(verifyPassword('s3cret!', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('s3cret!');

    await expect(verifyPassword('S3cret!', hash)).resolves.toBe(false);
  });

  it.each([
    ['empty string', ''],
    ['not a hash', 'not-a-hash'],
    ['other algorithm', 'bcrypt$10$abc$def$ghi$jkl'],
    ['missing parts', 'scrypt$131072$8$1$c2FsdA=='],
  ])('rejects a malformed stored hash (%s)', async (_label, stored) => {
    await expect(verifyPassword('s3cret!', stored)).resolves.toBe(false);
  });
});
