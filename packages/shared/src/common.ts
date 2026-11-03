import { z } from 'zod';

/** `:id` route params. A malformed id is a 400, not a database error. */
export const idParamsSchema = z.object({ id: z.uuid() });
export type IdParams = z.infer<typeof idParamsSchema>;

/** Dates travel as ISO 8601 strings in JSON; the api converts them from `Date`. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/** Upper bound for `pageSize`, so one request cannot ask for the whole table. */
export const MAX_PAGE_SIZE = 100;

/** `page` and `pageSize` query params. Query strings are text, so they are coerced. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});

/** Response envelope for a page of `item`s. `totalPages` is 0 when nothing matches. */
export const paginatedSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  });

/** For PATCH bodies: an empty object would be a request that changes nothing. */
export const atLeastOneField = (body: object) => Object.keys(body).length > 0;
export const atLeastOneFieldMessage = 'Provide at least one field to change';
