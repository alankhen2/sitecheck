import type { ListPlantsQuery, Plant } from '@sitecheck/shared';

/**
 * Cache keys for plant data. Everything starts with 'plants', so a change
 * (add, edit, delete) can refresh every plant list at once with
 * invalidateQueries({ queryKey: plantKeys.all }).
 *
 * Kept apart from queries.ts so that sites and plants can each refresh the
 * other's data without their query modules importing each other.
 */
export const plantKeys = {
  all: ['plants'] as const,
  list: (query: ListPlantsQuery) => ['plants', 'list', query] as const,
  detail: (id: Plant['id']) => ['plants', 'detail', id] as const,
  inspections: (id: Plant['id'], page: number) =>
    ['plants', 'detail', id, 'inspections', page] as const,
};
