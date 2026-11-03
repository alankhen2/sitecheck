import { describe, expect, it } from 'vitest';
import { NotFoundError } from './services/errors.js';
import { buildTestApp } from './test-utils/app.js';

describe('error handler', () => {
  it('turns a domain error into its status and message', async () => {
    const { app } = await buildTestApp();
    app.get('/test/missing', () => {
      throw new NotFoundError('Widget');
    });

    const res = await app.inject({ method: 'GET', url: '/test/missing' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ message: 'Widget not found' });
  });

  it('hides the message of an unexpected error', async () => {
    const { app } = await buildTestApp();
    app.get('/test/boom', () => {
      throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2');
    });

    const res = await app.inject({ method: 'GET', url: '/test/boom' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ message: 'Internal Server Error' });
    expect(res.body).not.toContain('hunter2');
  });
});
