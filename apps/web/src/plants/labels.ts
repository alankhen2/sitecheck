import type { PlantStatus } from '@sitecheck/shared';

/** How each status is written on screen. */
export const statusLabel: Record<PlantStatus, string> = {
  ACTIVE: 'Active',
  REPAIR: 'Repair',
  INACTIVE: 'Inactive',
};
