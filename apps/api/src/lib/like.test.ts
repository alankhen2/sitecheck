import { describe, expect, it } from 'vitest';
import { escapeLike } from './like.js';

describe('escapeLike', () => {
  it.each([
    ['plain text', 'CAT 336', 'CAT 336'],
    ['percent', '100%', '100\\%'],
    ['underscore', 'E_A', 'E\\_A'],
    ['backslash first, so it cannot cancel a later escape', 'a\\%', 'a\\\\\\%'],
    ['several', '%_%', '\\%\\_\\%'],
  ])('escapes %s', (_label, input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});
