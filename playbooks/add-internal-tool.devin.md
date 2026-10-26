# Add a new internal tool to the internal-tools foundation

## Overview
Adds one new internal tool (app) to the internal-tools repo by stamping it onto the shared foundation in `src/lib/`. The app should be mostly config plus seed data. Auth, authorization, audit and approvals come from the foundation and are never rewritten per app. The result is one PR that a reviewer can approve quickly because it adds no new security-relevant code paths.

## What's Needed From User
- A one-paragraph description of the app: its records and fields, who can do what, and any approval rule. Example: "Vendor payments: payments with vendor, invoice number, amount, due date, status. Agents create; reviewers approve; payments over $10,000 need two approvers; only admins mark paid."
- The repo, if it isn't attached to the session.

## Procedure
1. Read `spec.md`, `AGENTS.md` and an existing app (`src/apps/refunds/config.ts`, `seed.ts`, `tests/refunds.test.ts`) to see the config shape and the conventions.
2. Map the app's people onto the existing roles (`agent`, `reviewer`, `admin`) and write the mapping down for the PR. Do not add roles.
3. Add the table through a Prisma migration (`npm run db:migrate`, never `db push`). The table needs `id text primary key` and `created_at timestamptz default now()`.
4. Create `src/apps/<name>/config.ts`: resource fields, list columns, filters, search, form fields, permissions, transitions and approval rule. Put rules in config, not in screens or route handlers.
5. If the foundation can't express a rule the app needs, generalize the foundation in `src/lib/` (not app-specific code), keep existing apps working unchanged, and call the change out in the PR.
6. Create `src/apps/<name>/seed.ts` that writes through `repo.mutate` (so seed data is audited and can be resumed), and hook it into `prisma/seed.ts`.
7. Register the app in `src/apps/index.ts`.
8. Add tests in `tests/<name>.test.ts` through the real route handlers: a wrong role gets 403 on a mutating route, any maker-checker rule holds (no self-approval, distinct second approver), and each mutation writes an audit row.
9. Update README.md: what the app does, its roles, and how to try it.
10. Verify: `npm run lint`, `npm run typecheck`, `npm test`, `docker compose up --build`. Then open the app and screenshot the list page, a detail page with history, and a 403 or blocked action.
11. Open a PR titled `feat(<name>): new internal tool` with the screenshots and the line count.

## Specifications
- No new auth, authorization, audit or approval code in `src/apps/<name>/`. No direct Prisma or SQL access to app tables from UI, route handlers or server actions; use `repo.query` / `repo.mutate`.
- Every role check happens on the server; hiding a button is not authorization.
- The PR states: "N lines new in `src/apps/<name>/` vs. M changed in `src/lib/` (foundation)", plus wiring and test line counts.
- Lint, typecheck, tests and CI pass; the app starts with seed data under `docker compose up --build`.

## Forbidden Actions
- Don't change existing apps' behaviour or weaken foundation checks to make the new app fit.
- Don't add services, frameworks or UI libraries.
- Don't merge the PR.
