import { healthResponseSchema } from '@sitecheck/shared';
import { describe, expect, it } from 'vitest';
import { apiFetch } from '../lib/api';
import { takeUnhandled } from './server';

describe('test setup', () => {
  it('records a request that has no MSW handler', async () => {
    await apiFetch('/no-handler', healthResponseSchema).catch(() => undefined);

    // Taken here so this test passes; any other test would fail in afterEach.
    expect(takeUnhandled()).toEqual([`GET ${window.location.origin}/api/no-handler`]);
  });
});
