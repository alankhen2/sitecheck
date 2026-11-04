/**
 * Demo data: 3 users, 3 sites, 15 plants, 7 inspections.
 * Idempotent: rows are upserted by a stable key (email, fixed id, serial
 * number), so running it again resets the demo values without duplicating or
 * deleting anything else.
 *
 * Run with: pnpm --filter @sitecheck/api db:seed
 */
import { CHECKLIST_ITEMS } from '@sitecheck/shared';
import { prisma } from './db.js';
import { hashPassword } from './lib/password.js';
import { seedPasswords } from './lib/seed-passwords.js';
import type { PlantStatus, Role } from './generated/prisma/client.js';

const DAY = 24 * 60 * 60 * 1000;
/** A date `days` from now (negative = in the past), so "due this week" always has data. */
const inDays = (days: number) => new Date(Date.now() + days * DAY);

const users: { name: string; email: string; role: Role }[] = [
  { name: 'Alex Admin', email: 'admin@sitecheck.dev', role: 'ADMIN' },
  { name: 'Ivy Inspector', email: 'inspector@sitecheck.dev', role: 'INSPECTOR' },
  { name: 'Demo Viewer', email: 'demo@sitecheck.dev', role: 'VIEWER' },
];

const sites = [
  {
    id: '019a0000-0000-7000-8000-000000000001',
    name: 'Westgate Quarry',
    address: '120 Quarry Rd, Geelong VIC 3220',
    isActive: true,
  },
  {
    id: '019a0000-0000-7000-8000-000000000002',
    name: 'Port Botany Terminal 3',
    address: '1 Friendship Rd, Port Botany NSW 2036',
    isActive: true,
  },
  {
    id: '019a0000-0000-7000-8000-000000000003',
    name: 'Kwinana Laydown Yard',
    address: '45 Patterson Rd, Kwinana Beach WA 6167',
    isActive: false,
  },
] as const;

type SiteId = (typeof sites)[number]['id'];

const plants: {
  siteId: SiteId;
  name: string;
  type: string;
  serialNumber: string;
  status: PlantStatus;
  nextInspectionAt: Date | null;
}[] = [
  // Westgate Quarry
  {
    siteId: sites[0].id,
    name: 'CAT 336 Excavator',
    type: 'Excavator',
    serialNumber: 'WGQ-EX-001',
    status: 'ACTIVE',
    nextInspectionAt: inDays(2),
  },
  {
    siteId: sites[0].id,
    name: 'Komatsu WA480 Loader',
    type: 'Wheel loader',
    serialNumber: 'WGQ-WL-002',
    status: 'ACTIVE',
    nextInspectionAt: inDays(5),
  },
  {
    siteId: sites[0].id,
    name: 'Volvo A40G Dump Truck',
    type: 'Articulated truck',
    serialNumber: 'WGQ-DT-003',
    status: 'REPAIR',
    nextInspectionAt: inDays(-3),
  },
  {
    siteId: sites[0].id,
    name: 'Terex Jaw Crusher J-1175',
    type: 'Crusher',
    serialNumber: 'WGQ-CR-004',
    status: 'ACTIVE',
    nextInspectionAt: inDays(21),
  },
  {
    siteId: sites[0].id,
    name: 'Atlas Copco XAS 185 Compressor',
    type: 'Compressor',
    serialNumber: 'WGQ-AC-005',
    status: 'ACTIVE',
    nextInspectionAt: inDays(-1),
  },
  {
    siteId: sites[0].id,
    name: 'Water Cart 15kL',
    type: 'Water truck',
    serialNumber: 'WGQ-WC-006',
    status: 'INACTIVE',
    nextInspectionAt: null,
  },
  // Port Botany Terminal 3
  {
    siteId: sites[1].id,
    name: 'Liebherr LHM 550 Mobile Crane',
    type: 'Crane',
    serialNumber: 'PBT-CR-001',
    status: 'ACTIVE',
    nextInspectionAt: inDays(4),
  },
  {
    siteId: sites[1].id,
    name: 'Kalmar DRG450 Reach Stacker',
    type: 'Reach stacker',
    serialNumber: 'PBT-RS-002',
    status: 'ACTIVE',
    nextInspectionAt: inDays(12),
  },
  {
    siteId: sites[1].id,
    name: 'Toyota 8FG25 Forklift',
    type: 'Forklift',
    serialNumber: 'PBT-FL-003',
    status: 'ACTIVE',
    nextInspectionAt: inDays(6),
  },
  {
    siteId: sites[1].id,
    name: 'Toyota 8FG25 Forklift #2',
    type: 'Forklift',
    serialNumber: 'PBT-FL-004',
    status: 'REPAIR',
    nextInspectionAt: inDays(-7),
  },
  {
    siteId: sites[1].id,
    name: 'Genie GS-3246 Scissor Lift',
    type: 'Elevating work platform',
    serialNumber: 'PBT-SL-005',
    status: 'ACTIVE',
    nextInspectionAt: inDays(30),
  },
  {
    siteId: sites[1].id,
    name: 'Cummins C150 Generator',
    type: 'Generator',
    serialNumber: 'PBT-GN-006',
    status: 'ACTIVE',
    nextInspectionAt: inDays(1),
  },
  // Kwinana Laydown Yard (inactive site)
  {
    siteId: sites[2].id,
    name: 'Franna MAC 25 Pick-and-carry',
    type: 'Crane',
    serialNumber: 'KLY-CR-001',
    status: 'INACTIVE',
    nextInspectionAt: null,
  },
  {
    siteId: sites[2].id,
    name: 'JLG 600S Boom Lift',
    type: 'Elevating work platform',
    serialNumber: 'KLY-BL-002',
    status: 'INACTIVE',
    nextInspectionAt: null,
  },
  {
    siteId: sites[2].id,
    name: 'Hino 500 Tipper',
    type: 'Truck',
    serialNumber: 'KLY-TT-003',
    status: 'REPAIR',
    nextInspectionAt: inDays(-14),
  },
];

