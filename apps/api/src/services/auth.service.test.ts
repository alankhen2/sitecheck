import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthService, EmailTakenError, InvalidCredentialsError } from './auth.service.js';
import { fakeHashPassword, fakeUsers, fakeVerifyPassword, testUsers } from '../test-utils/fakes.js';

// Wrapped in vi.fn so tests can assert how often the password check ran.
const hashPassword = vi.fn(fakeHashPassword);
const verifyPassword = vi.fn(fakeVerifyPassword);
const ivy = testUsers.inspector;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('register', () => {
  it('creates an INSPECTOR and returns the user without the password hash', async () => {
    const users = fakeUsers();
    const auth = createAuthService({ users, hashPassword, verifyPassword });

    const user = await auth.register({
      name: 'New Person',
      email: 'new@sitecheck.dev',
      password: 'a long enough password',
    });

    expect(user).toEqual({
      id: expect.any(String) as string,
      name: 'New Person',
      email: 'new@sitecheck.dev',
      role: 'INSPECTOR',
    });
    expect(user).not.toHaveProperty('passwordHash');
    expect(users.rows[0]?.passwordHash).toBe('hashed:a long enough password');
  });

  it('ignores a role sent by the client', async () => {
    const users = fakeUsers();
    const auth = createAuthService({ users, hashPassword, verifyPassword });

    // A client could add extra fields to the JSON; the service must not trust them.
    const body = {
      name: 'Mallory',
      email: 'm@x.dev',
      password: 'a long enough password',
      role: 'ADMIN',
    };
    const user = await auth.register(body);

    expect(user.role).toBe('INSPECTOR');
  });

  it('rejects an email that is already registered', async () => {
    const auth = createAuthService({ users: fakeUsers([ivy]), hashPassword, verifyPassword });

    await expect(
      auth.register({ name: 'Ivy 2', email: ivy.email, password: 'a long enough password' }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });
});

describe('login', () => {
  it('returns the user for the right password', async () => {
    const auth = createAuthService({ users: fakeUsers([ivy]), hashPassword, verifyPassword });

    const user = await auth.login({ email: ivy.email, password: 'correct horse battery' });

    expect(user).toEqual({ id: ivy.id, name: ivy.name, email: ivy.email, role: 'INSPECTOR' });
  });

  it('rejects a wrong password', async () => {
    const auth = createAuthService({ users: fakeUsers([ivy]), hashPassword, verifyPassword });

    await expect(auth.login({ email: ivy.email, password: 'wrong' })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('gives an unknown email the same error and still checks a password', async () => {
    const auth = createAuthService({ users: fakeUsers([ivy]), hashPassword, verifyPassword });

    await expect(
      auth.login({ email: 'nobody@sitecheck.dev', password: 'anything' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    // Running the (slow) hash check either way keeps the response time from
    // revealing which emails have accounts.
    expect(verifyPassword).toHaveBeenCalledTimes(1);
  });
});

describe('getUser', () => {
  it('returns the public user for a known id', async () => {
    const auth = createAuthService({ users: fakeUsers([ivy]), hashPassword, verifyPassword });

    expect(await auth.getUser(ivy.id)).toEqual({
      id: ivy.id,
      name: ivy.name,
      email: ivy.email,
      role: 'INSPECTOR',
    });
  });

  it('returns null for a deleted user', async () => {
    const auth = createAuthService({ users: fakeUsers(), hashPassword, verifyPassword });

    expect(await auth.getUser(ivy.id)).toBeNull();
  });
});
