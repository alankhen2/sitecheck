import { randomUUID } from 'node:crypto';
import {
  EmailTakenError,
  type NewUser,
  type UserRecord,
  type UserRepository,
} from '../services/auth.service.js';
import { InvalidReferenceError, NotFoundError } from '../services/errors.js';
import {
  PlantInactiveError,
  type InspectionRecord,
  type InspectionRepository,
} from '../services/inspections.service.js';
import {
  PlantHasInspectionsError,
  SerialNumberTakenError,
  type PlantRecord,
  type PlantRepository,
} from '../services/plants.service.js';
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

/**
 * In-memory PlantRepository on top of a fake site store. It keeps each site's
 * plantCount and the plant's siteName in step, like the database's join and count.
 * `inspectionCounts` stands in for the inspections table (plant id -> count).
 */
export function fakePlants(
  sites: { rows: SiteRecord[] },
  initial: PlantRecord[] = [],
  inspectionCounts: Record<string, number> = {},
): PlantRepository & { rows: PlantRecord[] } {
  const rows = initial.map(copy);
  const find = (id: string) => rows.find((p) => p.id === id);
  const site = (id: string) => sites.rows.find((s) => s.id === id);
  const bump = (siteId: string, by: number) => {
    const s = site(siteId);
    if (s) s.plantCount += by;
  };
  const serialTaken = (serial: string, exceptId?: string) =>
    rows.some((p) => p.serialNumber === serial && p.id !== exceptId);

  return {
    rows,
    search: ({ q, status, siteId, sort, skip, take }) => {
      const needle = q?.toLowerCase();
      const matches = rows.filter(
        (p) =>
          (siteId === undefined || p.siteId === siteId) &&
          (status === undefined || status.includes(p.status)) &&
          (needle === undefined ||
            [p.name, p.type, p.serialNumber].some((v) => v.toLowerCase().includes(needle))),
      );
      // Same order as the database: the chosen key, then name, then id as a tie-breaker.
      const byId = (a: PlantRecord, b: PlantRecord) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const byName = (a: PlantRecord, b: PlantRecord) => a.name.localeCompare(b.name) || byId(a, b);
      const time = (p: PlantRecord) => p.nextInspectionAt?.getTime() ?? Number.POSITIVE_INFINITY;
      matches.sort(sort === 'name' ? byName : (a, b) => time(a) - time(b) || byName(a, b));
      return Promise.resolve({
        rows: matches.slice(skip, skip + take).map(copy),
        total: matches.length,
      });
    },
    findById: (id) => {
      const plant = find(id);
      return Promise.resolve(plant ? copy(plant) : null);
    },
    findBySerialNumber: (serial) => {
      const plant = rows.find((p) => p.serialNumber === serial);
      return Promise.resolve(plant ? copy(plant) : null);
    },
    countInspections: (id) => Promise.resolve(inspectionCounts[id] ?? 0),
    create: (data) => {
      const s = site(data.siteId);
      if (!s) return Promise.reject(new InvalidReferenceError('Site does not exist'));
      if (serialTaken(data.serialNumber)) return Promise.reject(new SerialNumberTakenError());
      const now = new Date();
      const plant = { ...data, id: randomUUID(), siteName: s.name, createdAt: now, updatedAt: now };
      rows.push(plant);
      bump(plant.siteId, 1);
      return Promise.resolve(copy(plant));
    },
    update: (id, changes) => {
      const plant = find(id);
      if (!plant) return Promise.reject(new NotFoundError('Plant'));
      if (changes.serialNumber !== undefined && serialTaken(changes.serialNumber, id)) {
        return Promise.reject(new SerialNumberTakenError());
      }
      if (changes.siteId !== undefined && changes.siteId !== plant.siteId) {
        const target = site(changes.siteId);
        if (!target) return Promise.reject(new InvalidReferenceError('Site does not exist'));
        bump(plant.siteId, -1);
        bump(target.id, 1);
        plant.siteName = target.name;
      }
      Object.assign(plant, changes, { updatedAt: new Date() });
      return Promise.resolve(copy(plant));
    },
    delete: (id) => {
      const index = rows.findIndex((p) => p.id === id);
      const plant = rows[index];
      if (!plant) return Promise.reject(new NotFoundError('Plant'));
      if ((inspectionCounts[id] ?? 0) > 0) return Promise.reject(new PlantHasInspectionsError());
      rows.splice(index, 1);
      bump(plant.siteId, -1);
      return Promise.resolve();
    },
  };
}

