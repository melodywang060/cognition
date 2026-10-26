# Internal Tools Platform

Prototype for evaluating whether a fintech team can replace Power Apps internal tools with apps built by Devin on a shared foundation. See `spec.md` for scope and `build-log.md` for how it was built.

## Run it

Requires Docker.

```bash
docker compose up --build
```

Open http://localhost:3000. Health check: http://localhost:3000/api/health.

## Users and roles

Auth is a stub: pick a user from the switcher in the top right (it sets a `uid` cookie). Seeded users:

| User | Role |
|---|---|
| Alice Agent | `agent` |
| Rita Reviewer | `reviewer` |
| Rob Reviewer | `reviewer` (second approver) |
| Adam Admin | `admin` |

Roles are ordered (`agent` < `reviewer` < `admin`). Every check runs on the server; hiding a button is only a hint.

## Foundation

| Control | Where it is enforced |
|---|---|
| Who the user is | `src/lib/auth.ts` (the only module that changes for Entra ID / OIDC) |
| Role per operation (401/403) | `repo.query()` / `repo.mutate()` in `src/lib/repo.ts`, using each resource's `permissions`; pages also return 401/403 via `src/lib/screens/page-guards.ts` |
| Row filters, field masks | `repo.query()` (masked fields can't be filtered, sorted or searched on; masks also apply to audit before/after) |
| Audit row on every write | `repo.mutate()` writes `audit_events` in the same transaction; a DB trigger makes the table append-only |
| Maker-checker | `src/lib/approvals.ts` (approver role, requester ≠ approver, distinct second approver above `threshold`) |
| Status transitions | `src/lib/transitions.ts` (config-declared, e.g. approved → issued) |

### Adding an app

1. Add a Prisma model for the app's table (`id` text primary key, `created_at` timestamptz default now()) and run `npm run db:migrate`.
2. Create `src/apps/<name>/config.ts` exporting an `AppConfig` (see `src/lib/types.ts`): fields, list columns/filters/search, form fields, `permissions`, optional `rowFilter`, `statusField`, `approval` rule and `transitions`.
3. Add it to `registeredApps` in `src/apps/index.ts`. The generic list/detail/form screens and API routes (`/api/apps/<app>/<resource>/...`) work from the config.

See `tests/fixtures.ts` for a complete example config.

## Develop

Requires Node 22.

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm test` | Vitest against a separate `<db>_test` database, created and migrated automatically (needs the `db` container running) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Create/apply a Prisma migration |
| `npm run db:seed` | Seed the database |
