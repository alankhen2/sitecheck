/**
 * Escapes LIKE wildcards so user input matches literally.
 *
 * Prisma's `contains` becomes `ILIKE '%' || $1 || '%'` with the value as a bound
 * parameter (so no SQL injection), but it does not escape `%` or `_` inside the
 * value: a search for "0%" would match every row containing "0". Postgres' default
 * LIKE escape character is the backslash, so it is escaped first.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
