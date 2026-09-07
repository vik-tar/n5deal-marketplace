# Handover — resume point

Written 2026-09-04, mid-execution, so work can resume after a shutdown.

## Where the work is

- **Branch:** `feat/marketplace-prototype` (never merged to `master`; `master` holds only the two design commits).
- **Plan:** `docs/superpowers/plans/2026-09-04-n5deal-marketplace.md` — 23 tasks. It has been amended several times to match reality; trust it over any memory.
- **Spec:** `docs/superpowers/specs/2026-09-04-n5deal-marketplace-design.md`.
- **Full execution ledger:** `docs/superpowers/EXECUTION-LEDGER.md` — every ruling, every deferred minor, every interface fact, in order. This is the file to read first on resume. A live copy also sits at `.superpowers/sdd/2026-09-04-n5deal-marketplace/progress.md`, which is git-ignored scratch and will be destroyed by `git clean -fdx`; the committed copy is the durable one.

## Status: 23 of 23 complete — all tasks done

**355 unit tests pass with `DATABASE_URL` set and unset; 3 Playwright specs pass.** typecheck,
lint and build are clean. The database is left in the seeded state. Nothing has been pushed and no
remote exists.

## Task 23 is complete

`e12edf8`. The README is a full rewrite — twelve sections, with the four appendix sections earlier
tasks had bolted on absorbed into where they belong, and a "What is not built" section placed third
so a reader meets the gaps before the decision prose.

It also caught a hazard the brief itself introduced: `postinstall: prisma generate` would have
**broken `pnpm i` for everyone**, because `prisma.config.ts` used Prisma's `env()` helper, which
resolves at config-load time and throws before `generate` runs. On a fresh clone, before anyone has
written a `.env`, the install would have failed. Proven both ways on a real scratch clone.

## What is left

1. **A whole-branch review**, including a triage of the deferred minor findings recorded throughout
   the ledger — 34 entries are marked `minor (deferred)` and several list more than one item. Three
   known-stale items to strike rather than act on are recorded in the Task 23 ledger entries.
2. **The branch has never been merged to `master`**, which still holds only the two design commits.
3. **Deployment** — the only thing in the whole plan that needs the user: Neon and Vercel accounts
   reachable through a browser. Instructions are written and a URL placeholder is in the README.

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
