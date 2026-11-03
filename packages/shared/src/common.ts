import { z } from 'zod';

/** `:id` route params. A malformed id is a 400, not a database error. */
export const idParamsSchema = z.object({ id: z.uuid() });
export type IdParams = z.infer<typeof idParamsSchema>;

/** Dates travel as ISO 8601 strings in JSON; the api converts them from `Date`. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/** For PATCH bodies: an empty object would be a request that changes nothing. */
export const atLeastOneField = (body: object) => Object.keys(body).length > 0;
export const atLeastOneFieldMessage = 'Provide at least one field to change';
