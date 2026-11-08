# SiteCheck

Track work sites, the plant (heavy equipment) at each site, and their inspections.
Portfolio project: code quality and clear reasoning matter more than feature count.

## Layout

pnpm monorepo:

- `apps/web`: React 19 + TypeScript + Vite. Dev server proxies `/api/*` to the API.
- `apps/api`: Fastify 5 + TypeScript + Prisma 7 (PostgreSQL via `@prisma/adapter-pg`).
  - `src/app.ts`: `buildApp({ config, auth, sites, plants, inspections, audit, dashboard })` builds the app without listening; tests use `buildTestApp` from `src/test-utils/app.ts`. `src/server.ts` wires the real dependencies and listens.
  - Errors: services throw `DomainError` subclasses from `src/services/errors.ts` (404/409/400); the error handler in `app.ts` sends `{ message, code? }`. Unexpected errors get a generic 500 body (details only in the log).
  - `src/config.ts`: env parsed with Zod at startup (`JWT_SECRET` required, 32+ chars).
  - `src/db.ts` exports the single shared `prisma` client.
  - `src/lib/`: pure helpers (e.g. `password.ts`, scrypt hashing).
  - `src/services/`: business rules, depending on repository interfaces (not Prisma); must have unit tests.
  - `src/repositories/`: Prisma implementations of those interfaces; they map Prisma error codes (`src/lib/prisma-errors.ts`) to domain errors for check-then-write races.
  - Audit log: every plant and inspection write adds its `AuditLog` entry in the same transaction, in the repository, with the old values read under a row lock (`lockPlant`). Writes take the acting user's id.
  - `src/plugins/auth.ts`: JWT session cookie, `app.authenticate` (401) and `app.requireRole(...)` (401/403), used as `onRequest` hooks so auth runs before body validation; `request.user` is loaded from the db each request.
  - `src/routes/`: thin HTTP handlers with Zod `schema` (body/query/params/response) via `fastify-type-provider-zod`.
  - `src/plugins/rate-limit.ts`: limits on login and register, counted in memory by `src/lib/rate-limiter.ts` (one server only). `TRUST_PROXY` must match the number of proxies in front of the app, or the limits see the wrong address.
  - Roles: `ADMIN` > `INSPECTOR` > `VIEWER` (read only, for the demo account). `POST /auth/register` gives inspector rights, so it answers 403 unless `ALLOW_REGISTRATION=true`.
  - `src/test-utils/`: in-memory fakes for unit tests (excluded from the build).
  - `src/test-integration/`: integration test setup. It refuses any database whose name does not end in `_test`, because it truncates every table.
  - `prisma/schema.prisma`, `prisma/migrations/`; client generated to `src/generated/` (gitignored).
- `packages/shared`: Zod schemas and inferred types shared by web and api. Built to `dist/`.
- `apps/e2e`: Playwright tests of whole user flows in a real browser, against the production web build and the real API. `apps/api/src/test-e2e/serve.ts` drops and recreates `sitecheck_e2e` on every run and refuses any database whose name does not end in `_e2e`.

## Commands

Run from the repo root. On Windows PowerShell with a restricted execution policy, use `pnpm.cmd`.

- `docker compose up -d db`: start Postgres 18 (localhost only).
- `pnpm dev`: build shared, then run web (5173) and api (3000) in watch mode.
- `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build`: same checks CI runs. `pnpm test` is unit tests only (no database).
- `pnpm test:integration`: the real app (Supertest + Prisma) against `sitecheck_test`, created and migrated automatically. Needs the db container. Files are `*.int.test.ts` in `apps/api/src`.
- `pnpm test:e2e`: build the web app, then run Playwright on its own ports (3100, 4173), so running dev servers are not touched. Needs the db container, and once `pnpm --filter @sitecheck/e2e exec playwright install chromium`.
- `pnpm demo:record`: record the demo video (`apps/e2e/demo`) on the same throwaway servers, with the demo login button built in. Writes `apps/e2e/demo-output/sitecheck-demo.webm` (gitignored) and the README screenshots in `docs/images/` (committed). Not run in CI.
- `pnpm format`: Prettier write. `pnpm format:check` is what CI uses.
- `pnpm --filter @sitecheck/api db:migrate`: create and apply a migration (local only).
- `pnpm --filter @sitecheck/api db:seed`: idempotent demo data (3 users, 3 sites, 15 plants, 7 inspections). The demo account's password is public, so `DEMO_PASSWORD` must differ from `SEED_PASSWORD` in production.
- `pnpm --filter @sitecheck/api db:studio`: browse the database.

First run: copy `apps/api/.env.example` to `apps/api/.env`, start the db, then `db:migrate` and `db:seed`.

## Rules

- TypeScript strict; no `any`. Type data from outside the process (requests, `fetch`, env) as `unknown` and parse it with a Zod schema from `packages/shared`.
- Validate every request body, query and params with schemas from `packages/shared`.
- Business rules live in `apps/api/src/services` and need unit tests written first.
- Never render user text as raw HTML (no `dangerouslySetInnerHTML`).
- `VITE_*` variables end up in the public web bundle. Only the read-only demo account may go there.
- Never edit a migration that is already committed; add a new one.
- Never commit `.env` or secrets; document new variables in `.env.example`.
- Adding a dependency with install scripts needs an explicit `allowBuilds` entry in `pnpm-workspace.yaml`; explain why.
- Pin GitHub Actions to a full commit SHA with the version in a comment.
- Before committing: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`, plus `pnpm test:integration` when `apps/api` changed.
- Conventional Commits, one logical change per commit (e.g. `feat(api): add plant pagination`).
- Propose a plan before editing more than 3 files.

## Gotchas

- Type-aware lint and `apps/*` typecheck need `packages/shared/dist`; the root `lint`, `typecheck` and `dev` scripts build it first. If types from `@sitecheck/shared` look like `any`, build shared.
- Imports between TS files in `apps/api` and `packages/shared` use the `.js` extension (NodeNext ESM).
- TypeScript is pinned to 6.0 because typescript-eslint does not support 7 yet.
- Prisma 7 does not generate the client during `migrate dev`; `postinstall`, `build` and `typecheck` run `prisma generate`.
- Plant and Site IDs are UUIDv7 generated by Prisma, not by Postgres; raw SQL inserts must supply `id`.
