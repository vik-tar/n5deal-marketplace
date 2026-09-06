# Handover — resume point

Written 2026-09-04, mid-execution, so work can resume after a shutdown.

## Where the work is

- **Branch:** `feat/marketplace-prototype` (never merged to `master`; `master` holds only the two design commits).
- **Plan:** `docs/superpowers/plans/2026-09-04-n5deal-marketplace.md` — 23 tasks. It has been amended several times to match reality; trust it over any memory.
- **Spec:** `docs/superpowers/specs/2026-09-04-n5deal-marketplace-design.md`.
- **Full execution ledger:** `docs/superpowers/EXECUTION-LEDGER.md` — every ruling, every deferred minor, every interface fact, in order. This is the file to read first on resume. A live copy also sits at `.superpowers/sdd/2026-09-04-n5deal-marketplace/progress.md`, which is git-ignored scratch and will be destroyed by `git clean -fdx`; the committed copy is the durable one.

## Status: 19 of 23 complete and reviewed

Complete and reviewed: 1-18 as before, plus 19 messaging and inbox.

**297 tests pass, and the whole suite passes with `DATABASE_URL` unset** — no unit test depends on
infrastructure. Keep that property.

## Task 19 is complete and reviewed

`606af73` implementer, `94e6196` fix round 1 (four review findings), `b089bcf` a controller
follow-up the root fix had missed, `f9f1349` fix round 2 (five re-review findings). Full cycle:
implementer, review, fix, scoped re-review, fix. Review verdict was spec MET / no Critical / no
authorization hole, and it independently probed every thread with three real sessions.

Two things the reviews established that outlive the task:

- **`startConversation` is a check-then-write with a real race window**, not the native upsert its
  comment claimed. Prisma 7 + `PrismaPg` emits `SELECT` then plain `INSERT`; the reviewer captured
  the unique-constraint violation in the Postgres log during a 12-way burst. The
  `catch (P2002) → re-read` branch is the primary mechanism. It works — 12 concurrent calls, one
  row, one id.
- **A fix can be correct while its stated reason is wrong.** The controller's `auth.ts` locale fix
  was necessary, but justified by the wrong branch: `redirectTo` was already safe (Auth.js
  re-bases off-origin targets), while the `AuthError` path — which calls next-intl's `redirect()`
  directly — was the genuine protocol-relative open redirect. Only the measurement separated them.

## Resume here: Task 20

Task 20 (manager console and moderation) is a **full cycle**. Brief:
`.superpowers/sdd/2026-09-04-n5deal-marketplace/task-20-brief.md`, which carries four standing
rulings and the traps earlier tasks already paid for.

It closes three things that are currently visible holes: `/admin` 404s while the dashboard
redirects managers to it, a user can only be suspended by a hand-written SQL `UPDATE`, and
`rejectionReason` is written by nothing but the seed.

## One open ruling for the user

On the seller dashboard's top-3 matched buyers, a buyer whose mandate constrains nothing is badged
"Strong match · 100/100". See the Task 18 ledger entry for the two options. Does not block anything.

## Restarting the environment

```bash
open -a Docker                  # the daemon does not survive a reboot
docker start n5deal-pg          # Postgres 16, port 55432; data persists in the container
pnpm install                    # if node_modules is stale
pnpm test                       # expect 297 passing
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
| 20 | Manager console and moderation | **full cycle** — **resume here** |
| 21 | Landing page | accelerated |
| 22 | End-to-end tests | accelerated |
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
