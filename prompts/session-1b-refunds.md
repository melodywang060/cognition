# Session 1b: Refunds dashboard

Read spec.md and AGENTS.md. The foundation is merged. Build PR 1b ("Refunds dashboard") on top of it, using only foundation pieces: put the app under `src/apps/refunds/` with its config, seed ~30 refunds across all statuses with at least two over the $1,000 approval threshold, and register it in the app registry. Don't write new auth, authorization, audit or approval code; if the foundation lacks something, change the foundation and call it out in the PR.

Write the PR 1b tests listed in spec.md.

Before telling me you're done: run `npm run lint`, `npm run typecheck`, `npm test`, and `docker compose up --build`, then take screenshots of the refunds list, a refund detail page with its audit history, and the audit page. Update the README per the Definition of done. Open a PR titled `feat(refunds): refunds dashboard` with the screenshots and a line stating how many lines are new in `src/apps/refunds/` versus changed in the foundation.
