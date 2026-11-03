import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { SESSION_COOKIE } from '../plugins/auth.js';
import type { UserRecord } from '../services/auth.service.js';
import { buildTestApp, loginWith, testConfig, withSession } from '../test-utils/app.js';
import { testUsers } from '../test-utils/fakes.js';

/** The full app plus test-only routes that exercise the guards directly. */
async function setup(users: UserRecord[] = [testUsers.admin, testUsers.inspector]) {
  const built = await buildTestApp({ users });
  const { app } = built;

  app.get('/test/any-user', { onRequest: app.authenticate }, (req) => ({ id: req.user.id }));
  app.get('/test/admin-only', { onRequest: app.requireRole('ADMIN') }, () => ({ ok: true }));
  app.post(
    '/test/admin-with-body',
    {
      onRequest: app.requireRole('ADMIN'),
      schema: { body: z.object({ name: z.string().min(1) }) },
    },
    () => ({ ok: true }),
  );

  return built;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /auth/register', () => {
  it('creates an inspector, starts a session and never returns the hash', async () => {
    const { app } = await setup([]);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'New Person',
        email: '  New@SiteCheck.dev ',
        password: 'a long enough password',
        role: 'ADMIN',
      },
    });

    expect(res.statusCode).toBe(201);
    const body: unknown = res.json();
    expect(body).toEqual({
      id: expect.any(String) as string,
      name: 'New Person',
      email: 'new@sitecheck.dev',
      role: 'INSPECTOR',
    });

    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });
    expect(cookie?.maxAge).toBe(8 * 60 * 60);
  });

  it('rejects an invalid body with 400', async () => {
    const { app } = await setup([]);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { name: '', email: 'not-an-email', password: 'short' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.cookies).toHaveLength(0);
  });

  it('returns 409 for an email that is already registered', async () => {
    const { app } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'Ivy',
        email: testUsers.inspector.email,
        password: 'a long enough password',
      },
    });

    expect(res.statusCode).toBe(409);
  });
});

describe('POST /auth/login', () => {
  it('returns the user and sets the session cookie', async () => {
    const { app } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: testUsers.inspector.email, password: 'correct horse battery' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: testUsers.inspector.email, role: 'INSPECTOR' });
    expect(res.json()).not.toHaveProperty('passwordHash');
    expect(res.cookies.map((c) => c.name)).toContain(SESSION_COOKIE);
  });

  it('answers a wrong password and an unknown email the same way', async () => {
    const { app } = await setup();

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: testUsers.inspector.email, password: 'wrong' },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@sitecheck.dev', password: 'wrong' },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.body).toBe(unknownEmail.body);
    expect(wrongPassword.cookies).toHaveLength(0);
  });
});

describe('POST /auth/logout', () => {
  it('expires the session cookie', async () => {
    const { app } = await setup();

    const res = await app.inject({ method: 'POST', url: '/auth/logout' });

    expect(res.statusCode).toBe(204);
    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie?.value).toBe('');
    expect(cookie?.expires?.getTime()).toBeLessThan(Date.now());
  });
});

describe('authenticate (GET /auth/me)', () => {
  it('returns the current user for a valid session', async () => {
    const { app } = await setup();
    const token = await loginWith(app, testUsers.inspector.email, 'correct horse battery');

    const res = await app.inject({ method: 'GET', url: '/auth/me', cookies: withSession(token) });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: testUsers.inspector.id, role: 'INSPECTOR' });
  });

  it('returns 401 without a cookie', async () => {
    const { app } = await setup();

    const res = await app.inject({ method: 'GET', url: '/auth/me' });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for a token signed with another secret', async () => {
    const { app } = await setup();
    const { app: other } = await buildTestApp({
      config: { ...testConfig, JWT_SECRET: 'a-different-secret-also-32-chars-long' },
    });
    const forged = await loginWith(other, testUsers.inspector.email, 'correct horse battery');

    const res = await app.inject({ method: 'GET', url: '/auth/me', cookies: withSession(forged) });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for an unsigned "alg: none" token', async () => {
    const { app } = await setup();
    const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: testUsers.admin.id })}.`;

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: withSession(unsigned),
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 once the token has expired', async () => {
    const { app } = await setup();
    const token = await loginWith(app, testUsers.inspector.email, 'correct horse battery');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * 60 * 60 * 1000 + 1000);
    const res = await app.inject({ method: 'GET', url: '/auth/me', cookies: withSession(token) });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when the user was deleted after logging in', async () => {
    const { app, users } = await setup();
    const token = await loginWith(app, testUsers.inspector.email, 'correct horse battery');
    users.rows.splice(
      users.rows.findIndex((u) => u.id === testUsers.inspector.id),
      1,
    );

    const res = await app.inject({ method: 'GET', url: '/auth/me', cookies: withSession(token) });

    expect(res.statusCode).toBe(401);
  });
});

describe('requireRole', () => {
  it('checks the session before validating the body', async () => {
    const { app } = await setup();
    const token = await loginWith(app, testUsers.inspector.email, 'correct horse battery');
    const badBody = { name: '' };

    const anonymous = await app.inject({
      method: 'POST',
      url: '/test/admin-with-body',
      payload: badBody,
    });
    const inspector = await app.inject({
      method: 'POST',
      url: '/test/admin-with-body',
      payload: badBody,
      cookies: withSession(token),
    });

    // Not 400: someone without access learns nothing about the schema.
    expect(anonymous.statusCode).toBe(401);
    expect(inspector.statusCode).toBe(403);
  });

  it('returns 401 when not logged in', async () => {
    const { app } = await setup();

    const res = await app.inject({ method: 'GET', url: '/test/admin-only' });

    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for a logged-in user with the wrong role', async () => {
    const { app } = await setup();
    const token = await loginWith(app, testUsers.inspector.email, 'correct horse battery');

    const res = await app.inject({
      method: 'GET',
      url: '/test/admin-only',
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(403);
  });

  it('lets an admin through', async () => {
    const { app } = await setup();
    const token = await loginWith(app, testUsers.admin.email, 'admin password 123');

    const res = await app.inject({
      method: 'GET',
      url: '/test/admin-only',
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(200);
  });

  it('uses the role from the database, not the one at login', async () => {
    const { app, users } = await setup();
    const token = await loginWith(app, testUsers.inspector.email, 'correct horse battery');
    const ivy = users.rows.find((u) => u.id === testUsers.inspector.id);
    if (ivy) ivy.role = 'ADMIN'; // promoted after logging in

    const res = await app.inject({
      method: 'GET',
      url: '/test/admin-only',
      cookies: withSession(token),
    });

    expect(res.statusCode).toBe(200);
  });
});

describe('loadConfig', () => {
  it('refuses to start with a short JWT secret', () => {
    expect(() => loadConfig({ JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/);
  });
});
