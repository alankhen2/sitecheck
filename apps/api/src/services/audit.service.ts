import type {
  AuditAction,
  AuditChanges,
  AuditEntity,
  AuditEntry,
  AuditPage,
  InspectionResult,
  ListAuditQuery,
} from '@sitecheck/shared';
import { NotFoundError } from './errors.js';
import type { PlantRecord, PlantRepository } from './plants.service.js';

/** The audited fields of a record, as text. */
export type AuditSnapshot = Record<string, string | null>;

/**
 * Field by field, what differs between two snapshots. `null` on one side means
 * the record did not exist: a new record lists what it holds, a deleted one what
 * it held. An empty result means nothing changed, and no entry should be written.
 */
export function changesBetween(
  before: AuditSnapshot | null,
  after: AuditSnapshot | null,
): AuditChanges {
  const changes: AuditChanges = {};
  for (const field of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    const from = before?.[field] ?? null;
    const to = after?.[field] ?? null;
    if (from !== to) changes[field] = { from, to };
  }
  return changes;
}

/**
 * The site is kept by name, not id: an audit entry must stay readable after the
 * site is renamed or deleted, and it should say what the site was called then.
 */
export function plantSnapshot(plant: PlantRecord): AuditSnapshot {
  return {
    name: plant.name,
    type: plant.type,
    serialNumber: plant.serialNumber,
    site: plant.siteName,
    status: plant.status,
    nextInspectionAt: plant.nextInspectionAt?.toISOString() ?? null,
  };
}

/** The inspection itself cannot change later, so its result is all the log needs. */
export function inspectionSnapshot(result: InspectionResult): AuditSnapshot {
  return { result };
}

export interface AuditRecord {
  id: string;
  entity: AuditEntity;
  entityId: string;
  action: AuditAction;
  actorName: string;
  changes: AuditChanges;
  createdAt: Date;
}

export interface AuditRepository {
  /** What happened to a plant and its inspections, newest first, plus the total count. */
  listForPlant(
    plantId: string,
    page: { skip: number; take: number },
  ): Promise<{ rows: AuditRecord[]; total: number }>;
}

function toEntry(record: AuditRecord): AuditEntry {
  return {
    id: record.id,
    entity: record.entity,
    entityId: record.entityId,
    action: record.action,
    actorName: record.actorName,
    changes: record.changes,
    createdAt: record.createdAt.toISOString(),
  };
}

export interface AuditServiceDeps {
  audit: AuditRepository;
  plants: Pick<PlantRepository, 'findById'>;
}

/**
 * Reading the log. Writing it is the repositories' job, because an entry must be
 * saved in the same transaction as the change it describes.
 */
export function createAuditService({ audit, plants }: AuditServiceDeps) {
  return {
    async historyForPlant(plantId: string, query: ListAuditQuery): Promise<AuditPage> {
      if (!(await plants.findById(plantId))) throw new NotFoundError('Plant');

      const { page, pageSize } = query;
      const { rows, total } = await audit.listForPlant(plantId, {
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      return {
        items: rows.map(toEntry),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      };
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;
