import { CHECKLIST_ITEMS } from '@sitecheck/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  agentFor,
  createPlant,
  createSite,
  prisma,
  resetDatabase,
  seedUsers,
  startApp,
} from './helpers.js';

/**
 * The access matrix: every protected endpoint, called anonymously, as an
 * inspector and as an admin, through real HTTP. One table, so a new endpoint
 * that forgets its guard shows up as a missing or failing row.
 */

const { app, http } = await startApp();

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

type Method = 'get' | 'post' | 'patch' | 'delete';
type Role = 'viewer' | 'inspector' | 'admin';
type Who = 'anonymous' | Role;

/** Each role can do everything the one before it can. */
const rank: Record<Role, number> = { viewer: 0, inspector: 1, admin: 2 };

interface Ids {
  siteId: string;
  emptySiteId: string;
  plantId: string;
}

interface Endpoint {
  method: Method;
  path: (ids: Ids) => string;
  body?: (ids: Ids) => object;
  /** The lowest role allowed. */
  allowed: Role;
}

let serial = 0;
const endpoints: Endpoint[] = [
  { method: 'get', path: () => '/auth/me', allowed: 'viewer' },
  { method: 'get', path: () => '/dashboard', allowed: 'viewer' },
  { method: 'get', path: () => '/sites', allowed: 'viewer' },
  { method: 'get', path: (ids) => `/sites/${ids.siteId}`, allowed: 'viewer' },
  {
    method: 'post',
    path: () => '/sites',
    body: () => ({ name: 'New', address: '1 Rd' }),
    allowed: 'admin',
  },
  {
    method: 'patch',
    path: (ids) => `/sites/${ids.siteId}`,
    body: () => ({ name: 'Renamed' }),
    allowed: 'admin',
  },
  { method: 'delete', path: (ids) => `/sites/${ids.emptySiteId}`, allowed: 'admin' },
  { method: 'get', path: () => '/plants', allowed: 'viewer' },
  { method: 'get', path: (ids) => `/plants/${ids.plantId}`, allowed: 'viewer' },
  {
    method: 'post',
    path: () => '/plants',
    body: (ids) => {
      serial += 1;
      return {
        siteId: ids.siteId,
        name: 'Lift',
        type: 'Forklift',
        serialNumber: `ACC-${String(serial)}`,
      };
    },
    allowed: 'inspector',
  },
  {
    method: 'patch',
    path: (ids) => `/plants/${ids.plantId}`,
    body: () => ({ status: 'REPAIR' }),
    allowed: 'inspector',
  },
  { method: 'delete', path: (ids) => `/plants/${ids.plantId}`, allowed: 'admin' },
  { method: 'get', path: (ids) => `/plants/${ids.plantId}/inspections`, allowed: 'viewer' },
  { method: 'get', path: (ids) => `/plants/${ids.plantId}/history`, allowed: 'viewer' },
  {
    method: 'post',
    path: (ids) => `/plants/${ids.plantId}/inspections`,
    body: () => ({ items: CHECKLIST_ITEMS.map((label) => ({ label, passed: true })) }),
    allowed: 'inspector',
  },
];

/** What each caller should get: 401 without a session, 403 below the allowed role. */
function expectedStatus(endpoint: Endpoint, who: Who): 'ok' | 401 | 403 {
  if (who === 'anonymous') return 401;
  return rank[who] < rank[endpoint.allowed] ? 403 : 'ok';
}

const cases = endpoints.flatMap((endpoint) =>
  (['anonymous', 'viewer', 'inspector', 'admin'] as const).map((who) => ({
    name: `${endpoint.method.toUpperCase()} ${endpoint.path({ siteId: ':id', emptySiteId: ':id', plantId: ':id' })} as ${who}`,
    endpoint,
    who,
  })),
);

describe('access matrix', () => {
  let ids: Ids;

  beforeEach(async () => {
    await resetDatabase();
    await seedUsers();
    const site = await createSite();
    const emptySite = await createSite({ name: 'Empty Yard' });
    const plant = await createPlant(site.id);
    ids = { siteId: site.id, emptySiteId: emptySite.id, plantId: plant.id };
  });

  it.each(cases)('$name', async ({ endpoint, who }) => {
    const client = who === 'anonymous' ? http : await agentFor(app, who);
    const path = endpoint.path(ids);
    let request = client[endpoint.method](path);
    if (endpoint.body) request = request.send(endpoint.body(ids));

    const res = await request;

    const expected = expectedStatus(endpoint, who);
    if (expected === 'ok') {
      expect(res.status, res.text).toBeLessThan(300);
    } else {
      expect(res.status).toBe(expected);
    }
  });

  // The promise made to the demo account. A write allowed to viewers by mistake
  // in the table above would fail here instead of quietly passing.
  it('lets a viewer only read', () => {
    const allowedToViewers = endpoints.filter((e) => e.allowed === 'viewer');

    expect(allowedToViewers.map((e) => e.method)).toEqual(allowedToViewers.map(() => 'get'));
    expect(allowedToViewers.length).toBeGreaterThan(0);
  });

  it('covers every route the app registers', () => {
    const tested = new Set(
      endpoints.map(
        (e) =>
          `${e.method.toUpperCase()} ${e.path({ siteId: ':id', emptySiteId: ':id', plantId: ':id' })}`,
      ),
    );
    const publicRoutes = new Set([
      'GET /health',
      'POST /auth/register',
      'POST /auth/login',
      'POST /auth/logout',
    ]);

    const registered = registeredRoutes(app.printRoutes({ commonPrefix: false }));

    const untested = registered.filter((r) => !tested.has(r) && !publicRoutes.has(r));
    expect(untested).toEqual([]);
  });
});

/**
 * Turns Fastify's route tree into "METHOD /full/path" strings. printRoutes draws
 * children indented under their parent ("/sites" then "/:id" one level deeper),
 * so the full path is the parent segments joined by depth.
 */
function registeredRoutes(tree: string): string[] {
  const parents: string[] = [];
  return tree.split('\n').flatMap((line) => {
    const match = /^([│├└─\s]*)(\S+?)(?: \(([A-Z, ]+)\))?$/.exec(line);
    if (!match) return [];
    const [, prefix = '', segment = '', methods] = match;
    const depth = Math.floor(prefix.length / 4);
    parents[depth] = segment;
    parents.length = depth + 1;
    if (!methods) return [];
    const url = parents.join('');
    return methods
      .split(', ')
      .filter((m) => m !== 'HEAD')
      .map((m) => `${m} ${url}`);
  });
}
