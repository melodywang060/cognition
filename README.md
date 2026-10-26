# Internal Tools Platform

Prototype for evaluating whether a fintech team can replace Power Apps internal tools with apps built by Devin on a shared foundation. See `spec.md` for scope and `build-log.md` for how it was built.

## Run it

Requires Docker.

```bash
docker compose up --build
```

Open http://localhost:3000. Health check: http://localhost:3000/api/health.

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
| `npm test` | Vitest (needs the `db` container running) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Create/apply a Prisma migration |
| `npm run db:seed` | Seed the database |
