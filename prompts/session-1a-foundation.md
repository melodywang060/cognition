# Session 1a: Foundation

Read spec.md and AGENTS.md. Build PR 1a ("Foundation") from the Build order section: items 1 to 6 of the foundation. Design it for the refunds app described in spec.md, but don't build any refunds code; that's the next session.

Seed one user per role (`agent`, `reviewer`, `admin`, plus a second `reviewer` so two-approver rules can be exercised) and add a user switcher. Every role check happens on the server.

Write the PR 1a tests listed in spec.md against a test-only resource that declares an approval rule in config.

Before telling me you're done: run `npm run lint`, `npm run typecheck`, `npm test`, and `docker compose up --build`, then open the app and take screenshots of the home page (with the user switcher) and the audit page. Open a PR titled `feat(foundation): auth, data access, audit, approvals` with the screenshots and a short description of where each control is enforced.
