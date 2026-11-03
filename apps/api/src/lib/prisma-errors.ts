import { Prisma } from '../generated/prisma/client.js';

/**
 * Prisma error codes the repositories translate into domain errors.
 * https://www.prisma.io/docs/orm/reference/error-reference
 */
export const PrismaCode = {
  /** Unique constraint failed (e.g. duplicate email or serial number). */
  UniqueViolation: 'P2002',
  /** Foreign key constraint failed (missing parent, or a Restrict delete). */
  ForeignKeyViolation: 'P2003',
  /** The record to update or delete does not exist. */
  RecordNotFound: 'P2025',
} as const;

export function isPrismaError(
  err: unknown,
  code: (typeof PrismaCode)[keyof typeof PrismaCode],
): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}
