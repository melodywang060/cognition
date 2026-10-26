# Internal Tools Platform: Spec

A shared foundation for a fintech's internal tools (today built in Power Apps), plus the first app on it: the refunds dashboard. Every later app (feature-flag admin, then apps #4 to #13) is stamped onto the same foundation and must not write its own auth, authorization or audit code.

## Stack

Next.js (App Router, TypeScript) for UI and API routes, Postgres via Prisma, Tailwind, Vitest. `docker compose up` runs everything. Keep it boring: no extra services, no UI component libraries beyond what's needed.

## Foundation (shared by every app)

1. **Auth stub with roles, enforced server-side.** Roles: `agent`, `reviewer`, `admin`. No real SSO: a seeded user list and a user switcher (cookie) are enough, but the role check happens on the server for every API route and server action. A wrong role gets a 403 from the server, not just a hidden button. Production would swap the stub for Entra ID via OIDC; keep the auth module the single place that would change.
2. **Data-access layer.** All reads go through `repo.query(user, ...)`, all writes through `repo.mutate(user, ...)`. Role-based row filters and field masks are applied inside the layer, never in UI code. No app code calls Prisma directly for app tables.
3. **Audit log on every write.** `repo.mutate()` writes an `audit_events` row (actor, action, table, record id, before, after, timestamp) in the same transaction as the change. A write that fails to audit does not commit. Audit page in the UI, filterable by record and actor; read-only for everyone, visible to `reviewer` and `admin`.
4. **Maker-checker approvals.** One person requests, a different person approves. The requester can never approve their own request (enforced on the server). Requests above a threshold set in the app's config need a second, distinct approver; the approval logic is shared, apps only declare the rule.
5. **Generic table / detail / form screens** driven by a per-app declarative config (columns, filters, fields, roles, approval rules) so that a new app is mostly config plus seed data.
6. **App registry.** The home page lists registered apps; each app lives under `src/apps/<name>/` with its config.

## App 1: Refunds dashboard

Users: support agents (`agent`), finance reviewers (`reviewer`), admins.

- **Refund list:** searchable and filterable by status (`requested`, `approved`, `denied`, `issued`), customer, amount.
- **Refund detail:** customer, order id, amount, reason code, status, requester, approvers, and its audit history.
- **Request refund (form):** `agent` and above. Creates a refund in `requested`.
- **Approve / deny with reason:** `reviewer` and above; never the requester. Refunds over $1,000 (`approvalThreshold` in the refunds app config, not hard-coded) need two distinct approvals before moving to `approved`.
- **Issue:** `admin` marks an approved refund `issued` (stand-in for a payments API call; no real integration).
- **Seed:** ~30 refunds across all statuses, at least two over the threshold, and users for each role.

## Build order

Two PRs, each from its own Devin session. Merge 1a before starting 1b.

### PR 1a: Foundation

Items 1 to 6 above, designed for the refunds app but containing no refunds code. Tests use a test-only resource, created in test setup or as a fixture, that declares an approval rule in config.

Required tests:
- A user without the required role gets 403 from the server on a mutating route.
- The requester cannot approve their own request.
- Over-threshold requests need two distinct approvers.
- Every `repo.mutate()` creates an audit row; a mutation whose audit write fails is rolled back.
- Row filters and field masks in `repo.query()` hide rows and fields from a role that may not see them.

Done when: lint, typecheck, tests and CI pass; `docker compose up --build` starts with seeded users for each role, a working user switcher, an empty app registry, and the audit page.

### PR 1b: Refunds dashboard

The refunds app above, built only from foundation pieces: config, seed data, any app-specific screens, and its tests. No new auth, authorization, audit or approval code; if the foundation is missing something, change the foundation and say so in the PR.

Required tests:
- An `agent` gets 403 on the approve route.
- The requester cannot approve their own refund.
- Refunds over the threshold need two distinct approvers.
- Request, approve, deny and issue each create an audit row.

Done when: everything in "Definition of done" below holds, and the PR states how many lines are new in `src/apps/refunds/` versus changed in the foundation.

## Out of scope (document as gaps in the README)

Real Entra ID / conditional access, connectors to real payment or identity systems, notifications, document storage, deployment and secrets management, mobile layouts, KYC review queue.

## Definition of done (after PR 1b)

- `npm run lint`, `npm run typecheck`, `npm test` pass; CI is green.
- `docker compose up --build` starts the app with seeded data at http://localhost:3000.
- README explains what the app does, how to run it, roles and how to switch users, and the gaps above.
- PR includes screenshots of the refunds list and the audit page.
