# Handover — resume point

Written 2026-09-04, mid-execution, so work can resume after a shutdown.

## Where the work is

- **Branch:** `feat/marketplace-prototype` (never merged to `master`; `master` holds only the two design commits).
- **Plan:** `docs/superpowers/plans/2026-09-04-n5deal-marketplace.md` — 23 tasks. It has been amended several times to match reality; trust it over any memory.
- **Spec:** `docs/superpowers/specs/2026-09-04-n5deal-marketplace-design.md`.
- **Full execution ledger:** `docs/superpowers/EXECUTION-LEDGER.md` — every ruling, every deferred minor, every interface fact, in order. This is the file to read first on resume. A live copy also sits at `.superpowers/sdd/2026-09-04-n5deal-marketplace/progress.md`, which is git-ignored scratch and will be destroyed by `git clean -fdx`; the committed copy is the durable one.

## Status: 16 of 23 tasks complete

Complete and reviewed: 1 scaffold, 2 Prisma schema, 3 i18n, 4 design system, 5 match scoring,
6 authorization, 7 URL filters, 8 redaction, 9 AI layer, 10 seed data, 11 auth, 12 asset catalog,
13 asset detail + NDA gate, 14 access requests, 15 listing creation, 16 buyer profile + mandate.

**217 tests pass, and the whole suite passes with `DATABASE_URL` unset** — no unit test depends on
infrastructure. Keep that property.

## Task 17 is mid-flight and UNCOMMITTED

An implementer was building the buyer catalog when the session ended. Its files are on disk but
were never reviewed, may not compile, and no commit was made:

```
modified:   src/lib/authz/rules.ts
modified:   tests/unit/authz/rules.test.ts
new:        src/components/domain/buyer-card.tsx
new:        src/components/domain/buyer-filter-sidebar.tsx
new:        src/components/domain/match-badge.tsx
new:        src/server/actions/ai.ts
new:        src/server/queries/buyer-where.ts
new:        src/server/queries/buyers.ts
new:        tests/unit/queries/buyer-where.test.ts
```

On resume, either finish and review that work, or `git checkout -- . && git clean -fd src tests`
and re-dispatch Task 17 from its brief. **Do not assume it is correct** — nothing about it has
been verified.

## Restarting the environment

```bash
docker start n5deal-pg          # Postgres 16, port 55432; data persists in the container
pnpm install                    # if node_modules is stale
pnpm test                       # expect 217 passing
pnpm dev
```

`.env` is git-ignored and holds `DATABASE_URL`, a generated `AUTH_SECRET`, and an empty
`ANTHROPIC_API_KEY`. If `.env` is gone, recreate it from `.env.example`; the database URL is
`postgresql://n5deal:n5deal@localhost:55432/n5deal`. If the container was removed rather than
stopped, recreate it and run `pnpm db:migrate` then `pnpm db:seed` — the seed is idempotent and
the demo data is fully reproducible.

Demo logins: `buyer@n5deal.demo`, `seller@n5deal.demo`, `manager@n5deal.demo`, password
`demo1234`.

## What remains

| Task | | Cycle |
|---|---|---|
| 17 | Buyer catalog for sellers | accelerated (in flight) |
| 18 | Role dashboards | accelerated |
| 19 | Messaging and inbox | **full cycle** |
| 20 | Manager console and moderation | **full cycle** |
| 21 | Landing page | accelerated |
| 22 | End-to-end tests | accelerated |
| 23 | README and deployment | accelerated |

Full cycle = implementer, task review, and a dispatched scoped re-review after every fix round.
Accelerated = implementer, task review, and one fix round the controller verifies directly from
the diff. This split was the user's decision.

## Two things that still need the user

1. **No `ANTHROPIC_API_KEY` in this environment.** All three AI features are verified statically
   against the SDK's types and behaviourally on the no-key fallback path, but **none has ever run
   against the real API.** Task 9 Step 8 must be run once with a key before trusting them.
2. **Deployment (Task 23) needs Neon and Vercel accounts** reachable through a browser.
   Development runs entirely on the local Docker Postgres.

## Handoffs recorded during execution

- Task 18 must reuse `getAssetRequestQueue` and `access-request-queue.tsx` from Task 14 rather
  than reimplementing a seller-side approve/decline surface.
- Task 18 must not render a ranking when `scoreMatch` reports `specificity === 0`, and must label
  what a ranking is based on below 5.
- Task 20 must state the `canAccessApp` semantics settled during Task 12: a suspended viewer
  browses exactly what an anonymous visitor browses and reaches no authenticated surface. The
  predicate's name and comment should say "authenticated surfaces", not "the app".
- 30+ deferred minor findings are listed in the ledger for the final whole-branch review to triage.
