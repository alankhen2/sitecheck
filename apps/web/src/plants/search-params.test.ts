import { describe, expect, it } from 'vitest';
import { defaultPlantQuery, hasFilters, plantQueryToParams, readPlantQuery } from './search-params';

const siteId = '019a0000-0000-7000-8000-000000000001';
const read = (search: string) => readPlantQuery(new URLSearchParams(search));

describe('readPlantQuery', () => {
  it('uses the defaults for an empty URL', () => {
    expect(read('')).toEqual({ sort: 'name', page: 1, pageSize: 20 });
  });

  it('reads every filter, including a repeated status', () => {
    expect(
      read(`q=cat&status=ACTIVE&status=REPAIR&siteId=${siteId}&sort=nextInspectionAt&page=3`),
    ).toEqual({
      q: 'cat',
      status: ['ACTIVE', 'REPAIR'],
      siteId,
      sort: 'nextInspectionAt',
      page: 3,
      pageSize: 20,
    });
  });

  it('drops only the broken values and keeps the rest', () => {
    expect(read('q=cat&page=abc&status=BROKEN&sort=passwordHash&siteId=x')).toEqual({
      q: 'cat',
      sort: 'name',
      page: 1,
      pageSize: 20,
    });
  });

  it('treats a blank search as no search', () => {
    expect(read('q=%20%20').q).toBeUndefined();
  });
});

describe('plantQueryToParams', () => {
  it('leaves defaults out of the URL', () => {
    expect(plantQueryToParams(defaultPlantQuery).toString()).toBe('');
  });

  it('round-trips through readPlantQuery', () => {
    const query = read(`q=lift&status=REPAIR&status=INACTIVE&siteId=${siteId}&page=2&pageSize=50`);

    expect(readPlantQuery(plantQueryToParams(query))).toEqual(query);
  });
});

describe('hasFilters', () => {
  it.each([
    ['', false],
    ['sort=nextInspectionAt&page=2', false],
    ['q=cat', true],
    ['status=REPAIR', true],
    [`siteId=${siteId}`, true],
  ])('%s → %s', (search, expected) => {
    expect(hasFilters(read(search))).toBe(expected);
  });
});
