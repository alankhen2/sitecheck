import type { CreateSiteBody, Site, UpdateSiteBody } from '@sitecheck/shared';
import { definedOnly } from '../lib/object.js';
import { ConflictError, NotFoundError } from './errors.js';

export interface SiteRecord {
  id: string;
  name: string;
  address: string;
  isActive: boolean;
  plantCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type NewSite = Pick<SiteRecord, 'name' | 'address' | 'isActive'>;
export type SiteChanges = Partial<NewSite>;

export interface SiteRepository {
  /** Sorted by name. */
  list(): Promise<SiteRecord[]>;
  findById(id: string): Promise<SiteRecord | null>;
  create(data: NewSite): Promise<SiteRecord>;
  /** Throws NotFoundError if the site was deleted in the meantime. */
  update(id: string, changes: SiteChanges): Promise<SiteRecord>;
  /** Throws NotFoundError if already gone, SiteHasPlantsError if plants were added meanwhile. */
  delete(id: string): Promise<void>;
}

export class SiteHasPlantsError extends ConflictError {
  constructor() {
    super('Site still has plants; move or delete them first');
    this.name = 'SiteHasPlantsError';
  }
}

function toSite(record: SiteRecord): Site {
  return {
    id: record.id,
    name: record.name,
    address: record.address,
    isActive: record.isActive,
    plantCount: record.plantCount,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function createSiteService({ sites }: { sites: SiteRepository }) {
  async function findOrThrow(id: string): Promise<SiteRecord> {
    const site = await sites.findById(id);
    if (!site) throw new NotFoundError('Site');
    return site;
  }

  return {
    async list(): Promise<Site[]> {
      return (await sites.list()).map(toSite);
    },

    async get(id: string): Promise<Site> {
      return toSite(await findOrThrow(id));
    },

    async create(input: CreateSiteBody): Promise<Site> {
      return toSite(await sites.create(input));
    },

    async update(id: string, input: UpdateSiteBody): Promise<Site> {
      await findOrThrow(id);
      return toSite(await sites.update(id, definedOnly(input)));
    },

    async remove(id: string): Promise<void> {
      const site = await findOrThrow(id);
      // Checked here for a clear message; the foreign key (onDelete: Restrict)
      // still blocks it if a plant is added between this check and the delete.
      if (site.plantCount > 0) throw new SiteHasPlantsError();
      await sites.delete(id);
    },
  };
}

export type SiteService = ReturnType<typeof createSiteService>;
