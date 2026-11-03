export type DefinedOnly<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/**
 * Drops keys whose value is undefined. A Zod `.partial()` body is typed
 * `{ name?: string | undefined }`, but with `exactOptionalPropertyTypes` Prisma's
 * update input only accepts `{ name?: string }`. This bridges the two and makes
 * sure "not sent" never turns into "set to undefined".
 */
export function definedOnly<T extends object>(obj: T): DefinedOnly<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as DefinedOnly<T>;
}
