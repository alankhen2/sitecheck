import { randomUUID } from 'node:crypto';
import {
  EmailTakenError,
  type NewUser,
  type UserRecord,
  type UserRepository,
} from '../services/auth.service.js';
import { NotFoundError } from '../services/errors.js';
import {
  SiteHasPlantsError,
  type SiteRecord,
  type SiteRepository,
} from '../services/sites.service.js';

// Fakes return copies, like a database would, so a test cannot pass by
// accidentally mutating a row the service handed back.
const copy = <T extends object>(row: T): T => ({ ...row });

/** In-memory SiteRepository. `plantCount` is stored on the row. */
export function fakeSites(initial: SiteRecord[] = []): SiteRepository & { rows: SiteRecord[] } {
  const rows = initial.map(copy);
  const find = (id: string) => rows.find((s) => s.id === id);
  return {
    rows,
    list: () => Promise.resolve([...rows].sort((a, b) => a.name.localeCompare(b.name)).map(copy)),
    findById: (id) => {
      const site = find(id);
      return Promise.resolve(site ? copy(site) : null);
    },
    create: (data) => {
      const now = new Date();
      const site = { ...data, id: randomUUID(), plantCount: 0, createdAt: now, updatedAt: now };
      rows.push(site);
      return Promise.resolve(copy(site));
    },
    update: (id, changes) => {
      const site = find(id);
      if (!site) return Promise.reject(new NotFoundError('Site'));
      Object.assign(site, changes, { updatedAt: new Date() });
      return Promise.resolve(copy(site));
    },
    delete: (id) => {
      const index = rows.findIndex((s) => s.id === id);
      const site = rows[index];
      if (!site) return Promise.reject(new NotFoundError('Site'));
      if (site.plantCount > 0) return Promise.reject(new SiteHasPlantsError());
      rows.splice(index, 1);
      return Promise.resolve();
    },
  };
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export const testSites = {
  quarry: {
    id: '019a0000-0000-7000-8000-000000000501',
    name: 'Westgate Quarry',
    address: '120 Quarry Rd, Geelong VIC 3220',
    isActive: true,
    plantCount: 2,
    createdAt: day('2026-10-01'),
    updatedAt: day('2026-10-01'),
  },
  emptyYard: {
    id: '019a0000-0000-7000-8000-000000000502',
    name: 'Empty Yard',
    address: '2 Spare St, Kwinana WA 6167',
    isActive: true,
    plantCount: 0,
    createdAt: day('2026-10-02'),
    updatedAt: day('2026-10-02'),
  },
  closedYard: {
    id: '019a0000-0000-7000-8000-000000000503',
    name: 'Closed Yard',
    address: '3 Old Rd, Port Botany NSW 2036',
    isActive: false,
    plantCount: 0,
    createdAt: day('2026-10-03'),
    updatedAt: day('2026-10-03'),
  },
} satisfies Record<string, SiteRecord>;

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
