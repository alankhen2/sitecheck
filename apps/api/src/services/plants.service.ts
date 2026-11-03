import type {
  CreatePlantBody,
  ListPlantsQuery,
  Plant,
  PlantPage,
  PlantSort,
  PlantStatus,
  UpdatePlantBody,
} from '@sitecheck/shared';
import { definedOnly } from '../lib/object.js';
import { ConflictError, InvalidReferenceError, NotFoundError } from './errors.js';
import type { SiteRepository } from './sites.service.js';

export interface PlantRecord {
  id: string;
  siteId: string;
  /** Joined from the site, so lists do not need a second request per row. */
  siteName: string;
  name: string;
  type: string;
  serialNumber: string;
  status: PlantStatus;
  nextInspectionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewPlant = Pick<
  PlantRecord,
  'siteId' | 'name' | 'type' | 'serialNumber' | 'status' | 'nextInspectionAt'
>;
export type PlantChanges = Partial<NewPlant>;

export interface PlantSearch {
  /** Case-insensitive substring of name, type or serial number. */
  q?: string;
  /** Any of these statuses. */
  status?: PlantStatus[];
  siteId?: string;
  /** Always ends with `id` as a tie-breaker, so pages never overlap or skip rows. */
  sort: PlantSort;
  skip: number;
  take: number;
}

export interface PlantRepository {
  /** One page of matches plus the total count, read from the same snapshot. */
  search(criteria: PlantSearch): Promise<{ rows: PlantRecord[]; total: number }>;
  findById(id: string): Promise<PlantRecord | null>;
  findBySerialNumber(serialNumber: string): Promise<PlantRecord | null>;
  countInspections(id: string): Promise<number>;
  /** Throws SerialNumberTakenError or InvalidReferenceError (site gone) on a race. */
  create(data: NewPlant): Promise<PlantRecord>;
  /** Same errors as create, plus NotFoundError if the plant was deleted meanwhile. */
  update(id: string, changes: PlantChanges): Promise<PlantRecord>;
  /**
   * Deletes only if the plant has no inspections, in one statement, so an
   * inspection saved after the service's check cannot be cascade-deleted.
   * Throws NotFoundError or PlantHasInspectionsError.
   */
  delete(id: string): Promise<void>;
}

export class SerialNumberTakenError extends ConflictError {
  constructor() {
    super('Serial number is already used by another plant', 'SERIAL_NUMBER_TAKEN');
    this.name = 'SerialNumberTakenError';
  }
}

export class SiteInactiveError extends ConflictError {
  constructor() {
    super('Cannot place a plant at an inactive site', 'SITE_INACTIVE');
    this.name = 'SiteInactiveError';
  }
}

export class PlantHasInspectionsError extends ConflictError {
  constructor() {
    super(
      'Plant has inspection history; set its status to INACTIVE instead of deleting it',
      'PLANT_HAS_INSPECTIONS',
    );
    this.name = 'PlantHasInspectionsError';
  }
}

function toPlant(record: PlantRecord): Plant {
  return {
    id: record.id,
    siteId: record.siteId,
    siteName: record.siteName,
    name: record.name,
    type: record.type,
    serialNumber: record.serialNumber,
    status: record.status,
    nextInspectionAt: record.nextInspectionAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

const toDate = (iso: string | null) => (iso === null ? null : new Date(iso));

export interface PlantServiceDeps {
  plants: PlantRepository;
  sites: Pick<SiteRepository, 'findById'>;
}

export function createPlantService({ plants, sites }: PlantServiceDeps) {
  async function findOrThrow(id: string): Promise<PlantRecord> {
    const plant = await plants.findById(id);
    if (!plant) throw new NotFoundError('Plant');
    return plant;
  }

  /** A plant can only be added to, or moved to, a site that exists and is active. */
  async function assertSiteAcceptsPlants(siteId: string): Promise<void> {
    const site = await sites.findById(siteId);
    if (!site) throw new InvalidReferenceError('Site does not exist');
    if (!site.isActive) throw new SiteInactiveError();
  }

  async function assertSerialFree(serialNumber: string, exceptId?: string): Promise<void> {
    const owner = await plants.findBySerialNumber(serialNumber);
    if (owner && owner.id !== exceptId) throw new SerialNumberTakenError();
  }

  return {
    async list(query: ListPlantsQuery): Promise<PlantPage> {
      const { page, pageSize, sort, ...filters } = query;
      const { rows, total } = await plants.search({
        ...definedOnly(filters),
        sort,
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      return {
        items: rows.map(toPlant),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      };
    },

    async get(id: string): Promise<Plant> {
      return toPlant(await findOrThrow(id));
    },

    async create(input: CreatePlantBody): Promise<Plant> {
      await assertSiteAcceptsPlants(input.siteId);
      await assertSerialFree(input.serialNumber);
      const plant = await plants.create({
        ...input,
        nextInspectionAt: toDate(input.nextInspectionAt),
      });
      return toPlant(plant);
    },

    async update(id: string, input: UpdatePlantBody): Promise<Plant> {
      const current = await findOrThrow(id);
      const { nextInspectionAt, ...rest } = definedOnly(input);

      // Only a move is checked: editing a plant that already sits at an
      // inactive site (e.g. marking it INACTIVE) stays allowed.
      if (rest.siteId !== undefined && rest.siteId !== current.siteId) {
        await assertSiteAcceptsPlants(rest.siteId);
      }
      if (rest.serialNumber !== undefined) await assertSerialFree(rest.serialNumber, id);

      const changes: PlantChanges =
        nextInspectionAt === undefined
          ? rest
          : { ...rest, nextInspectionAt: toDate(nextInspectionAt) };
      return toPlant(await plants.update(id, changes));
    },

    async remove(id: string): Promise<void> {
      await findOrThrow(id);
      // Inspection history is compliance evidence: refuse rather than cascade.
      if ((await plants.countInspections(id)) > 0) throw new PlantHasInspectionsError();
      await plants.delete(id);
    },
  };
}

export type PlantService = ReturnType<typeof createPlantService>;
