# Agent guide

Read `spec.md` before building. Record each session in `build-log.md`.

## Working in this repo

- Stack: Next.js App Router (TypeScript), Postgres via Prisma, Tailwind, Vitest. Don't add services or frameworks without a reason in the PR description.
- Layout: shared foundation in `src/lib/` (auth, repo, audit, approvals, generic screens); each app in `src/apps/<name>/` with its declarative config; routes in `src/app/`.
- All reads go through `repo.query()`, all writes through `repo.mutate()`. Never query app tables directly from UI code, route handlers or server actions.
- Schema changes go through a Prisma migration (`npm run db:migrate`), never `db push`.
- Before saying you're done: `npm run lint`, `npm run typecheck`, `npm test`, and `docker compose up --build` all succeed.

## Adding or changing an API route or server action

- Check the caller's role on the server and return 403 on failure. Hiding a button is not authorization.
- Every mutation writes an audit event in the same transaction (`repo.mutate()` does this; don't bypass it).
- Add a test for the 403 and a test that the mutation produces an audit row.

## Fintech rules

- Roles are `agent`, `reviewer`, `admin`.
- Approvals need a different person than the requester.
- Amounts over the app's configured threshold need a second, distinct approver.
