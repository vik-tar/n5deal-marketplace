# Handover — resume point

Written 2026-09-04, mid-execution, so work can resume after a shutdown.

## Where the work is

- **Branch:** `feat/marketplace-prototype` (never merged to `master`; `master` holds only the two design commits).
- **Plan:** `docs/superpowers/plans/2026-09-04-n5deal-marketplace.md` — 23 tasks. It has been amended several times to match reality; trust it over any memory.
- **Spec:** `docs/superpowers/specs/2026-09-04-n5deal-marketplace-design.md`.
- **Full execution ledger:** `docs/superpowers/EXECUTION-LEDGER.md` — every ruling, every deferred minor, every interface fact, in order. This is the file to read first on resume. A live copy also sits at `.superpowers/sdd/2026-09-04-n5deal-marketplace/progress.md`, which is git-ignored scratch and will be destroyed by `git clean -fdx`; the committed copy is the durable one.

## Status: 21 of 23 complete and reviewed

Complete and reviewed: 1-20 as before, plus 21 landing page.

**355 tests pass, and the whole suite passes with `DATABASE_URL` unset** — no unit test depends on
infrastructure. Keep that property.

## Task 21 is complete and reviewed

`b45b80b` implementer, `48d6072` fix round. The page's figures agree with the catalog **by
construction**: the count and the value are now two fields of one aggregate off one `where`
binding, and the six recent listings are literally the catalog's first six rows.

Two lessons from its review worth carrying:

- **Headless Chromium lays out correctly down to 320px in this environment.** The implementer
  reported otherwise and left the narrow band unmeasured; the review found a clipped hero eyebrow
  at 390px in Russian sitting exactly there. Measure, do not reason from CSS.
- **A silent clip does not move `scrollWidth`.** `overflow-hidden` on a section swallows an
  over-wide child without producing horizontal page scroll, so the usual "does the page scroll
  sideways" check passes while the first screen is visibly broken.

## Resume here: Task 22

Task 22 (end-to-end tests) is an **accelerated cycle**. Brief:
`.superpowers/sdd/2026-09-04-n5deal-marketplace/task-22-brief.md`.

It is the first task that adds a dependency (`@playwright/test`) and the first whose own runtime
mutates the seeded database on purpose. Both need care — see the brief.

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
| 22 | End-to-end tests | accelerated — **resume here** |
| 23 | README and deployment | accelerated |

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
