import type {
  CreatePlantBody,
  CreateSiteBody,
  ErrorCode,
  Plant,
  Site,
  UpdatePlantBody,
  UpdateSiteBody,
} from '@sitecheck/shared';
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

/** A write request the fake API received, for tests that check what was sent. */
export interface WriteRequest {
  method: string;
  path: string;
  body: unknown;
}

/**
 * MSW handlers over in-memory data that behave like the API: /plants filters,
 * sorts and pages; site writes change the data (a renamed site is renamed on
 * its plants too) and deleting a site that still has plants is a 409. Each
 * call starts from fresh copies, so one test's changes never leak into the
 * next. Every /plants request URL is recorded in `requests`, every write in
 * `writes`.
 */
export function dataHandlers(
  initialPlants: Plant[] = testPlants,
  initialSites: Site[] = testSites,
) {
  let plants = initialPlants.map((plant) => ({ ...plant }));
  let sites = initialSites.map((site) => ({ ...site }));
  const requests: URL[] = [];
  const writes: WriteRequest[] = [];
  let created = 0;

  const notFound = (entity: string) =>
    HttpResponse.json({ message: `${entity} not found` }, { status: 404 });
  const conflict = (message: string, code: ErrorCode) =>
    HttpResponse.json({ message, code }, { status: 409 });
  const countPlants = () => {
    for (const site of sites) site.plantCount = plants.filter((p) => p.siteId === site.id).length;
  };

  /** The API's plant rules: site exists and is active, serial number unique. */
  function checkPlant(body: UpdatePlantBody, current?: Plant) {
    if (body.siteId !== undefined && body.siteId !== current?.siteId) {
      const site = sites.find((s) => s.id === body.siteId);
      if (!site) return HttpResponse.json({ message: 'Site does not exist' }, { status: 400 });
      if (!site.isActive) {
        return conflict('Cannot place a plant at an inactive site', 'SITE_INACTIVE');
      }
    }
    const serial = body.serialNumber;
    if (serial !== undefined && plants.some((p) => p.serialNumber === serial && p !== current)) {
      return conflict('Serial number is already used by another plant', 'SERIAL_NUMBER_TAKEN');
    }
    return null;
  }

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

  const sitesHandler = http.get(apiUrl('/sites'), () =>
    HttpResponse.json([...sites].sort((a, b) => a.name.localeCompare(b.name))),
  );

  const createSite = http.post(apiUrl('/sites'), async ({ request }) => {
    const body = (await request.json()) as CreateSiteBody;
    writes.push({ method: 'POST', path: '/sites', body });
    created += 1;
    const site: Site = {
      id: `019a0000-0000-7000-8000-1000000000${String(created).padStart(2, '0')}`,
      ...body,
      plantCount: 0,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    sites = [...sites, site];
    return HttpResponse.json(site, { status: 201 });
  });

  const updateSite = http.patch(apiUrl('/sites/:id'), async ({ request, params }) => {
    const body = (await request.json()) as UpdateSiteBody;
    writes.push({ method: 'PATCH', path: `/sites/${String(params.id)}`, body });
    const site = sites.find((s) => s.id === params.id);
    if (!site) return notFound('Site');
    Object.assign(site, body);
    plants = plants.map((p) => (p.siteId === site.id ? { ...p, siteName: site.name } : p));
    return HttpResponse.json(site);
  });

  const deleteSite = http.delete(apiUrl('/sites/:id'), ({ params }) => {
    writes.push({ method: 'DELETE', path: `/sites/${String(params.id)}`, body: null });
    const site = sites.find((s) => s.id === params.id);
    if (!site) return notFound('Site');
    if (plants.some((p) => p.siteId === site.id)) {
      return HttpResponse.json(
        { message: 'Site still has plants; move or delete them first', code: 'SITE_HAS_PLANTS' },
        { status: 409 },
      );
    }
    sites = sites.filter((s) => s !== site);
    return new HttpResponse(null, { status: 204 });
  });

  const createPlant = http.post(apiUrl('/plants'), async ({ request }) => {
    const body = (await request.json()) as CreatePlantBody;
    writes.push({ method: 'POST', path: '/plants', body });
    const refused = checkPlant(body);
    if (refused) return refused;
    created += 1;
    const plant: Plant = {
      id: `019a0000-0000-7000-8000-2000000000${String(created).padStart(2, '0')}`,
      ...body,
      siteName: sites.find((s) => s.id === body.siteId)?.name ?? '',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    plants = [...plants, plant];
    countPlants();
    return HttpResponse.json(plant, { status: 201 });
  });

  const updatePlant = http.patch(apiUrl('/plants/:id'), async ({ request, params }) => {
    const body = (await request.json()) as UpdatePlantBody;
    writes.push({ method: 'PATCH', path: `/plants/${String(params.id)}`, body });
    const plant = plants.find((p) => p.id === params.id);
    if (!plant) return notFound('Plant');
    const refused = checkPlant(body, plant);
    if (refused) return refused;
    Object.assign(plant, body);
    plant.siteName = sites.find((s) => s.id === plant.siteId)?.name ?? '';
    countPlants();
    return HttpResponse.json(plant);
  });

  return {
    plants: plantsHandler,
    sites: sitesHandler,
    handlers: [
      plantsHandler,
      sitesHandler,
      createSite,
      updateSite,
      deleteSite,
      createPlant,
      updatePlant,
    ],
    requests,
    writes,
  };
}
