# Handover — resume point

Written 2026-09-04, mid-execution, so work can resume after a shutdown.

## Where the work is

- **Branch:** `feat/marketplace-prototype` (never merged to `master`; `master` holds only the two design commits).
- **Plan:** `docs/superpowers/plans/2026-09-04-n5deal-marketplace.md` — 23 tasks. It has been amended several times to match reality; trust it over any memory.
- **Spec:** `docs/superpowers/specs/2026-09-04-n5deal-marketplace-design.md`.
- **Full execution ledger:** `docs/superpowers/EXECUTION-LEDGER.md` — every ruling, every deferred minor, every interface fact, in order. This is the file to read first on resume. A live copy also sits at `.superpowers/sdd/2026-09-04-n5deal-marketplace/progress.md`, which is git-ignored scratch and will be destroyed by `git clean -fdx`; the committed copy is the durable one.

## Status: 22 of 23 complete and reviewed

Complete and reviewed: 1-21 as before, plus 22 end-to-end tests.

**355 unit tests pass with `DATABASE_URL` set and unset**, and **3 Playwright specs pass** in ~29s.
Keep the first property: `vitest.config.mts` includes only `tests/unit/**`, so the e2e specs stay
out of the unit run.

## Task 22 is complete and reviewed

`885b345`. Every spec was proven able to fail — four deliberate breaks, each red on the right line.
The controller independently reproduced one of them by hand (broke `canViewFullAsset` to ignore the
grant; the buyer spec went red on "confidential heading absent"; restored; green).

Two facts worth carrying:

- **`prisma migrate reset` refuses to run for an AI agent** (Prisma 7.10) and demands a consent
  variable carrying the user's own words. `resetDb()` therefore runs `pnpm db:seed` alone. That is
  sufficient, and verified twice: all ten models in the schema have a matching `deleteMany` in
  `prisma/seed.ts` before any write, so the seed *is* a full data reset. A developer whose schema
  has drifted must run `pnpm db:migrate` themselves.
- **`pnpm test:e2e` reseeds before and after**, so it is destructive to local demo data by design
  and leaves the database exactly seeded.

## Resume here: Task 23 — the last one

Task 23 (README and deployment) is an **accelerated cycle**. Brief:
`.superpowers/sdd/2026-09-04-n5deal-marketplace/task-23-brief.md`.

**Its Step 2 (deploy to Vercel + Neon) is the only thing in the whole plan that needs the user.**
The README, `.env.example` and the deployment instructions can and should be finished without it.

## After Task 23

A final whole-branch review still owes a triage of the ~40 deferred minor findings recorded
throughout this ledger, and the branch has never been merged to `master`.

## One open ruling for the user

On the seller dashboard's top-3 matched buyers, a buyer whose mandate constrains nothing is badged
"Strong match · 100/100". See the Task 18 ledger entry for the two options. Blocks nothing.

## Restarting the environment

```bash
open -a Docker                  # the daemon does not survive a reboot
docker start n5deal-pg          # Postgres 16, port 55432; data persists in the container
pnpm install                    # if node_modules is stale
pnpm test                       # expect 355 passing
pnpm dev
```

`pnpm start` on a port other than 3000 fails Auth.js with `UntrustedHost` unless
`AUTH_TRUST_HOST=true` is set. Irrelevant on Vercel, relevant for local production-build testing.

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
| 23 | README and deployment | accelerated — **resume here** |

Full cycle = implementer, task review, and a dispatched scoped re-review after every fix round.
Accelerated = implementer, task review, and one fix round the controller verifies directly from
the diff. This split was the user's decision.

## One thing that still needs the user

1. **Deployment (Task 23) needs Neon and Vercel accounts** reachable through a browser.
   Development runs entirely on the local Docker Postgres.

**Settled, do not reopen:** the user decided on 2026-09-07 that this project ships with
`ANTHROPIC_API_KEY` unset. That is the designed configuration — the three AI features hide
themselves and everything else is deterministic — not a gap to close. Task 9 Step 8 is closed as
will-not-do. Do not raise it again, and do not let Task 23 list it as an open item; the README
documents it as the shipping state.

## Handoffs recorded during execution

- Task 18 must reuse `getAssetRequestQueue` and `access-request-queue.tsx` from Task 14 rather
  than reimplementing a seller-side approve/decline surface.
- Task 18 must not render a ranking when `scoreMatch` reports `specificity === 0`, and must label
  what a ranking is based on below 5.
- Task 20 must state the `canAccessApp` semantics settled during Task 12: a suspended viewer
  browses exactly what an anonymous visitor browses and reaches no authenticated surface. The
  predicate's name and comment should say "authenticated surfaces", not "the app".
- 30+ deferred minor findings are listed in the ledger for the final whole-branch review to triage.
