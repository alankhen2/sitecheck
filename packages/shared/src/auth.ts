import { z } from 'zod';

/** Mirrors the Prisma `Role` enum; the api typechecks that the two stay in sync. */
export const roleSchema = z.enum(['ADMIN', 'INSPECTOR']);
export type Role = z.infer<typeof roleSchema>;

// Normalise before validating, so "  Ivy@Example.com " and "ivy@example.com"
// are the same account.
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

// NIST SP 800-63B: length matters more than character rules. The upper bound
// stops someone from sending a huge string to make scrypt do extra work.
const newPasswordSchema = z.string().min(12).max(128);

export const registerBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: newPasswordSchema,
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

// Login does not enforce the minimum length: a wrong password should get the
// same "invalid credentials" answer, not a validation error that hints at the rules.
export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

/** What the api ever sends about a user. Never includes the password hash. */
export const publicUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
});
export type PublicUser = z.infer<typeof publicUserSchema>;

/**
 * Stable names for the errors a client may want to react to differently. The
 * message is for people and may be reworded; the code is for programs (e.g.
 * the web app shows SERIAL_NUMBER_TAKEN on the serial number field).
 */
export const errorCodeSchema = z.enum([
  'SERIAL_NUMBER_TAKEN',
  'SITE_INACTIVE',
  'SITE_HAS_PLANTS',
  'PLANT_HAS_INSPECTIONS',
  'PLANT_INACTIVE',
  'RATE_LIMITED',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorResponseSchema = z.object({
  message: z.string(),
  code: errorCodeSchema.optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
