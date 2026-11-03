import type { Plant, Site } from '@sitecheck/shared';
import { http, HttpResponse } from 'msw';
import { apiUrl } from './server';

export const testSites: Site[] = [
  {
    id: '019a0000-0000-7000-8000-000000000002',
    name: 'Port Botany Terminal 3',
    address: '1 Friendship Rd, Port Botany NSW 2036',
    isActive: true,
    plantCount: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: '019a0000-0000-7000-8000-000000000001',
    name: 'Westgate Quarry',
    address: '120 Quarry Rd, Geelong VIC 3220',
    isActive: true,
    plantCount: 2,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
];

const [port, quarry] = testSites as [Site, Site];

let serial = 0;

/** A plant at the quarry; override what a test cares about. */
export function makePlant(overrides: Partial<Plant> = {}): Plant {
  serial += 1;
  const n = String(serial).padStart(4, '0');
  return {
    id: `019a0000-0000-7000-8000-00000000${n}`,
    siteId: quarry.id,
    siteName: quarry.name,
    name: `Plant ${n}`,
    type: 'Excavator',
    serialNumber: `TEST-${n}`,
    status: 'ACTIVE',
    nextInspectionAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

export const testPlants: Plant[] = [
  makePlant({
    name: 'CAT 336 Excavator',
    serialNumber: 'WGQ-EX-001',
    nextInspectionAt: '2099-01-10T00:00:00.000Z',
  }),
  makePlant({
    name: 'Komatsu WA480 Loader',
    type: 'Wheel loader',
    serialNumber: 'WGQ-WL-002',
    status: 'REPAIR',
    nextInspectionAt: '2020-01-01T00:00:00.000Z',
  }),
  makePlant({
    name: 'Kalmar Reach Stacker',
    type: 'Reach stacker',
    serialNumber: 'PBT-RS-001',
    siteId: port.id,
    siteName: port.name,
    status: 'INACTIVE',
  }),
];

/**
 * MSW handlers for GET /plants and GET /sites over in-memory data. /plants
 * filters, sorts and pages like the API does, so page tests exercise real
 * behaviour. Every /plants request URL is recorded in `requests`.
 */
export function dataHandlers(plants: Plant[] = testPlants, sites: Site[] = testSites) {
  const requests: URL[] = [];

  const plantsHandler = http.get(apiUrl('/plants'), ({ request }) => {
    const url = new URL(request.url);
    requests.push(url);
    const params = url.searchParams;
    const q = params.get('q')?.toLowerCase();
    const statuses = params.getAll('status');
    const siteId = params.get('siteId');
    const page = Number(params.get('page') ?? 1);
    const pageSize = Number(params.get('pageSize') ?? 20);

    const matches = plants
      .filter(
        (p) => !q || [p.name, p.type, p.serialNumber].some((v) => v.toLowerCase().includes(q)),
      )
      .filter((p) => statuses.length === 0 || statuses.includes(p.status))
      .filter((p) => !siteId || p.siteId === siteId)
      .sort((a, b) => {
        if (params.get('sort') === 'nextInspectionAt') {
          const time = (p: Plant) =>
            p.nextInspectionAt ? Date.parse(p.nextInspectionAt) : Number.POSITIVE_INFINITY;
          return time(a) - time(b) || a.name.localeCompare(b.name);
        }
        return a.name.localeCompare(b.name);
      });

    return HttpResponse.json({
      items: matches.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: matches.length,
      totalPages: Math.ceil(matches.length / pageSize),
    });
  });

  const sitesHandler = http.get(apiUrl('/sites'), () => HttpResponse.json(sites));

  return {
    plants: plantsHandler,
    sites: sitesHandler,
    handlers: [plantsHandler, sitesHandler],
    requests,
  };
}
