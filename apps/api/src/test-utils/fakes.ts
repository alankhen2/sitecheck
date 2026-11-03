import {
  EmailTakenError,
  type NewUser,
  type UserRecord,
  type UserRepository,
} from '../services/auth.service.js';

/** In-memory UserRepository, so auth can be tested without a database. */
export function fakeUsers(initial: UserRecord[] = []): UserRepository & { rows: UserRecord[] } {
  const rows = [...initial];
  return {
    rows,
    findByEmail: (email) => Promise.resolve(rows.find((u) => u.email === email) ?? null),
    findById: (id) => Promise.resolve(rows.find((u) => u.id === id) ?? null),
    create: (data: NewUser) => {
      if (rows.some((u) => u.email === data.email)) return Promise.reject(new EmailTakenError());
      const suffix = String(rows.length + 1).padStart(12, '0');
      const user = { ...data, id: `019a0000-0000-7000-8000-${suffix}` };
      rows.push(user);
      return Promise.resolve(user);
    },
  };
}

// Fast stand-ins for scrypt; the real hashing has its own tests in lib/password.test.ts.
export const fakeHashPassword = (password: string) => Promise.resolve(`hashed:${password}`);
export const fakeVerifyPassword = (password: string, stored: string) =>
  Promise.resolve(stored === `hashed:${password}`);

export const testUsers = {
  admin: {
    id: '019a0000-0000-7000-8000-0000000000ad',
    name: 'Alex Admin',
    email: 'admin@sitecheck.dev',
    role: 'ADMIN',
    passwordHash: 'hashed:admin password 123',
  },
  inspector: {
    id: '019a0000-0000-7000-8000-0000000000aa',
    name: 'Ivy Inspector',
    email: 'ivy@sitecheck.dev',
    role: 'INSPECTOR',
    passwordHash: 'hashed:correct horse battery',
  },
} satisfies Record<string, UserRecord>;
