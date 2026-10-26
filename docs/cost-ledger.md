# Cost ledger: Devin build of internal tools

All times PDT, 2026-10-25. Agent time = Devin working. Human time = Melody's active time (review, merge, answers).
Usage: the API and Session Insights both report 0.0 for every session (including the parent), so usage must be read in the UI:
1. Per session: session page > ... menu (top bar, right) > Session insights > ACU usage.
2. Fallback: Settings > Usage & limits (app.devin.ai/settings/usage). Read the month's usage before and after each session; the delta is that session's cost (the parent session also accrues a little in the background).
Cost in $ = ACUs x plan rate per ACU (fill in from your plan).

## Per session

| # | Session | Agent wall-clock | ACUs | Human interventions | Lines (app / foundation / tests) | Defects found in review | PR |
|---|---------|------------------|------|---------------------|----------------------------------|-------------------------|----|
| 0 | [parent](https://app.devin.ai/sessions/a1a38d42f46c4f838aa0157d5c7191c9) setup + planning | 17:11 to 17:27 (~16 min incl. 1a/1b split) | ? | GitHub integration install; 2 approvals | 480 setup (excl. lockfile) | none | [#1](https://github.com/melodywang060/cognition/pull/1), [#2](https://github.com/melodywang060/cognition/pull/2) |
| 1a | [foundation](https://app.devin.ai/sessions/c96b1d649b3b40b78d0bcf5ddcaa7235) | 17:29:00 to 17:40:55 (~12 min) | ? | 0 corrections | 0 / 1,678 / 379 | 0 blocking (see notes) | [#3](https://github.com/melodywang060/cognition/pull/3) |
| 1b | [refunds](https://app.devin.ai/sessions/8d70d4b0661849cd8cb1eb1316de3dfb) | 18:03:47 to 18:10:13 PR opened (~6.5 min) | ? | 0 corrections in build; 1 review-fix round (~12 min) | 137 / +14 -2 / 131 (+39 Prisma model/migration/seed hook, +3 registry) | 0 blocking (see notes) | [#4](https://github.com/melodywang060/cognition/pull/4) |
| 2 | [feature flags](https://app.devin.ai/sessions/2837a43e40b540e38d674567470d2d65) from [playbook](https://app.devin.ai/settings/playbooks/34725341af1b485f9c1f7b7cffbc0001) | 18:41:18 to 19:01:08 PR opened (~20 min) | ? (Pro quota) | 0 corrections | 120 / +352 -45 / 245 (+99 -4 wiring: 2 migrations, schema, routes, registry, seed hook) | review pending | [#5](https://github.com/melodywang060/cognition/pull/5) |
| 3 | [maintenance probe: $1,000 to $500](https://app.devin.ai/sessions/33b5bfb4e6ae406bb14a3eff3560e3f2), your exact prompt, no playbook | 19:10:24 to 19:18:33 PR opened (~8 min) | ? (Pro quota) | 0 corrections | +1 -1 config / 0 foundation / +8 -2 tests (+5 -4 docs) | none found at PR time | [#6](https://github.com/melodywang060/cognition/pull/6) |

Review/merge latency (human): 1a PR opened 17:40, merged 18:03 (~23 min wall, mostly idle; ~5 min active review).

## Notes per session

**0:** Environment snapshot built from a main without package.json, so 1a's environment setup failed. Child recovered by itself. One-time friction.

**1a:** All 6 required test groups present, 25 tests pass against real Postgres (verified independently). No refunds code.
Review flags (not defects): auth stub trusts a `uid` cookie (expected; Entra ID swap point); data layer builds its own parameterized SQL from config instead of Prisma models (validated identifiers, bound values; needs security sign-off once).

**1b:** App = `src/apps/refunds/config.ts` (61) + `seed.ts` (76). The only foundation change was in `DetailScreen.tsx`: the first of two approvals wrote its audit row against the `approvals` table, so it didn't show in the refund's history. The audit row existed; the detail screen just didn't show it. Real gap found by the first real app, fixed in the shared layer and called out in the PR as asked. 35 tests pass (verified independently).
Devin Review (automated PR review) found 2 valid minor issues the build session missed: (1) interrupted first seed isn't completed on restart (demo data only); (2) audit history can order a status change above the approval that caused it (same timestamp; cosmetic but auditor-visible). Melody asked to fix both: fix requested 18:18:14 (same 1b session, same PR); fix done 18:30:35 (~12 min, longer than the 6.5 min build). +158/-39 lines: resumable seed (app), new shared `src/lib/screens/history.ts` (24 lines; DetailScreen shrank), +91 test lines (2 new tests). 39/39 tests pass (verified).
Review flags: no row filter, so every agent sees every refund (spec silent; one line to add). Same env snapshot warning as 1a.

Playbook overhead (parent session): drafted and created ~18:33 to 18:41 (~8 min, incl. approval). One-time; reused for apps #3+.
Expected: foundation approval rule is amount-threshold only, so 'prod toggles need a second admin' needs a foundation change in Session 2.

Session 2 notes: app #2 needed a foundation generalization 3x the size of the app (new `changeApproval` rule: repo.mutate refuses updates to matching rows and routes them to a `change_requests` table approved via existing decide()). Refunds unchanged; 58/58 tests pass (verified locally). Docker Hub rate-limited a rebuild (429); child used a mirror. Second admin (Dana Admin) seeded. Takeaway: per-app cost is low only when the new app fits existing foundation rules; a new kind of control costs a foundation change that needs security re-review.

Session 2 recorded UI test: 19:07:28 to 19:12:05 (~4.5 min), passed. Found 1 minor shared-UI bug (edit form's "Change request submitted" notice persists across user switch; data correct). Not found by build session or tests.

## Verified self-serve pricing (devin.ai/pricing, checked 2026-10-25)

- Pro: $20/mo, daily + weekly allowance (usage page shows allowance, not dollars; $0 = no on-demand credits used).
- Teams: $80/mo team plan + $40/mo per full dev seat; each full user gets "their own generous quota" (size not stated as Pro-equivalent).
- 60 engineers on Teams at list: $80 + 60 x $40 = $2,480/mo, about $29.8K/yr vs $250K/yr license.
- Enterprise: ACUs at contracted rate (docs: "Enterprise plans are billed in ACUs").
- Per-app approximation: Y% of a Pro weekly quota x $40 / ~4 weeks (rough self-serve approximation).

## ACU sensitivity (assumptions, not measurements)

No published formula converts session time to ACUs (cloud ACUs mix tokens, VM compute and infra; Enterprise $/ACU is per contract). Usage on this Pro account showed $0 (included quota), and API/Session Insights report 0.0.
Pessimistic bound: 10 ACUs per session x $10/ACU (deliberate overestimates) = ~$100 per app, ~$1.3K for 13 apps.
Engineer review: 2 h per app x $150/h loaded (assumed) = $300 per app.
Conclusion: Devin usage is not the deciding cost against $250K/yr; review time, security sign-off, maintenance and on-call ownership are.

## Decision model inputs (fill at the end)

- One-time foundation cost = session 0 + 1a ACUs x rate + human review hours x loaded rate + one security review.
- Per-app cost = mean of 1b and 2 (ACUs x rate + human hours x loaded rate). Lines new in app vs. changed in foundation shows whether the foundation is actually reused.
- Change cost = maintenance probe (threshold $1,000 -> $500).
- Annual build cost for 13 apps = foundation + 13 x per-app + maintenance + hosting/ops - compared with $250K/yr Power Apps licence.
