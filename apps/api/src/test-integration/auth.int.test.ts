import supertest from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { agentFor, prisma, resetDatabase, seedUsers, startApp, users } from './helpers.js';

const { app, http } = await startApp();

beforeEach(async () => {
  await resetDatabase();
  await seedUsers();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const newUser = { name: 'New Person', email: 'new@test.dev', password: 'a long enough password' };

describe('register → session → logout, with a cookie jar', () => {
  it('keeps the user logged in until logout', async () => {
    const agent = supertest.agent(app.server);

    await agent.post('/auth/register').send(newUser).expect(201);
    const me = await agent.get('/auth/me').expect(200);
    await agent.post('/auth/logout').expect(204);
    await agent.get('/auth/me').expect(401);

    expect(me.body).toMatchObject({ email: newUser.email, role: 'INSPECTOR' });
  });

  it('stores a real scrypt hash, never the password', async () => {
    await http.post('/auth/register').send(newUser).expect(201);

    const row = await prisma.user.findUniqueOrThrow({ where: { email: newUser.email } });

    expect(row.passwordHash).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(row.passwordHash).not.toContain(newUser.password);
  });

  it('ignores a role in the body', async () => {
    await http
      .post('/auth/register')
      .send({ ...newUser, role: 'ADMIN' })
      .expect(201);

    const row = await prisma.user.findUniqueOrThrow({ where: { email: newUser.email } });
    expect(row.role).toBe('INSPECTOR');
  });
});

describe('races the database must settle', () => {
  it('gives two simultaneous registrations with one email a 201 and a 409, never a 500', async () => {
    const [a, b] = await Promise.all([
      http.post('/auth/register').send(newUser),
      http.post('/auth/register').send({ ...newUser, email: 'NEW@test.dev' }),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await prisma.user.count({ where: { email: newUser.email } })).toBe(1);
  });
});

describe('login', () => {
  it('accepts the email in any case', async () => {
    await http
      .post('/auth/login')
      .send({ email: users.admin.email.toUpperCase(), password: users.admin.password })
      .expect(200);
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const wrong = await http
      .post('/auth/login')
      .send({ email: users.admin.email, password: 'nope' });
    const unknown = await http
      .post('/auth/login')
      .send({ email: 'nobody@test.dev', password: 'nope' });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.text).toBe(unknown.text);
  });
});

describe('the session reads the user from the database on every request', () => {
  it('applies a role change immediately', async () => {
    const agent = await agentFor(app, 'inspector');
    await agent.post('/sites').send({ name: 'X', address: 'Y' }).expect(403);

    await prisma.user.update({ where: { email: users.inspector.email }, data: { role: 'ADMIN' } });

    await agent.post('/sites').send({ name: 'X', address: 'Y' }).expect(201);
  });

  it('rejects the session of a deleted user', async () => {
    const agent = await agentFor(app, 'inspector');

    await prisma.user.delete({ where: { email: users.inspector.email } });

    await agent.get('/auth/me').expect(401);
  });
});
