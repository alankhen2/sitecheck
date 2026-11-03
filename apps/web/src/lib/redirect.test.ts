import { describe, expect, it } from 'vitest';
import { DEFAULT_PATH, safeRedirect } from './redirect';

describe('safeRedirect', () => {
  it.each([
    ['/sites', '/sites'],
    ['/plants?q=cat&page=2', '/plants?q=cat&page=2'],
  ])('keeps the internal path %s', (from, expected) => {
    expect(safeRedirect(from)).toBe(expected);
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['another site', 'https://evil.example/login'],
    ['protocol-relative', '//evil.example'],
    ['backslash trick', '/\\evil.example'],
    ['tab trick', '/\t/evil.example'],
    ['javascript URL', 'javascript:alert(1)'],
    ['relative path', 'sites'],
    ['the login page itself', '/login?from=/sites'],
  ])('falls back to the default for %s', (_label, from) => {
    expect(safeRedirect(from)).toBe(DEFAULT_PATH);
  });
});