/**
 * Past inspections, written straight to the tables, so their effects are not
 * applied: the dates and statuses of `plants` above must already agree with them.
 * A pass was 30 days before the plant's next date; a fail left the date alone.
 */
const inspections: {
  id: string;
  serialNumber: string;
  daysAgo: number;
  notes: string | null;
  failed?: Partial<Record<(typeof CHECKLIST_ITEMS)[number], string>>;
}[] = [
  {
    id: '019a0000-0000-7000-8000-000000000101',
    serialNumber: 'WGQ-EX-001',
    daysAgo: 28,
    notes: null,
  },
  {
    id: '019a0000-0000-7000-8000-000000000102',
    serialNumber: 'PBT-CR-001',
    daysAgo: 26,
    notes: 'Annual service was done the week before.',
  },
  {
    id: '019a0000-0000-7000-8000-000000000103',
    serialNumber: 'PBT-RS-002',
    daysAgo: 18,
    notes: null,
  },
  {
    id: '019a0000-0000-7000-8000-000000000104',
    serialNumber: 'PBT-FL-004',
    daysAgo: 37,
    notes: null,
  },
  {
    id: '019a0000-0000-7000-8000-000000000105',
    serialNumber: 'PBT-FL-004',
    daysAgo: 2,
    notes: 'Tagged out until the brakes are repaired.',
    failed: { 'Brakes and controls': 'Parking brake does not hold on a slope.' },
  },
  {
    id: '019a0000-0000-7000-8000-000000000106',
    serialNumber: 'KLY-TT-003',
    daysAgo: 44,
    notes: null,
  },
  {
    id: '019a0000-0000-7000-8000-000000000107',
    serialNumber: 'KLY-TT-003',
    daysAgo: 3,
    notes: null,
    failed: {
      'Fluid levels and leaks': 'Hydraulic oil leak at the tipper ram.',
      'Lights and alarms': 'Reversing alarm is silent.',
    },
  },
];

async function main() {
  const passwords = seedPasswords(process.env);

  for (const user of users) {
    // Hash per user: each gets its own random salt, so equal passwords
    // never produce equal hashes in the database.
    const passwordHash = await hashPassword(
      user.role === 'VIEWER' ? passwords.demo : passwords.staff,
    );
    await prisma.user.upsert({
      where: { email: user.email },
      create: { ...user, passwordHash },
      update: { name: user.name, role: user.role, passwordHash },
    });
  }

  for (const { id, ...data } of sites) {
    await prisma.site.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  for (const plant of plants) {
    const { serialNumber, ...data } = plant;
    await prisma.plant.upsert({ where: { serialNumber }, create: plant, update: data });
  }

  const inspector = await prisma.user.findUniqueOrThrow({
    where: { email: 'inspector@sitecheck.dev' },
    select: { id: true },
  });
  for (const { id, serialNumber, daysAgo, notes, failed = {} } of inspections) {
    const plant = await prisma.plant.findUniqueOrThrow({
      where: { serialNumber },
      select: { id: true },
    });
    const items = CHECKLIST_ITEMS.map((label, position) => {
      const comment = failed[label] ?? null;
      return { position, label, passed: comment === null, comment };
    });
    const data = {
      plantId: plant.id,
      inspectorId: inspector.id,
      result: items.every((item) => item.passed) ? ('PASS' as const) : ('FAIL' as const),
      notes,
      inspectedAt: inDays(-daysAgo),
    };
    await prisma.inspection.upsert({
      where: { id },
      create: { id, ...data, items: { create: items } },
      update: { ...data, items: { deleteMany: {}, create: items } },
    });
  }

  const [userCount, siteCount, plantCount, inspectionCount] = await Promise.all([
    prisma.user.count(),
    prisma.site.count(),
    prisma.plant.count(),
    prisma.inspection.count(),
  ]);
  console.log(
    `Seeded: ${String(userCount)} users, ${String(siteCount)} sites, ${String(plantCount)} plants, ${String(inspectionCount)} inspections`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
