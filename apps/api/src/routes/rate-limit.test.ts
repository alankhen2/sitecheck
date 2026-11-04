import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp, testConfig, testPasswords, type TestApp } from '../test-utils/app.js';
import { testUsers } from '../test-utils/fakes.js';

const email = testUsers.inspector.email;
const rightPassword = testPasswords.inspector;

interface Attempt {
  email?: string;
  password?: string;
  from?: string;
  headers?: Record<string, string>;
}

function attempt(app: TestApp, options: Attempt = {}) {
  const { email: address = email, password = 'wrong password', from, headers } = options;
  return app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: address, password },
    ...(from !== undefined && { remoteAddress: from }),
    ...(headers !== undefined && { headers }),
  });
}

async function attempts(app: TestApp, count: number, options: Attempt = {}) {
  const codes: number[] = [];
  for (let i = 0; i < count; i += 1) codes.push((await attempt(app, options)).statusCode);
  return codes;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('one account from one address', () => {
  it('allows 5 attempts in 15 minutes and refuses the 6th', async () => {
    const { app } = await buildTestApp();

    expect(await attempts(app, 6)).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it('explains itself in the usual error shape, and says when to try again', async () => {
    const { app } = await buildTestApp();
    await attempts(app, 5);

    const res = await attempt(app);

    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({
      message: 'Too many attempts. Try again in 15 minutes.',
      code: 'RATE_LIMITED',
    });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(15 * 60);
  });

  it('refuses even the right password once the limit is reached', async () => {
    const { app } = await buildTestApp();
    await attempts(app, 5);

    const res = await attempt(app, { password: rightPassword });

    expect(res.statusCode).toBe(429);
    expect(res.cookies).toEqual([]);
  });

  it('counts successful logins too, since the limit runs before the password check', async () => {
    const { app } = await buildTestApp();

    const codes = await attempts(app, 6, { password: rightPassword });

    expect(codes).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it('cannot be dodged by writing the email another way', async () => {
    const { app } = await buildTestApp();
    await attempts(app, 5);

    const res = await attempt(app, { email: `  ${email.toUpperCase()} ` });

    expect(res.statusCode).toBe(429);
  });

  it('works again after the 15 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T00:00:00.000Z'));
    const { app } = await buildTestApp();
    await attempts(app, 5);

    vi.setSystemTime(new Date('2026-11-04T00:14:59.000Z'));
    expect((await attempt(app)).statusCode).toBe(429);

    vi.setSystemTime(new Date('2026-11-04T00:15:00.000Z'));
    expect((await attempt(app)).statusCode).toBe(401);
  });
});

describe('what the limit leaves alone', () => {
  it('another account from the same address', async () => {
    const { app } = await buildTestApp();
    await attempts(app, 6);

    const res = await attempt(app, {
      email: testUsers.admin.email,
      password: testPasswords.admin,
    });

    expect(res.statusCode).toBe(200);
  });

  it('the same account from another address, so an attacker cannot lock someone out', async () => {
    const { app } = await buildTestApp();
    await attempts(app, 6, { from: '203.0.113.1' });

    const res = await attempt(app, { from: '203.0.113.2', password: rightPassword });

    expect(res.statusCode).toBe(200);
  });

  it('other routes', async () => {
    const { app } = await buildTestApp();
    await attempts(app, 6);

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
  });
});

describe('one address trying many accounts', () => {
  it('allows 30 attempts in 15 minutes and refuses the 31st', async () => {
    const { app } = await buildTestApp();
    for (let i = 0; i < 30; i += 1) {
      expect((await attempt(app, { email: `user${String(i)}@example.com` })).statusCode).toBe(401);
    }

    const res = await attempt(app, { email: 'one-more@example.com' });

    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('counts requests that fail validation too', async () => {
    const { app } = await buildTestApp();
    for (let i = 0; i < 30; i += 1) {
      expect((await attempt(app, { email: 'not an email' })).statusCode).toBe(400);
    }

    expect((await attempt(app, { email: 'not an email' })).statusCode).toBe(429);
  });
});

describe('the address behind a proxy', () => {
  const forwardedFor = (address: string) => ({ 'x-forwarded-for': address });

  it('ignores X-Forwarded-For by default, so a client cannot invent new addresses', async () => {
    const { app } = await buildTestApp();
    for (let i = 0; i < 5; i += 1) {
      await attempt(app, { headers: forwardedFor(`203.0.113.${String(i)}`) });
    }

    const res = await attempt(app, { headers: forwardedFor('203.0.113.99') });

    expect(res.statusCode).toBe(429);
  });

  it('reads it when told how many proxies to trust', async () => {
    const { app } = await buildTestApp({ config: { ...testConfig, TRUST_PROXY: 1 } });
    await attempts(app, 6, { headers: forwardedFor('203.0.113.1') });

    const res = await attempt(app, {
      headers: forwardedFor('203.0.113.2'),
      password: rightPassword,
    });

    expect(res.statusCode).toBe(200);
  });

  it('trusts only that many: a client cannot add its own hop in front', async () => {
    const { app } = await buildTestApp({ config: { ...testConfig, TRUST_PROXY: 1 } });
    // Client-supplied value first, then the one the single trusted proxy appended.
    for (let i = 0; i < 5; i += 1) {
      await attempt(app, { headers: forwardedFor(`198.51.100.${String(i)}, 203.0.113.1`) });
    }

    const res = await attempt(app, { headers: forwardedFor('198.51.100.99, 203.0.113.1') });

    expect(res.statusCode).toBe(429);
  });
});

describe('registering', () => {
  it('allows 10 accounts an hour from one address', async () => {
    const { app } = await buildTestApp({
      config: { ...testConfig, ALLOW_REGISTRATION: true },
    });
    const register = (i: number) =>
      app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          name: 'New',
          email: `new${String(i)}@example.com`,
          password: 'a long enough password',
        },
      });
    for (let i = 0; i < 10; i += 1) expect((await register(i)).statusCode).toBe(201);

    const res = await register(10);

    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({
      message: 'Too many attempts. Try again in 60 minutes.',
      code: 'RATE_LIMITED',
    });
  });
});
