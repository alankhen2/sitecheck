import type { Role } from '@sitecheck/shared';
import { Prisma, type PrismaClient, type Role as DbRole } from '../generated/prisma/client.js';
import type { Assert, Same } from '../lib/types.js';
import { EmailTakenError, type UserRepository } from '../services/auth.service.js';

// Compile-time check that the shared Zod role enum and the Prisma enum have the
// same values. If someone adds a role to only one of them, typecheck fails here.
export type RolesMatch = Assert<Same<Role, DbRole>>;

// Only the columns the auth rules use; nothing else is read.
const select = { id: true, name: true, email: true, role: true, passwordHash: true } as const;

export function createUserRepository(prisma: PrismaClient): UserRepository {
  return {
    findByEmail: (email) => prisma.user.findUnique({ where: { email }, select }),
    findById: (id) => prisma.user.findUnique({ where: { id }, select }),
    async create(data) {
      try {
        return await prisma.user.create({ data, select });
      } catch (err) {
        // P2002 = unique constraint violation (two registrations raced on the same email).
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new EmailTakenError();
        }
        throw err;
      }
    },
  };
}
