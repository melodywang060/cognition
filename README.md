# Internal Tools Platform

Prototype for evaluating whether a fintech team can replace Power Apps internal tools with apps built by Devin on a shared foundation. See `spec.md` for scope and `build-log.md` for how it was built.

It has one app so far, the **refunds dashboard**: support agents request customer refunds, finance reviewers approve or deny them (maker-checker, with two distinct approvers above $1,000), and admins mark approved refunds as issued. Every change is recorded in an append-only audit log.

## Run it

Requires Docker.

```bash
docker compose up --build
```

Open http://localhost:3000, pick a user in the top-right switcher, and open **Refunds**. Health check: http://localhost:3000/api/health.

On start the container applies migrations and seeds users plus ~30 refunds across every status (some over the threshold, one waiting for its second approval). Seeding goes through the foundation, so seeded refunds have real approvals and audit history. It's resumable: each seeded refund is matched by order id and only moved forward, so a seed interrupted partway completes on the next start, and a finished seed does nothing. To start from scratch: `docker compose down -v`.

## Refunds dashboard

Code: `src/apps/refunds/` (`config.ts` declares fields, list/filters, form, roles, the approval rule and the `issue` transition; `seed.ts` seeds data). Everything else comes from the foundation.

| Screen / action | Who | Notes |
|---|---|---|
| Refund list (`/apps/refunds/refunds`) | everyone | Search (customer, order id, notes); filter by status, customer, amount range (dollars) |
| Refund detail | everyone | Customer, order id, amount, reason code, status, requester, approvals; audit history for `reviewer`+ |
| Request refund (form) | `agent`+ | Created in `requested`; the requester is the signed-in user, set on the server |
| Approve / deny with reason | `reviewer`+, never the requester | Deny needs a reason. Amounts over `approvalThreshold` (`config.ts`, $1,000) need two distinct approvers |
| Issue | `admin` | `approved` → `issued`; stand-in for a payments API call |

Refunds can't be edited or deleted; status changes only through approve/deny and issue.

## Users and roles

Auth is a stub: pick a user from the switcher in the top right (it sets a `uid` cookie). Seeded users:

| User | Role |
|---|---|
| Alice Agent | `agent` |
| Rita Reviewer | `reviewer` |
| Rob Reviewer | `reviewer` (second approver) |
| Adam Admin | `admin` |

Roles are ordered (`agent` < `reviewer` < `admin`). Every check runs on the server; hiding a button is only a hint.

To act as someone else, pick them in the switcher; the page reloads as that user. For example: request a refund as Alice, approve it as Rita (and Rob if it's over $1,000), then issue it as Adam. Only reviewers and admins see the audit log.

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

## Gaps (out of scope for the prototype)

- **Identity:** no real Entra ID / SSO or conditional access; the user switcher is a stub. `src/lib/auth.ts` is the single module to replace with OIDC.
- **Integrations:** no connectors to real payment or identity systems; "Issue" only changes the status.
- **Notifications:** no email/Teams alerts when a refund needs approval or changes status.
- **Document storage:** no attachments (receipts, photos).
- **Deployment and secrets management:** local docker compose only, credentials in plain env vars.
- **Mobile layouts:** desktop only.
- **KYC review queue:** not built.
