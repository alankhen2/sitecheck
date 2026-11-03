import { healthResponseSchema } from '@sitecheck/shared';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiUrl, server } from '../test/server';
import { ApiError, apiFetch, apiFetchEmpty, hasErrorCode, UnexpectedResponseError } from './api';

const health = { status: 'ok', uptime: 12.5, timestamp: '2026-11-03T08:00:00.000Z' };

describe('apiFetch', () => {
  it('returns the response parsed by the schema', async () => {
    server.use(http.get(apiUrl('/health'), () => HttpResponse.json(health)));

    await expect(apiFetch('/health', healthResponseSchema)).resolves.toEqual(health);
  });

  it('sends a JSON body with the method and content type', async () => {
    let received: { method: string; type: string | null; body: unknown } | undefined;
    server.use(
      http.post(apiUrl('/auth/login'), async ({ request }) => {
        received = {
          method: request.method,
          type: request.headers.get('content-type'),
          body: await request.json(),
        };
        return HttpResponse.json(health);
      }),
    );

    await apiFetch('/auth/login', healthResponseSchema, {
      method: 'POST',
      body: { email: 'a@b.c', password: 'x' },
    });

    expect(received).toEqual({
      method: 'POST',
      type: 'application/json',
      body: { email: 'a@b.c', password: 'x' },
    });
  });

  it('turns an error status into ApiError carrying the server message', async () => {
    server.use(
      http.get(apiUrl('/sites/1'), () =>
        HttpResponse.json({ message: 'Site not found' }, { status: 404 }),
      ),
    );

    const error = await apiFetch('/sites/1', healthResponseSchema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: 'Site not found' });
  });

  it('carries the error code, so callers need not match message text', async () => {
    server.use(
      http.post(apiUrl('/plants'), () =>
        HttpResponse.json(
          {
            message: 'Serial number is already used by another plant',
            code: 'SERIAL_NUMBER_TAKEN',
          },
          { status: 409 },
        ),
      ),
    );

    const error = await apiFetch('/plants', healthResponseSchema, { method: 'POST' }).catch(
      (e: unknown) => e,
    );

    expect(error).toMatchObject({ status: 409, code: 'SERIAL_NUMBER_TAKEN' });
    expect(hasErrorCode(error, 'SERIAL_NUMBER_TAKEN')).toBe(true);
    expect(hasErrorCode(error, 'SITE_INACTIVE')).toBe(false);
    expect(hasErrorCode(new Error('x'), 'SERIAL_NUMBER_TAKEN')).toBe(false);
  });

  it('keeps the message when the code is one this app does not know yet', async () => {
    server.use(
      http.post(apiUrl('/plants'), () =>
        HttpResponse.json({ message: 'Plant is locked', code: 'PLANT_LOCKED' }, { status: 409 }),
      ),
    );

    await expect(
      apiFetch('/plants', healthResponseSchema, { method: 'POST' }),
    ).rejects.toMatchObject({ status: 409, message: 'Plant is locked', code: undefined });
  });

  it('uses a generic message when the error body is not the API shape', async () => {
    server.use(
      http.get(apiUrl('/health'), () => new HttpResponse('<h1>Bad Gateway</h1>', { status: 502 })),
    );

    await expect(apiFetch('/health', healthResponseSchema)).rejects.toMatchObject({
      status: 502,
      message: 'Request failed (502)',
    });
  });

  it('rejects a 200 response whose shape does not match the schema', async () => {
    server.use(http.get(apiUrl('/health'), () => HttpResponse.json({ status: 'maybe' })));

    await expect(apiFetch('/health', healthResponseSchema)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });

  it('reports a network failure as ApiError with status 0', async () => {
    server.use(http.get(apiUrl('/health'), () => HttpResponse.error()));

    await expect(apiFetch('/health', healthResponseSchema)).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('Cannot reach the server') as string,
    });
  });
});

describe('apiFetchEmpty', () => {
  it('resolves on 204 and still reports errors', async () => {
    server.use(
      http.post(apiUrl('/auth/logout'), () => new HttpResponse(null, { status: 204 })),
      http.delete(apiUrl('/sites/1'), () =>
        HttpResponse.json({ message: 'Site still has plants' }, { status: 409 }),
      ),
    );

    await expect(apiFetchEmpty('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
    await expect(apiFetchEmpty('/sites/1', { method: 'DELETE' })).rejects.toMatchObject({
      status: 409,
      message: 'Site still has plants',
    });
  });
});
