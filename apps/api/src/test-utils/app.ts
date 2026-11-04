import { buildApp } from '../app.js';
import { loadConfig, type Config } from '../config.js';
import { SESSION_COOKIE } from '../plugins/auth.js';
import { createAuditService } from '../services/audit.service.js';
import { createAuthService, type UserRecord } from '../services/auth.service.js';
import { createDashboardService } from '../services/dashboard.service.js';
import { createInspectionService } from '../services/inspections.service.js';
import { createPlantService, type PlantRecord } from '../services/plants.service.js';
import { createSiteService, type SiteRecord } from '../services/sites.service.js';
import {
  fakeAudit,
  fakeDashboard,
  fakeHashPassword,
  fakeInspections,
  fakePlants,
  fakeSites,
  fakeUsers,
  fakeVerifyPassword,
  testUsers,
} from './fakes.js';

export const testConfig = loadConfig({
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-that-is-at-least-32-chars',
});

/** Plain-text passwords of `testUsers` (their hashes are `hashed:<password>`). */
export const testPasswords = {
  admin: 'admin password 123',
  inspector: 'correct horse battery',
} as const;

interface Seed {
  users?: UserRecord[];
  sites?: SiteRecord[];
  plants?: PlantRecord[];
  /** plant id -> number of inspections */
  inspectionCounts?: Record<string, number>;
  config?: Config;
}

/** The full app (plugins, routes, schemas, error handler) on in-memory repositories. */
export async function buildTestApp(seed: Seed = {}) {
  const users = fakeUsers(seed.users ?? [testUsers.admin, testUsers.inspector]);
  const sites = fakeSites(seed.sites ?? []);
  // One object: recording an inspection is what later blocks deleting the plant.
  const inspectionCounts = { ...seed.inspectionCounts };
  const audit = fakeAudit(users.rows);
  const plants = fakePlants(sites, seed.plants ?? [], inspectionCounts, audit);
  const inspections = fakeInspections(plants, users.rows, inspectionCounts, audit);
  const app = await buildApp({
    config: seed.config ?? testConfig,
    auth: createAuthService({
      users,
      hashPassword: fakeHashPassword,
      verifyPassword: fakeVerifyPassword,
    }),
    sites: createSiteService({ sites }),
    plants: createPlantService({ plants, sites }),
    inspections: createInspectionService({ inspections, plants }),
    audit: createAuditService({ audit, plants }),
    dashboard: createDashboardService({ dashboard: fakeDashboard(plants) }),
  });
  return { app, users, sites, plants, inspections, audit };
}

export type TestApp = Awaited<ReturnType<typeof buildTestApp>>['app'];

/** Logs in through the real endpoint and returns the session token. */
export async function loginWith(app: TestApp, email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error(`login failed: ${String(res.statusCode)} ${res.body}`);
  return cookie.value;
}

export const loginAs = (app: TestApp, who: keyof typeof testPasswords) =>
  loginWith(app, testUsers[who].email, testPasswords[who]);

/** `cookies` option for app.inject. */
export const withSession = (token: string) => ({ [SESSION_COOKIE]: token });
