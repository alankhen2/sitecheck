import { describe, expect, it } from 'vitest';
import { ApiError, UnexpectedResponseError } from './api';
import { shouldRetry } from './query-client';

describe('shouldRetry', () => {
  it.each([
    ['a network failure', new ApiError(0, 'offline'), true],
    ['a server error', new ApiError(503, 'down'), true],
    ['not logged in', new ApiError(401, 'login'), false],
    ['forbidden', new ApiError(403, 'no'), false],
    ['not found', new ApiError(404, 'gone'), false],
    ['a contract mismatch', new UnexpectedResponseError('/x', null), false],
  ])('retry after %s: %s', (_label, error, expected) => {
    expect(shouldRetry(0, error)).toBe(expected);
  });

  it('gives up after two retries', () => {
    expect(shouldRetry(2, new ApiError(503, 'down'))).toBe(false);
  });
});
