import {
  CHECKLIST_ITEMS,
  type CreateInspectionBody,
  type Inspection,
  type InspectionItem,
  type InspectionPage,
  type InspectionResult,
  type ListInspectionsQuery,
  type PlantStatus,
} from '@sitecheck/shared';
import { ConflictError, NotFoundError } from './errors.js';
import type { PlantRepository } from './plants.service.js';

const DAYS_BETWEEN_INSPECTIONS = 30;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface InspectionRecord {
  id: string;
  plantId: string;
  /** Joined from the user, so a list does not need a second request per row. */
  inspectorName: string;
  result: InspectionResult;
  notes: string | null;
  inspectedAt: Date;
  /** In checklist order. */
  items: InspectionItem[];
}

export interface NewInspection {
  plantId: string;
  inspectorId: string;
  result: InspectionResult;
  notes: string | null;
  inspectedAt: Date;
  items: (InspectionItem & { position: number })[];
  /** What this inspection does to the plant. Saved together with the inspection. */
  plantChanges: { status: PlantStatus; nextInspectionAt?: Date };
}

export interface InspectionRepository {
  /**
   * Saves the inspection and the plant changes in one transaction: both or
   * neither. Throws NotFoundError if the plant is gone, or PlantInactiveError if
   * it was marked inactive after the service's check.
   */
  record(data: NewInspection): Promise<InspectionRecord>;
  /** Newest first, plus the total count, read from the same snapshot. */
  listForPlant(
    plantId: string,
    page: { skip: number; take: number },
  ): Promise<{ rows: InspectionRecord[]; total: number }>;
}

export class PlantInactiveError extends ConflictError {
  constructor() {
    super('This plant is inactive, so it cannot be inspected', 'PLANT_INACTIVE');
    this.name = 'PlantInactiveError';
  }
}

function toInspection(record: InspectionRecord): Inspection {
  return {
    id: record.id,
    plantId: record.plantId,
    inspectorName: record.inspectorName,
    result: record.result,
    notes: record.notes,
    inspectedAt: record.inspectedAt.toISOString(),
    items: record.items,
  };
}

/** Failing leaves the schedule alone, so the plant keeps showing as due until it passes. */
function effectOnPlant(result: InspectionResult, inspectedAt: Date): NewInspection['plantChanges'] {
  if (result === 'FAIL') return { status: 'REPAIR' };
  return {
    status: 'ACTIVE',
    nextInspectionAt: new Date(inspectedAt.getTime() + DAYS_BETWEEN_INSPECTIONS * DAY_IN_MS),
  };
}

export interface InspectionServiceDeps {
  inspections: InspectionRepository;
  plants: Pick<PlantRepository, 'findById'>;
  /** The clock, so tests can fix the date an inspection is made. */
  now?: () => Date;
}

export function createInspectionService({
  inspections,
  plants,
  now = () => new Date(),
}: InspectionServiceDeps) {
  return {
    async record(
      plantId: string,
      inspectorId: string,
      body: CreateInspectionBody,
    ): Promise<Inspection> {
      const plant = await plants.findById(plantId);
      if (!plant) throw new NotFoundError('Plant');
      if (plant.status === 'INACTIVE') throw new PlantInactiveError();

      const result: InspectionResult = body.items.every((item) => item.passed) ? 'PASS' : 'FAIL';
      const inspectedAt = now();
      const record = await inspections.record({
        plantId,
        inspectorId,
        result,
        notes: body.notes,
        inspectedAt,
        items: body.items.map((item) => ({
          ...item,
          position: CHECKLIST_ITEMS.indexOf(item.label),
        })),
        plantChanges: effectOnPlant(result, inspectedAt),
      });
      return toInspection(record);
    },

    async listForPlant(plantId: string, query: ListInspectionsQuery): Promise<InspectionPage> {
      if (!(await plants.findById(plantId))) throw new NotFoundError('Plant');

      const { page, pageSize } = query;
      const { rows, total } = await inspections.listForPlant(plantId, {
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      return {
        items: rows.map(toInspection),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      };
    },
  };
}

export type InspectionService = ReturnType<typeof createInspectionService>;