/**
 * In-memory InspectionRepository on top of the fake plant store. `inspectionCounts`
 * is the same object fakePlants reads, so a recorded inspection blocks deleting the plant.
 */
export function fakeInspections(
  plants: { rows: PlantRecord[] },
  users: UserRecord[],
  inspectionCounts: Record<string, number> = {},
): InspectionRepository & { rows: InspectionRecord[] } {
  const rows: InspectionRecord[] = [];
  return {
    rows,
    record: ({ plantId, inspectorId, result, notes, inspectedAt, items, plantChanges }) => {
      const plant = plants.rows.find((p) => p.id === plantId);
      if (!plant) return Promise.reject(new NotFoundError('Plant'));
      if (plant.status === 'INACTIVE') return Promise.reject(new PlantInactiveError());
      Object.assign(plant, plantChanges, { updatedAt: new Date() });
      inspectionCounts[plantId] = (inspectionCounts[plantId] ?? 0) + 1;
      const inspection: InspectionRecord = {
        id: randomUUID(),
        plantId,
        inspectorName: users.find((u) => u.id === inspectorId)?.name ?? 'Unknown',
        result,
        notes,
        inspectedAt,
        items: [...items]
          .sort((a, b) => a.position - b.position)
          .map(({ label, passed, comment }) => ({ label, passed, comment })),
      };
      rows.push(inspection);
      return Promise.resolve(inspection);
    },
    listForPlant: (plantId, { skip, take }) => {
      const matches = rows
        .filter((i) => i.plantId === plantId)
        .sort((a, b) => b.inspectedAt.getTime() - a.inspectedAt.getTime());
      return Promise.resolve({ rows: matches.slice(skip, skip + take), total: matches.length });
    },
  };
}

/** Both at testSites.quarry (plantCount 2). The excavator has inspection history in most tests. */
export const testPlants = {
  excavator: {
    id: '019a0000-0000-7000-8000-000000000601',
    siteId: testSites.quarry.id,
    siteName: testSites.quarry.name,
    name: 'CAT 336 Excavator',
    type: 'Excavator',
    serialNumber: 'WGQ-EX-001',
    status: 'ACTIVE',
    nextInspectionAt: day('2026-11-05'),
    createdAt: day('2026-10-01'),
    updatedAt: day('2026-10-01'),
  },
  loader: {
    id: '019a0000-0000-7000-8000-000000000602',
    siteId: testSites.quarry.id,
    siteName: testSites.quarry.name,
    name: 'CAT 980 Wheel Loader',
    type: 'Wheel loader',
    serialNumber: 'WGQ-WL-002',
    status: 'ACTIVE',
    nextInspectionAt: null,
    createdAt: day('2026-10-01'),
    updatedAt: day('2026-10-01'),
  },
} satisfies Record<string, PlantRecord>;

/**
 * A plant at testSites.quarry named "Plant NN", with an id that sorts by n.
 * Remember to set the site's plantCount when seeding several.
 */
export function plantAt(n: number, overrides: Partial<PlantRecord> = {}): PlantRecord {
  const nn = String(n).padStart(2, '0');
  return {
    ...testPlants.loader,
    id: `019a0000-0000-7000-8000-0000000007${nn}`,
    name: `Plant ${nn}`,
    serialNumber: `TEST-${nn}`,
    ...overrides,
  };
}
