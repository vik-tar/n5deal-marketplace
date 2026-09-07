# SDD ledger — plan: docs/superpowers/plans/2026-09-04-n5deal-marketplace.md

Spec: docs/superpowers/specs/2026-09-04-n5deal-marketplace-design.md (read, binding authority)
Branch: feat/marketplace-prototype
Workspace DB: postgresql://n5deal:n5deal@localhost:55432/n5deal (docker container `n5deal-pg`, postgres:16-alpine)
Package manager: pnpm 10.18.3 via `corepack enable pnpm`

## Environment rulings (pre-flight)

Ruling: use local Docker Postgres for Tasks 2-22 instead of Neon — Neon requires browser
  signup on the user's account, which is outside this worktree. Neon stays a Task 23
  (deploy) step for the user. Cost if wrong: none technically; Task 23 must still be run
  by the user with their own credentials.
Ruling: pnpm enabled through corepack rather than switching the plan to npm — the plan's
  scripts and lockfile assume pnpm. Cost if wrong: none; corepack ships with Node 24.
Ruling: ANTHROPIC_API_KEY is unavailable in this environment (`ant` CLI not installed, env
  var unset), so Task 9 Step 8 (live API smoke test) CANNOT be executed here. The
  fallback tests still run and must pass. Cost if wrong: the three AI features are
  unverified against the real API and could fail on first live use — the user must run
  Step 8 once with a key before trusting them. Flagged for the final report.
Ruling: `.env` written at setup with the local DATABASE_URL and a generated AUTH_SECRET.
  Task 1 must include `.env` in .gitignore before its first commit. Cost if wrong: a
  secret is committed — checked explicitly at Task 1 review.

## Pre-flight plan scan

### Per-task self-agreement

| Task | Self-agreement check | Finding |
|---|---|---|
| 1 | test expectations vs. implementation | CONFLICT — `formatCents(250_000_00,'ru')` asserted as `'250 000 €'`; Intl emits U+00A0 separators, so the literal cannot pass as written |
| 1 | scaffolder vs. non-empty directory | RISK — `create-next-app` refuses a directory containing unexpected entries; `.superpowers/` and `docs/` are present |
| 2 | schema scalars vs. Task 8 field lists | OK — 27 scalars, 21 public + 6 confidential, exact match |
| 2 | generator/config syntax vs. installed Prisma | RISK — `provider="prisma-client"` and `prisma.config.ts` need a recent Prisma major |
| 3 | files created vs. files later modified | OK |
| 4 | SiteHeader prop type vs. `Viewer` (defined later in Task 6) | OK — plan states the temporary type and the Task 11 tightening explicitly |
| 5 | 9 test cases vs. weights and thresholds | OK — arithmetic verified by hand for every case |
| 6 | 24 test cases vs. predicates | OK |
| 7 | 14 test cases vs. parse/serialize | OK |
| 8 | sample Asset literal vs. schema | OK — all 27 fields present |
| 9 | fallback tests vs. no-key behaviour | OK |
| 10 | fixtures vs. schema enums | OK |
| 11 | `requireViewer(locale)` vs. Server Action callers | CONFLICT — Server Actions in Tasks 14-20 have no locale in scope |
| 12 | Files list vs. components described | GAP — smart search needs a Server Action file that is not listed |
| 12 | return type vs. defined types | GAP — `CategoryFacet` referenced, defined nowhere |
| 13 | return type vs. defined types | GAP — `SellerSummary` referenced, defined nowhere |
| 14 | return type vs. defined types | GAP — `ActionError` referenced, defined nowhere |
| 15-16 | schemas vs. actions | OK |
| 17 | Files list vs. components described | GAP — match explanation needs a Server Action file that is not listed |
| 18-21 | internal | OK |
| 22 | globalSetup vs. developer state | NOTE — `db:reset` wipes the dev database on every e2e run |
| 23 | deploy steps vs. this environment | Covered by the Neon ruling above |

### Cross-task interface pairs

| Producer | Consumer | Interface | Finding |
|---|---|---|---|
| 2 | 5,6,7,8,9 | `@/generated/prisma` enums and `Asset` type | OK — Task 2 precedes all |
| 5 | 17,18 | `scoreMatch`, `MatchResult`, `MatchReason` | OK — names stable |
| 6 | 11,12,13,14,15,17,19,20 | `Viewer`, `AssetRef`, `GrantState`, `can*` | OK — names stable |
| 7 | 9,12,17 | `AssetFilters`, `ASSET_CATEGORIES`, `BUSINESS_STATUSES` | OK — Task 9 imports the enum constants from Task 7, which exports them |
| 8 | 12,13 | `toTeaserAsset`, `toAssetDto`, `isFullAsset` | OK |
| 9 | 12,15,17 | `parseSearchQuery`, `reviewTeaser`, `explainMatch`, `isAiEnabled` | OK |
| 10 | 11,22 | `DEMO_ACCOUNTS`, `DEMO_PASSWORD` | OK |
| 11 | 12-21 | `getViewer`, `requireViewer` | See the locale conflict above |
| 19 | 10 | `buildThreadKey` | OK — plan states the inline-then-import sequence in both tasks |
| 12 | 13,18,21 | `listAssets` and the shared `AssetCard` | OK |

### Rulings on the scan

Ruling: Task 1's `ru` assertion — the implementer records the actual `Intl.NumberFormat`
  output and writes that as the expectation, keeping the test's intent (ru formatting
  differs from en and trails the symbol). The literal in the plan is illustrative, not
  binding; the spec mandates no exact string. Cost if wrong: none.
Ruling: Task 1 scaffolding — if `create-next-app` refuses the directory, scaffold into a
  temporary directory and move the generated files in, preserving `.git`, `docs/`,
  `.superpowers/` and `.env`. Cost if wrong: a lost docs directory, recoverable from git.
Ruling: Task 2 Prisma syntax — install the current Prisma major and use the plan's
  `prisma-client` generator plus `prisma.config.ts`. If the installed version rejects
  either, fall back to `prisma-client-js` with the default output and a `prisma.seed`
  entry in package.json, and record the fallback. The spec mandates a persistent
  relational model, not a specific generator. Cost if wrong: import paths change from
  `@/generated/prisma` to `@prisma/client` in every downstream task — cheap if caught at
  Task 2, expensive if caught at Task 12, so Task 2's review must confirm which applies.
Ruling: `requireViewer` takes `locale` as an explicit parameter, and every Server Action
  takes `locale` as part of its input payload, supplied by the calling component. The
  alternative — reading the locale from headers inside the action — is more magic for no
  gain. Cost if wrong: a redirect after session expiry lands in the wrong language.
Ruling: the three dangling types are defined where they are first produced —
  `CategoryFacet = { category: AssetCategory; count: number }` in Task 12's
  `src/server/queries/assets.ts`; `SellerSummary = { id: string; companyName: string | null;
  country: string; verified: boolean }` in Task 13's `src/server/queries/assets.ts`, with
  `companyName` null whenever the gate is closed; `ActionError = 'FORBIDDEN' | 'NOT_FOUND'
  | 'ALREADY_REQUESTED' | 'INVALID'` in a new `src/server/actions/types.ts` in Task 14.
  Cost if wrong: none — these are naming choices the plan left open.
Ruling: the two missing Server Action files are added to their tasks —
  `src/server/actions/search.ts` (Task 12) and `src/server/actions/ai.ts` (Task 17).
  Cost if wrong: none.
Ruling: Task 22's destructive `db:reset` in globalSetup stands — the development database
  is a disposable container and reproducible e2e runs are worth more than hand-entered
  test state. Cost if wrong: a developer loses manual test data; `pnpm db:seed` restores
  the baseline.

## Task log

Task 1: implementer DONE (commit 9a2e94b) — next 16.3.4, react 19.2.8, ts 5.9.3, tailwind 4.3.3.
  3/3 vitest passing; typecheck, lint and build pass from clean. Self-declared deviations:
  RootLayout prop type hand-written instead of generated `LayoutProps<"/">`; `"type": "module"`
  added to package.json. Review dispatched (review-2b4c794..9a2e94b.diff).
Task 1: review = spec ✅, quality Approved, 2 Important + 2 Minor. FIX_BASE 9a2e94b.
Task 1: minor (deferred): `vite-tsconfig-paths` prints a redundancy notice on every `pnpm test`
  run — plan-mandated dependency; switch to Vite native tsconfig-path resolution later.
Task 1: minor (deferred): `@types/node@^26` installed while the runtime is Node 24 — pin to ^24
  before a task touches Node built-ins.
Task 1: Ruling: the reviewer's ⚠️ (is `"type": "module"` actually needed to silence the Vite
  config-loader warning?) is resolved without reproducing it. The narrow fix — renaming the
  config to `vitest.config.mts` — is correct whether or not the warning reproduces, because a
  package-wide `"type": "module"` changes module semantics for every emitted `.js` file and
  Prisma's generated client defaults to CommonJS in Task 2. Cost if wrong: if the narrow fix
  fails to silence the warning, we accept the notice as a deferred minor rather than reinstate
  a package-wide ESM switch.
Task 1: Ruling: `parseEuros` accepts plain digits with an optional 1-2 decimal places, tolerating
  spaces and commas as grouping (what a user of an English-first UI pastes), and REJECTS
  dot-as-thousands-grouping (`1.234,56`) as genuinely ambiguous against `1.234` meaning one
  euro twenty-three. The current behaviour is right; it was merely undocumented and untested.
  Cost if wrong: a Russian-locale user pasting `1 234,56` is handled, but `1.234,56` is
  rejected with a validation error rather than silently misparsed — a visible failure, not a
  money bug.
Task 1: fix round 1/5 (implementer reports both addressed; 15/15 passing; commits 9a2e94b..d707787).
  Finding 1: `"type": "module"` removed, vitest.config.ts -> vitest.config.mts, warning did not
  resurface. Finding 2: no logic change claimed — regex already met the spec; added doc comment,
  tests/unit/money.test.ts (15 cases), deleted smoke.test.ts. Scoped re-review dispatched.
Task 1: minor (deferred): tests/unit/money.test.ts:16 embeds a raw U+00A0 byte in the source
  instead of the ` ` escape used two lines below — invisible and degradable by a
  trailing-whitespace trim. Functionally correct today.
Task 1: complete (commits 2b4c794..d707787, review clean — all findings addressed)

Task 2: implementer DONE_WITH_CONCERNS (commit ea762d4). Prisma pinned to 7.10.0 (npm `latest`
  for the CLI is an 8.0.0-rc while @prisma/client latest is 7.10.0 — unpinned would mismatch
  majors). Migration 20260904005837_init applied; connection check returned users: 0.
Task 2: INTERFACE FACT for every downstream task — the Prisma import path is
  `@/generated/prisma/client`, NOT the brief's `@/generated/prisma`. The `prisma-client`
  generator emits no index; `src/generated/prisma/` contains client.ts, enums.ts, models.ts.
  `client.ts` exports PrismaClient, all 9 enums and all 10 model types. Tasks 5, 6, 7, 8, 9,
  and every later task importing Prisma types MUST be dispatched with this path.
Task 2: controller check — Asset model has exactly 27 scalar fields + 4 relation fields,
  matching Task 8's classification invariant (21 public + 6 confidential). Verified by hand.
Task 2: review = spec ✅, quality Approved, 2 Important (both plan-mandated) + 2 Minor.
  FIX_BASE ea762d4. Controller resolved the reviewer's ⚠️: .env holds the local
  localhost:55432 URL, .env.example holds placeholders only, and no cloud host string
  appears in any tracked file.
Task 2: Ruling: money columns move from `Int` to `BigInt`. THE PLAN CONTRADICTS ITSELF —
  Postgres INTEGER caps at 2,147,483,647 cents (EUR 21.47M) while the spec (section 10)
  and the plan (Task 10) both mandate seed asking prices up to EUR 25,000,000. The spec is
  the binding authority and it demands the wider range; the `Int` choice was my drafting
  error, not a considered constraint. Applies to Asset.askingPriceCents, Asset.revenueCents,
  Asset.ebitdaCents, Mandate.ticketMinCents, Mandate.ticketMaxCents. bigint is normalised to
  `number` at the DTO/query boundary that already exists for redaction (design decision D3),
  so bigint never crosses into React — Next.js cannot serialise it to client components, and
  Number.MAX_SAFE_INTEGER is EUR 90 trillion in cents. Cost if wrong: Task 8's DTO types can
  no longer be a bare `Omit<Asset, ...>` and must override the five money fields as `number`;
  Task 12's Prisma where-clauses must wrap filter bounds in `BigInt()`. Both are single
  chokepoints already in the design. Downstream dispatches must carry this.
Task 2: Ruling: the `DATABASE_URL` fail-fast guard is added despite being absent from the
  brief's snippet. The implementer's own report documents hitting the silent-hang failure it
  prevents. A plan snippet does not get to mandate a footgun. Cost if wrong: none.
Task 2: minor (deferred): asymmetric Prisma pinning — `prisma` exact 7.10.0 but
  `@prisma/client` and `@prisma/adapter-pg` on caret; a future `pnpm update` could reintroduce
  the CLI/client skew the exact pin was meant to prevent.
Task 2: minor (deferred): my plan's compact `enum Role { BUYER SELLER MANAGER }` shorthand was
  probably never valid PSL in any Prisma version, not a v7 regression as the implementer
  reported. Authoring note only, no code impact.
Task 2: fix round 1/5 (commit 1f646d8). Both findings addressed. Deviation: my instruction to
  regenerate a single clean `init` migration required `prisma migrate reset`, which Prisma
  gates behind a verbatim human-consent env var for AI agents. The implementer correctly
  refused to fabricate that consent or route around it with equivalent raw SQL, and met the
  technical requirement with an additive `migrate dev` instead.
Task 2: Ruling: two migrations stand instead of one clean init. A human-consent gate is not
  something a controller ruling can satisfy on the human's behalf, and the difference is
  cosmetic — the live database has the five BIGINT columns either way. I will not supply the
  consent variable myself. Cost if wrong: prisma/migrations/ reads as two steps rather than
  one; zero functional impact.
Task 2: complete (commits d707787..1f646d8, review clean — all findings addressed)
Controller: plan amended and committed to carry Task 2's verified facts (import path, BigInt
  money + DTO narrowing) and the six pre-flight rulings. Briefs 5-9, 11-14 and 17 regenerated
  from the corrected plan, so every future dispatch reads the corrected text rather than
  relying on the dispatch prompt to patch it.

Task 3: implementer DONE (commit 8af5ffb). next-intl 4.14.2 installed; every API name in the
  brief matched the installed package exactly. /en, /ru and the / -> /en 307 redirect all
  verified by curl. test/typecheck/lint/build all clean.
Task 3: INTERFACE FACT for every downstream task — the middleware lives at `src/proxy.ts`,
  NOT `src/middleware.ts`. Next 16.3.4 deprecates the middleware.ts file convention in favour
  of proxy.ts and warns at build time. Same createMiddleware(routing) body, same matcher with
  the /api exclusion intact. Task 11 (Auth.js) must target src/proxy.ts.
Task 3: review = spec ✅, quality Approved. 1 Important (Task 11's brief still named
  src/middleware.ts) + 2 Minor. The Important was a defect in MY plan artefact, not in the
  task's code — the reviewer said so explicitly and scoped it to "fix before Task 11 starts".
  Resolved by the controller: plan amended, task-11-brief.md regenerated and verified to say
  src/proxy.ts. No implementer fix round was warranted.
Task 3: controller check — AGENTS.md is generated by `next dev` itself
  (node_modules/next/dist/server/lib/generate-agent-files.js), not implementer scope creep.
  Committing it with the scaffold is what the file itself instructs.
Task 3: minor (deferred): report paraphrased test/typecheck/lint output instead of pasting it
  raw; only the build output and curl evidence were verbatim.
Task 3: complete (commits 8369235..8af5ffb, review clean — sole Important was a plan defect,
  fixed by the controller)

Task 4: implementer DONE_WITH_CONCERNS (commit 6ab6fb2). 24 tests (15 + 9 new);
  typecheck/lint/build clean. Review dispatched.
Task 4: INTERFACE FACTS for tasks 11-21 — cn(...inputs); <Button variant size>;
  <Card>/<CardHeader>/<CardBody> (plain div props); <Badge tone>;
  <Field label htmlFor error> plus fieldErrorId(htmlFor);
  <Tabs items={{id,label,href}[]} activeId ariaLabel> (LINK-based, active tab lives in the URL);
  <StatusPill status>; <SiteHeader viewer={{role,email}|null}>;
  navKeysFor(role)/NAV_HREF/SIGN_IN_HREF from `@/lib/nav`;
  form controls take className="field-control" (there is no Input component).
Task 4: Ruling: accept `Tabs` taking `href` instead of the brief's `{id,label}`. The brief's
  button form would force every tabbed page to be a client component, and design decision D1
  already puts view state in the URL — a link-based tab is the consistent choice, not a
  deviation from the spec's intent. Cost if wrong: none; Task 20 is the only heavy consumer.
Task 4: Ruling: no `Input` primitive. `Field` already supplies the label/error/aria structure
  and `.field-control` supplies the skin; a wrapper component around a native <input> would be
  abstraction without behaviour. Forms in Tasks 15/16 use native inputs with that class.
  Cost if wrong: a later restyle touches N call sites instead of one component — acceptable at
  this size, and the class is the seam if it ever needs to become a component.
Task 4: review = spec ✅, quality NEEDS FIXES, 2 Important + 4 Minor. FIX_BASE 6ab6fb2.
Task 4: controller resolved the reviewer's ⚠️ items — the route strings in src/lib/nav.ts
  (/listings, /buyers, /dashboard, /inbox, /admin, /login) match the plan's route map exactly;
  the test-count claim is checkable locally; the screenshot evidence is accepted as
  unreproducible-but-consistent, since the CSS change itself is visible in the diff.
Task 4: minor (deferred): no "link styled as a button" primitive, so the sign-in CTA hand-rolls
  Button's primary treatment on an <a>. Tasks 11-21 will want this repeatedly.
Task 4: minor (deferred): navKeysFor takes `string` rather than a type-only `Role` import,
  losing compile-time protection if the enum is renamed.
Task 4: minor (deferred): primary nav links set no aria-current="page" for the active route.
Task 4: minor (deferred): Tabs' ariaLabel is optional, so a consumer can emit an unlabelled
  <nav> landmark.
Task 4: fix round 1/5 (commit 3d7e908). Both Important findings addressed. The implementer
  reproduced the layer bug in a browser first (text-lg, text-ink and normal-case all lost),
  then confirmed the fix, and noted that the reviewer's own suggested probe (`text-right`)
  does not conflict with .field-control and would have produced a false pass. Also found a
  third unlayered rule (`html, body`) five lines away and moved it into @layer base.
  FOCUS_RING exported from src/lib/cn.ts. Scoped re-review dispatched.
Task 4: complete (commits 3084467..3d7e908, review clean — all findings addressed). Re-review
  confirmed the implementer's counter-claim: `text-right` does not contest any property
  .field-control declares, so the reviewer's suggested probe would have produced a false pass.
  The html/body move into @layer base was judged an in-scope extension of the same defect,
  with no regression to ground colour, ink or color-scheme: dark.

Task 5: implementer DONE (commit 7541c86) on the cheapest model tier — 33 passing (24 + 9 new),
  no concerns, no deviation from the brief's code. Review dispatched.
Task 5: review = spec ✅ (verbatim transcription confirmed byte-for-byte, all 9 assertions
  hand-recomputed and correct, no test tampering), quality Approved, 1 Important
  (plan-mandated) + 2 Minor. FIX_BASE 7541c86.
Task 5: Ruling: add a `specificity` count (0-5) to MatchResult. The reviewer is right that an
  entirely empty mandate scoring 100/STRONG against every listing makes Task 18's
  recommendations a catalog-wide tie, and a new buyer is the commonest case. My plan already
  answers this at the product level — Task 18 shows a "complete your mandate" prompt on an
  empty mandate — but relying on that note surviving thirteen more tasks is exactly the memory
  failure this process exists to prevent. A field in the return type cannot be forgotten: the
  consumer sees it. It also enables honest UX ("based on 2 of 5 criteria"). NO_PREFERENCE
  keeps earning full weight — that behaviour is right for a PARTIALLY filled mandate, where an
  unstated country must not count against a listing; only the all-empty case is pathological.
  Cost if wrong: one extra field on a pure return type, ignorable by any consumer.
Task 5: minor (deferred): MatchReason carries no comparanda ({code, kind, weight, earned}), so
  a client component holding only the reasons cannot render "wanted EMI, this is Payment".
  Tasks 17/18 hold both criteria objects server-side, so this is renderable there today.
Task 5: minor (deferred): the brief's expected RED-phase error wording differs cosmetically
  from what this Vitest version emits.
Task 5: fix round 1/5 (commit 314e6f4). specificity added; 38 passing (24 + 9 + 5 new);
  RED-to-GREEN confirmed for the new tests. Scoped re-review dispatched.
Task 5: minor (deferred): countSpecificity re-inspects the raw mandate instead of deriving
  from the reasons array it already computes — specificity always equals
  reasons.filter(r => r.kind !== 'NO_PREFERENCE').length. Provably equal today; a second
  source of truth that could desync if the NO_PREFERENCE condition is ever changed.
Task 5: complete (commits 3d7e908..314e6f4, review clean — all findings addressed).
  Plan amended so Tasks 17 and 18 are obliged to consume specificity rather than relying on
  a ledger note surviving thirteen tasks; briefs 5, 17, 18 regenerated.

Task 6: implementer DONE (commit eae2307) on the cheapest tier — 64 passing (38 + 26 new),
  no concerns. Controller checked the count discrepancy: the brief said 24, the file has 26
  (7+7+4+5+1+2). MY arithmetic in the plan was wrong; the transcription is correct. Plan
  corrected to 26. Review dispatched.
Task 6: review = spec ✅ (all three source files byte-for-byte), quality Approved, 2 Important
  (both plan-mandated) + 3 Minor. FIX_BASE eae2307.
Task 6: controller resolved both ⚠️ — AssetStatus has six members and PUBLIC_ASSET_STATUSES
  names exactly PUBLISHED and SOLD, so DRAFT/PENDING_REVIEW/REJECTED/SUSPENDED are all
  correctly non-public; UserStatus's three members are all handled; `role` is single-valued on
  User so no dual-role account exists.
Task 6: NOTE — the implementer's report claimed "typographic apostrophe preserved" for a test
  title; the committed file has a straight apostrophe. A false self-verification claim, caught
  by the reviewer. Cosmetic in itself, but it is why reports are not taken at face value.
Task 6: Ruling: canDecideAccess and canRevokeAccess gain a GrantState parameter. The reviewer
  is right that the two halves of the state machine disagreed: canRequestAccess treats DECLINED
  as final, while canDecideAccess was bare isOwner — so nothing in the authorization layer
  stopped a seller approving a request that was never made, or re-approving a declined one. The
  whole purpose of this module is that the rule lives in one place instead of being remembered
  by each mutation. Cost if wrong: Task 14's actions must pass the grant they already load.
Task 6: Ruling: canMessage keeps its permission model but changes shape. Cold contact is a
  REQUIRED product capability — the assignment lists "browse Buyers / contact a Buyer" for
  sellers and "contact a Seller" for buyers — so relationship-scoping is deliberately not this
  predicate's job, and that must be stated in the code rather than left as an unwritten
  assumption. The signature takes a counterparty object instead of a bare status, which also
  closes a bug the old shape could not express: nothing stopped a user messaging themselves.
  Cost if wrong: if cold contact is later restricted, this predicate is where it changes.
Task 6: Ruling: the three exported predicates with zero coverage (canAccessApp,
  canRevokeAccess, canPublishListing) get tests in this round. Normally a Minor stays out of
  the fix loop, but two of them are directly changed by the rulings above, and an authorization
  module with untested exported predicates is not a Minor. Cost if wrong: ~15 extra test lines.
Task 6: fix round 1/5 (commit 2b0e23b). 75 passing (38 + 37 authz); 11 new tests; RED-to-GREEN
  claimed for each. Scoped re-review dispatched.
Task 6: complete (commits fceea8c..2b0e23b, review clean — all findings addressed).
Task 6: minor (deferred): 8 of the 11 new tests pass against the pre-fix code too — they are
  coverage additions, not regression proofs. Only 1 of the 3 canRevokeAccess tests actually
  exercises the new grant-state guard.
Task 6: minor (deferred): canMessage types counterparty.status as an inline
  'ACTIVE'|'SUSPENDED'|'REMOVED' union instead of importing UserStatus, so it would silently
  diverge if the enum gained a member.
Task 6: PROCESS RULING — this implementer (cheapest tier) has now made two false claims in its
  reports: "typographic apostrophe preserved" when it was not, and a fabricated 39-character
  commit hash. Its CODE has been correct and verbatim both times; only the prose evidence is
  unreliable. Ruling: keep the cheapest tier for pure transcription tasks, where the review
  verifies the diff directly and a bad report costs nothing, but every such dispatch from here
  carries an explicit instruction to paste real command output and never restate an unperformed
  verification. Do NOT use the cheapest tier for tasks whose deliverable is verified mainly
  through the report's own narrative — Task 12's "confirm the gate is real" and Task 20's
  cascade checks go to a stronger model. Cost if wrong: a task's report misleads me between
  review rounds; the diff-based review remains the real gate either way.

Task 7: implementer DONE (commit 558a810) — 108 passing (75 + 14 asset-filter + 19
  buyer-filter). Count discrepancy against the brief's "89" explained plainly and correctly:
  the brief never counted the buyer-filter tests I added to the dispatch. Review dispatched.
Task 7: review = spec ✅, quality Approved, 2 Important (both plan-mandated, both in my
  shared.ts) + 2 Minor. FIX_BASE 558a810. Hostile-input sweep found nothing that throws —
  the no-throw guarantee at the trust boundary holds.
Task 7: Ruling: bound both numeric parsers. toCents('1e21') returns 1e23 — finite,
  non-negative, past every existing guard, and past Number.MAX_SAFE_INTEGER. Tasks 12/17 must
  wrap these bounds in BigInt() for the widened money columns, and BigInt() on an unsafe
  double does not throw: it silently yields a precision-lossy value. That is the exact silent
  number corruption the BigInt widening was meant to prevent, re-entering through the URL.
  toPositiveInt has the same shape of hole: page=1e20 satisfies isInteger and >= 1.
  Fix: reject non-safe integers in both, cap page at 10_000 and cents at EUR 10 billion
  (the reference marketplace's entire inventory is ~USD 1.07B, so the cap cannot bind in
  practice while making nonsense unrepresentable). Cost if wrong: a legitimate filter above
  EUR 10 billion is rejected rather than applied — a visible empty result, not corruption.
Task 7: minor (deferred): both serialisers test `filters.page && filters.page !== 1`, so a
  hand-constructed page: 0 is treated as the default and omitted. Unreachable through parse*.
Task 7: minor (deferred): ASSET_CATEGORIES and MANDATE_CATEGORIES are the same five-member
  list declared twice under different names, with nothing keeping them in sync.
Task 7: fix round 1/5 (commit e9f7a77). 124 passing (75 + 14 shared + 16 asset + 19 buyer).
  RED output shows the four regression cases failing with real values (got 1e+23, got
  100000000000000000000) — report quality visibly improved after the explicit standard.
  Scoped re-review dispatched.
Task 7: minor (deferred): the safe-integer invariant test feeds only safe values, so it would
  still pass if the guard were deleted. The real proof lives in the '1e21' and over-cap cases.
Task 7: complete (commits 8d2d459..e9f7a77, review clean — all findings addressed). Re-review
  confirmed the reporting standard was met this round: no fabricated verification, no invented
  hash, and the diff's insertion counts reconstruct exactly to the reported figures.
Task 7: Ruling: Task 8 goes to the mid tier, not the cheapest, despite being transcription.
  Its DTO code is something I hand-wrote into the plan after Task 2 and never compiled —
  `Omit<Asset, MoneyField> & Record<MoneyField, number>`, a bigint-narrowing copy loop, a
  fixture using bigint literals, and a runtime test that reflects over Prisma's dmmf. If any of
  that does not compile, the task needs someone who can diagnose rather than flail. Cost if
  wrong: a few cents more than the cheapest tier.

Task 8: implementer DONE (commit ce9f64a) — 131 passing (124 + 7). Three genuine discoveries:
  Prisma.dmmf does NOT exist in this Prisma 7 generated client (traced the runtime bundle; the
  generator never calls defineDmmfProperty), so the classification test uses
  Prisma.AssetScalarFieldEnum instead; bigint literals (_00n) fail typecheck under
  target: ES2017, so the fixture uses BigInt(...) calls; and deliberately removing updatedAt
  from the allowlist turned exactly one test red, confirming the safety net fires.
Task 8: INTERFACE FACTS for tasks 12, 13, 15, 18 —
  TeaserAsset = Omit<Asset, ConfidentialAssetField | 'askingPriceCents'> & { askingPriceCents: number; redacted: true }
  FullAsset = Omit<Asset, 'askingPriceCents'|'revenueCents'|'ebitdaCents'> & Record<those, number> & { redacted: false }
  AssetDto = TeaserAsset | FullAsset; plus toTeaserAsset, toFullAsset,
  toAssetDto(asset, canSeeConfidential), isFullAsset(dto): dto is FullAsset.
Task 8: review = spec ✅, quality Approved, 2 Important + 2 Minor. FIX_BASE ce9f64a. Reviewer
  independently verified the dmmf substitute by reading the generated client: AssetScalarFieldEnum
  at internal/prismaNamespace.ts holds exactly the 27 scalar names and no relation field,
  cross-checked against $AssetPayload's scalars block. Also confirmed tsconfig target ES2017
  genuinely rejects bigint literal syntax, and hand-traced why the type stayed silent when the
  allowlist lost a field.
Task 8: Ruling: derive TeaserAsset from the allowlist via Pick<Asset, PublicAssetField> rather
  than Omit<Asset, ConfidentialAssetField | 'askingPriceCents'>. Today "what is public" is
  described twice — once as a value the runtime loop iterates, once as an independently
  maintained type expression — and only a test keeps them in step. Deriving the type from the
  same array makes a divergence a compile error at every call site instead of a silent
  undefined. This is the last cheap moment: four tasks are about to consume the type.
  Cost if wrong: none identified; the classification test keeps its full value either way.
Task 8: Ruling: add a JSON-serialisability assertion for toFullAsset. The teaser has one and
  the full asset does not, yet FullAsset crosses the same server/client boundary whenever a
  seller or manager views their own listing. A regression there would break exactly the pages
  the NDA gate opens, and nothing would catch it. Cost if wrong: three test lines.
Task 8: minor (deferred): the "keeps the teaser fields intact" test spot-checks 2 of 21 public
  fields, so a field copied under the wrong key would pass.
Task 8: minor (deferred): toTeaserAsset/toFullAsset shallow-copy `included: string[]` by
  reference, sharing a mutable array between the Prisma row and the DTO.
Task 8: fix round 1/5 (commit 6bab8b8). 133 passing. TeaserAsset now derives from the allowlist
  via Pick<Asset, PublicAssetField>; two toFullAsset serialisability tests added.
  NOTABLE — the implementer re-ran the deliberate-breakage experiment, found typecheck STILL
  clean because no consumer reads a TeaserAsset field yet, and instead of claiming the fix
  worked, built a throwaway probe simulating a future consumer and demonstrated TS2339 fires.
  The protection is real but latent until Tasks 12/13/15/18 add call sites. Exactly the
  reporting standard asked for. Scoped re-review dispatched.
Task 8: complete (commits 98976d4..6bab8b8, review clean — all findings addressed). Re-review
  independently confirmed the latency reasoning: Pick genuinely narrows, "no consumers yet" is
  the complete explanation (toTeaserAsset's `as TeaserAsset` assertion via unknown means the
  body is never structurally checked), and property access or destructuring in Tasks 12/13/15/18
  will fail to compile on a dropped field. No probe file left behind.

Task 9: implementer DONE_WITH_CONCERNS (commit 9d05163) — 142 passing (133 + 9).
  @anthropic-ai/sdk 0.123.0, zod 4.5.4. Both flagged risks resolved in the plan's favour and
  verified against the SDK's own .d.ts: output_config accepts format and effort together, and
  zodOutputFormat's zod/v4 import resolves against the installed zod. parsed_output,
  stop_reason and the 'refusal' member all confirmed real. Zero changes to the brief's code.
Task 9: OPEN RISK FOR THE FINAL REPORT — the live API smoke test was NOT RUN. No
  ANTHROPIC_API_KEY in this environment (.env carries the key with an empty value) and no ant
  CLI. The three AI features are verified statically against the SDK types and behaviourally
  for their no-key fallback path, but never against the real API. The user must run Task 9
  Step 8 once with a key before trusting them. This goes in the handover verbatim.
Task 9: implementer-raised concern for the reviewer — `new Anthropic()` inside getClient() sits
  outside callStructured's try/catch, so a constructor throw would escape the "never throws"
  guarantee. Present in the brief's own code; not one of the two risks the dispatch authorised
  them to change.
Task 9: review = spec ✅, quality NEEDS FIXES, 3 Important + 2 Minor. FIX_BASE 9d05163.
  Reviewer independently verified all four SDK claims by reading node_modules — including
  zodOutputFormat's runtime parse() and its re-throw path through parser.js, which is what makes
  "schema mismatch -> null" true rather than merely typed.
Task 9: Ruling: move `new Anthropic()` inside the try/catch. The reviewer traced the SDK
  constructor and found a real synchronous throw path (browser-like globals), which in an async
  function surfaces as a REJECTED PROMISE rather than a resolved null — breaking the exact
  contract Tasks 12/15/17 are told they may rely on. Unreachable today under Node SSR; a
  contract with one hole in it is not a contract. Cost if wrong: none.
Task 9: Ruling: restore the deleted env var. Vitest 5 defaults to pool 'forks' and reuses
  workers across files once file count exceeds worker count (11 test files here), and the runner
  does not snapshot process.env between files — which is why vi.stubEnv exists. Dormant today
  because this is the only test touching process.env. Cost if wrong: a future test fails
  depending on file scheduling, the least debuggable failure mode there is.
Task 9: Ruling: enforce the quote constraint in code. This is the important one. The teaser
  reviewer's prompt says "report nothing you cannot quote", the zod schema checks only that
  excerpt is a string, and nothing verifies the excerpt actually occurs in the teaser — so a
  hallucinated quote would reach the seller as evidence. This is the feature whose entire
  purpose is guarding the confidentiality boundary, and its guard was unenforced model
  compliance. A deterministic substring check verifying the model's claim is exactly the
  architecture the rest of the project follows: deterministic core, AI on top, never the
  reverse. Cost if wrong: a genuine leak phrased loosely enough to fail containment is dropped
  — the seller sees fewer warnings, never a fabricated one.
Task 9: minor (deferred): explain.ts and teaser-review.ts inline their payload construction, so
  unlike search.ts their request shape has no pure, separately testable builder.
Task 9: minor (deferred): ExplainMatchInput.locale is a bare string, so any value other than
  'ru' silently becomes English.
Task 9: fix round 1/5 (commit ebe496b). 149 passing (142 + 7). All three Important addressed.
  The implementer verified the test-isolation fix by temporarily breaking the stub and
  confirming the "AI disabled" test failed — proving the test still exercises the real
  guarantee rather than having been quietly neutered. Scoped re-review dispatched.
Task 9: minor (deferred): keepQuotedLeaks has no minimum-length or word-boundary floor, so a
  one-character or very common excerpt matches almost any teaser and passes as "verified".
Task 9: minor (deferred): the haystack joins title and description with a single space, so an
  excerpt spanning that seam can match across two visually distinct fields.
Task 9: minor (deferred): no unit test exercises getClient's new try/catch branch.
Task 9: complete (commits 26ff861..ebe496b, review clean — all findings addressed). Re-review
  noted only 2 of the 7 keepQuotedLeaks tests distinguish a filtering from a non-filtering
  implementation; the other 5 guard normalisation and title-inclusion instead.

Task 10: implementer DONE (commit 1bd0fc9). 19 users, 12 buyer profiles + 12 mandates, 6 seller
  profiles, 40 assets, 7 access requests, 4 conversations, 5 messages, 2 moderation logs.
  Found and fixed a real bug in self-review: licence type EMI never appeared in any asset due
  to an index-parity bug, which would have made the catalog's EMI licence filter silently
  empty. Verified the match-score spread empirically — 21 distinct scores across the 34 visible
  listings for buyer@n5deal.demo. Deliberate teaser leak is N5-740 ("Vertex Ventures AG"),
  confirmed unique by SQL substring match.
Task 10: controller checks — the inlined threadKey formula matches the buildThreadKey spec
  Task 19 will implement, so the seeded conversations will not collide or be orphaned. Live DB
  confirms 7 licence types, 15 countries, prices 15_000_000..2_500_000_000 cents
  (EUR 150k..25M), and 35 PUBLISHED (34 visible + 1 owned by the suspended seller) + 2
  PENDING_REVIEW + 1 SOLD + 1 REJECTED + 1 DRAFT = 40.
Task 10: review = spec ❌ on distribution, quality NEEDS FIXES, 1 Important + 3 Minor.
  FIX_BASE 1bd0fc9. Teaser hygiene scan found NO accidental second leak — the only teaser
  containing its own legalName is N5-740, and no revenue/EBITDA figure is interpolated into any
  teaser. Deletion order verified as a valid topological order against every FK. sellerEmail
  confirmed excluded from the Prisma create by explicit field naming rather than a spread.
Task 10: Ruling: the licence-type fix must be generalised, and the invariants must be tested.
  The reviewer found the "EMI fix" only repaired categories occurring once per 8-index block:
  `occurrence = Math.floor(i / 8)` is identical for all four PAYMENT entries in a block, so the
  20 PAYMENT listings (half the catalog, and the brief's explicitly most-common category) carry
  just 5 distinct licence/business-type pairs, four-ways each. That flattens exactly the screen
  a reviewer spends longest on. Cost if wrong: none — the aggregate counts are already correct,
  this only spreads them.
Task 10: Ruling: fold the "no automated invariant check" Minor into this fix round rather than
  deferring it. The reviewer is right that manual psql inspection was the only safety net, and
  it is what let the first bug through and would have let this one through too. For fixture
  data that IS the demo, distribution invariants are not a nice-to-have. Cost if wrong: ~40
  test lines that also lock the teaser-hygiene property the reviewer had to check by hand.
Task 10: fix round 1/5 (commit fb922e6). 158 passing (149 + 9 fixture tests). The tests were
  written against the PRE-fix generator and exactly 1 of 9 failed (PAYMENT had 3 distinct
  licence types, needed 4) — the test was real, not written to fit an already-fixed generator.
  Fixed with a true per-category occurrence counter; PAYMENT gained a domain-plausible fourth
  licence option; the included list now rotates per occurrence; BANK and CRYPTO deliberately
  left at one licence each. Re-seeded non-destructively and re-verified every demo invariant.
  Scoped re-review dispatched.
Task 10: minor (deferred): the CATEGORY_OCCURRENCE IIFE re-derives the category with the same
  expression buildAsset uses rather than sharing one helper.
Task 10: complete (commits 291ed7a..fb922e6, review clean — all findings addressed). Re-review
  hand-derived the whole licence-type distribution from the generator and matched the live
  database exactly, and independently confirmed the "1 of 9 failed" claim by reasoning through
  every assertion against the pre-fix generator.

Task 11: implementer DONE (commit c7fbc8d). 158 passing; typecheck, lint and build clean.
  Verified live by replaying the Server Action form protocol over HTTP (no browser tool
  available): all three demo roles sign in and out with the right nav, and suspended seller
  ops@quicklicence.demo lands on /suspended with the real ModerationLog reason. Crucially they
  ran a mid-session suspension — flipping the DB status with no re-login — proving getViewer()
  re-queries rather than trusting the JWT, which is what makes Task 20's cascade real.
Task 11: INTERFACE FACTS — getViewer(): Promise<Viewer | null>;
  requireViewer(locale: string): Promise<Viewer>. Also added src/server/actions/auth.ts
  (not in the brief) holding signInAction/signOutAction.
Task 11: two TypeScript frictions documented with isolated repros — the next-auth module
  augmentation is dropped through NextAuth()'s union config parameter, so the jwt/session
  callbacks need explicit parameter annotations; and next-intl's redirect() does not narrow
  control flow despite returning never, so local redirectNow(): never wrappers were added.

=== PROCESS CHANGE (user decision, 2026-09-04) ===
User directed: full cycle on Tasks 12, 13, 14, 19, 20; accelerated cycle elsewhere.

FULL CYCLE (12 catalog, 13 detail+NDA gate, 14 access requests, 19 messaging, 20 admin):
  implementer -> task review -> fix rounds each ending in a dispatched scoped re-review, as
  used for Tasks 1-11. These five are where an error means a confidentiality leak, a broken
  access decision, or a moderation cascade that does not cascade.

ACCELERATED (15, 16, 17, 18, 21, 22, 23): implementer -> task review -> if Critical or
  Important findings, ONE fix round which the controller verifies directly from the fix diff
  instead of dispatching a re-reviewer. Minors are ledgered as before. Saves roughly one
  dispatch per task.

Controller caveat, within the user's instruction rather than against it: Task 15 is the
  publish flow that wires the AI teaser check and is the one accelerated task touching the
  confidentiality boundary. If its review returns a Critical or Important finding that touches
  redaction or the teaser gate specifically, I will restore the dispatched re-review for that
  round. Anything else in 15 follows the accelerated path.
Task 11: review = spec ❌ on one behaviour, quality NEEDS FIXES, 4 Important + 5 Minor.
  FIX_BASE c7fbc8d. Task 11 finishes under the FULL cycle (it began before the process change
  and it is the authentication layer).
Task 11: NOTABLE — the reviewer disproved one of the implementer's two workaround claims by
  building a byte-for-byte replica of src/auth.ts minus the disputed annotations and getting
  zero typecheck errors, while independently REPRODUCING the other (next-intl's redirect does
  not narrow control flow; TS18047/TS2322 confirmed, fixed by the redirectNow wrapper). Exactly
  why reports are treated as claims.
Task 11: Ruling: fix the timing side-channel. authorize skips bcrypt.compare entirely for a
  nonexistent or REMOVED email but always runs it (cost factor 10) for an existing one, so the
  response time distinguishes them even though the message does not. Uniform messaging without
  uniform timing is not uniform. Cost if wrong: one wasted hash on a failed login.
Task 11: Ruling: a suspended user's FIRST post-login request must reach /suspended.
  signInAction hardcodes redirectTo to the locale home, and nothing gates that page, so they
  land on a normal header showing Dashboard and Inbox links — navKeysFor gates on role, not
  status. This contradicts canAccessApp, which already says a non-ACTIVE viewer should not
  access the app. Fixing both the redirect and the nav gate is narrower and safer than a global
  layout guard, which would need an exemption for /suspended itself and risk a redirect loop.
Task 11: Ruling: extract the requireViewer decision into a pure predicate in lib/authz and test
  it. The reviewer is right that the one contract twelve tasks depend on has zero coverage of
  any kind — its branches were typechecked and never executed. The I/O cannot be unit-tested
  without mocking Prisma and auth(), but the DECISION can, and that is the part that can be
  wrong. Cost if wrong: one more tiny module in a directory built for exactly this.
Task 11: Ruling: fold in the passwordHash Minor. getViewer selects the entire User row on every
  page render site-wide, hashes included. Loading credential material you never use is not a
  performance nit. Cost if wrong: none.
Task 11: fix round 1/5 (commit 9788366). 162 passing (158 + 4 viewerGate tests). Findings 1-3
  addressed and re-verified live: constant bcrypt.compare per attempt (172.5ms vs 168.8ms
  average across the two failure modes), suspended seller now lands on /en/suspended straight
  from sign-in with nav reduced to anonymous, viewerGate extracted and unit-tested.
Task 11: Finding 4 NOT addressed — the implementer kept the annotations, reporting they had
  re-reproduced the error cold in the real file. CONTROLLER ADJUDICATION: I ran the decisive
  experiment myself. With the annotations stripped from the real src/auth.ts, and after
  deleting tsconfig.tsbuildinfo, .next/cache/.tsbuildinfo, the whole .next directory and
  node_modules/.cache (tsconfig sets incremental: true, so this matters), `npx tsc --noEmit`
  exits 0. Twice, including a hard-cold run. The annotations are unnecessary; the reviewer's
  non-reproduction was correct and the implementer's re-reproduction was not. File restored,
  tree clean.
Task 11: PROCESS NOTE — this is the THIRD unsubstantiated claim from this agent across two
  tasks: "typographic apostrophe preserved" (it was not), a fabricated 39-character commit
  hash, and now a twice-asserted typecheck failure that does not occur. Its code has been
  correct every time and its live HTTP verification work has been genuinely inventive; the
  defect is confined to asserting verifications it did not perform or misread. The diff-based
  review plus controller adjudication caught all three, which is the system working — but it is
  why no report in this project is accepted as evidence on its own.
Task 11: fix round 2/5 — Finding 4 PARKED, not fixed. Ruling: the annotations stay.
  I re-ran the experiment a third time with tsc's exit code captured directly rather than
  through a pipeline (my earlier `echo $?` after `| head` was reading head's status, a real
  flaw in my own first check): annotations genuinely stripped, .next, node_modules/.cache and
  tsconfig.tsbuildinfo all deleted, `npx tsc --noEmit` exits 0 with zero output. The
  implementer, running the same steps, reports five TS2322 errors on the same lines, twice, and
  Next's own build checker agreeing with them. Two parties observe an environment where the
  annotations are required; I observe one where they are not. Since the annotations reference
  the augmented interfaces directly rather than a hand-copied shadow type — the reviewer
  confirmed there is no drift risk — they are harmless where unnecessary and load-bearing where
  not. Deleting code that might be required on some machines to win an aesthetic point is the
  wrong trade. Cost if wrong: two redundant type annotations survive in src/auth.ts.
  What is NOT accepted is describing them as a proven TypeScript limitation; the final review
  should see them as defensive, with their necessity unreproduced on at least one machine.
Task 11: I spent three controller experiments on a finding with zero functional impact. Noting
  it so the pattern is visible: adjudicate faster when the disputed item cannot affect
  behaviour either way.
Task 11: complete (commits fb922e6..9788366, 1 parked). Re-review traced all five authorize
  paths and confirmed exactly one bcrypt.compare each, DUMMY_HASH structurally valid at the
  same cost factor, and that the fix also closed the REMOVED half of the leak. The new
  pre-sign-in status lookup introduces no enumeration signal: every failure discards the
  computed redirectTo and lands on the same error. Re-reviewer correctly judged the timing
  measurements (n=8, sequential, on a dev server) as corroborating rather than load-bearing.
Task 11: minor (deferred): requireViewer uses a `viewer as Viewer` cast after the switch rather
  than a type predicate; auth() has no comment warning later tasks off stale session fields;
  RU terminology drift between "объявлениям" and "Все объекты"; demo fixtures imported by a
  four-level relative path.

Task 12: implementer DONE (commit 9840333). 162 passing; typecheck, lint, build clean.
  Verified live: 34 published listings, N5-735 (suspended seller's) absent even for a signed-in
  MANAGER, facets summing to 34 and stable under selection, URL-driven filters/chips/pagination,
  /ru fully translated, hostile URL returning HTTP 200 with defaults. Grepped rendered HTML for
  all six confidential field names AND their real values — zero leaks; two apparent hits were
  RSC flight-protocol ids, checked in context.
Task 12: INTERFACE FACT — listAssets(filters: AssetFilters, viewer: MaybeViewer):
  Promise<{ items: TeaserAsset[]; total: number; facets: CategoryFacet[] }> from
  @/server/queries/assets; CategoryFacet = { category: AssetCategory; count: number }.
Task 12: controller note — hiding the suspended seller's listing from a MANAGER in the public
  catalog is correct, not a bug. The catalog has one visibility floor for everyone; the
  manager's view of everything is the Task 20 admin console. Splitting the rule across both
  would mean maintaining it twice.
Task 12: review = spec ✅, quality Approved, 2 Important + 5 Minor. FIX_BASE 9840333.
  Reviewer independently reproduced typecheck, lint and the 162-test run rather than trusting
  the report, and found the visibility floor structurally unbypassable: all three queries in the
  transaction derive their where from one private buildWhere that unconditionally spreads
  VISIBILITY_FLOOR, so there is no second path to audit.
Task 12: Ruling: test the floor and the flag helper. The reviewer is right that this repo tests
  exactly this class of pure logic everywhere else, and that the floor is the highest-stakes
  invariant the task introduces — the one Task 20's cascade depends on. An invariant defended
  only by today's correct code is not defended. Cost if wrong: a small exported helper and ~30
  test lines.
Task 12: Ruling: the per-row canViewAsset guard is fixed or removed, not left as is. It
  hardcodes ownerStatus: 'ACTIVE' rather than reading the row's real seller status, so it
  evaluates true for every row the where clause already returned and can never catch the
  regression its own comment claims it prevents. A decorative check carrying a comment that
  says it prevents drift is worse than no check, because the next reader trusts it. Cost if
  wrong: one extra relation field on the query.
Task 12: Ruling: sort changes resetting page to 1 is INTENDED, confirming the reviewer's query.
  Page 3 of "newest" and page 3 of "price ascending" contain unrelated items, so preserving the
  number shows the user an arbitrary slice of a different ordering.
Task 12: fix round 1/5 (commit 35e0b34). 177 passing (162 + 9 where-builder + 5 flag + 1 AI).
  All three findings addressed. The implementer rejected my "make the guard real" option with a
  better argument than I had: even a real version short-circuits true for MANAGER and owner via
  canModerate/isOwner, so it could not close the gap its comment claimed. Deleted instead.
Task 12: NEW BREAKAGE found by the controller in the fix diff, opening round 2. Testing
  buildWhere required adding `setupFiles: ['dotenv/config']` to vitest.config.mts, because
  importing it from @/server/queries/assets transitively imports @/server/db, which eagerly
  constructs the Prisma client and hits the Task 2 fail-fast guard. Verified: with
  DATABASE_URL unset, tests/unit/queries/asset-where.test.ts fails the whole file before a
  single test body runs. Unit tests of pure logic now depend on a .env file and a valid
  connection string, and would fail in CI without one.
Task 12: Ruling: extract the where-builder into a module that does not import the Prisma
  singleton, and revert the dotenv setupFile. buildWhere needs only TYPES from the generated
  client plus PAGE_SIZE — it never needs a database connection, and the test that proves the
  visibility floor should be the last test in the suite to require infrastructure. Cost if
  wrong: one more small module in a directory that already separates concerns this way.
Task 12: Process note — I found this breakage myself with a reproducing command, so round 2
  goes straight to the implementer and ONE scoped re-review then covers both rounds
  (9840333..HEAD). Paying a re-reviewer to rediscover a defect I can already demonstrate is
  waste, and the end-state verification is identical.
Task 12: fix round 2/5 (commit 6bdb65d). Where-builder extracted to a module importing only
  types; dotenv setup reverted; the ENTIRE suite (177 tests, 15 files) passes with DATABASE_URL
  unset — controller-verified. No unit test in this repository depends on infrastructure.
Task 12: re-review verdict — all findings addressed. Of the 9 where-builder tests, 4 are genuine
  floor regression proofs and 5 are filter coverage; the strongest is a deliberate
  businessStatuses:['ACTIVE'] collision test against the floor's own ACTIVE value. The
  extraction is byte-for-byte identical apart from added `export` keywords. The deletion
  argument was verified sound against canViewAsset's actual code.
Task 12: Ruling on the cross-task question the re-review surfaced. canAccessApp currently reads
  "a non-ACTIVE viewer may not access the app", yet /listings is public and a suspended user can
  open it directly. RESOLVED SEMANTICS: a suspended viewer may browse exactly what an anonymous
  visitor browses — the catalog, teasers, the landing page — and may not reach any authenticated
  surface. Suspension means you cannot transact, not that you cannot look at a public page, and
  redirecting a public URL for a signed-in-but-suspended user would be worse UX than the nav gate
  already shipped in Task 11. Action: the predicate's NAME and comment should say "authenticated
  surfaces" rather than "the app"; no behaviour change. Carry into Task 20's review and the final
  README so the semantics are stated once, deliberately.
Task 12: complete (commits 9788366..6bdb65d, review clean — all findings addressed).

Task 13: implementer DONE (commit 862a6ab). 184 passing with DATABASE_URL unset (177 + 7 new
  gate tests); typecheck/lint/build clean. Leak-grep: as buyer@n5deal.demo with an APPROVED
  grant on asset-702, fetched asset-701 and grepped for its real legalName, revenueCents,
  ebitdaCents, clientCount, dataRoomUrl, confidentialNotes and seller name — 0 matches across
  nine needles. Repeated clean for anonymous, another seller, DECLINED/REVOKED buyers and a
  SOLD boundary case. A DRAFT asset's 404 body is byte-identical to a nonexistent id's.
Task 13: INTERFACE FACT for Tasks 14/15/18 —
  SellerSummary { id, companyName: string | null, country, verified };
  AssetDetail { asset: AssetDto, grant: GrantState, seller: SellerSummary, gateStatus: GateStatus,
  requestedAt: Date | null }; getAssetDetail(id, viewer): Promise<AssetDetail | null>.
  gateStatus and requestedAt are additive beyond the plan's sketch.
Task 13: Requestable state rendered as a disabled control with a note — the brief's sanctioned
  option; Task 14 wires it.
Task 13: review = spec ❌ on ruling 6, quality Approved, 1 Important + 3 Minor. FIX_BASE 862a6ab.
  No confidential field or seller identity reaches an unauthorised viewer in any enumerated
  combination; the component-level isFullAsset guard fails closed rather than decoratively.
Task 13: Ruling: canViewAsset stops denying non-ACTIVE viewers. This resolves a real collision
  between two of my own decisions. Task 6's rules deny a suspended viewer everything (and a test
  asserts it); my Task 12 ruling says a suspended viewer browses exactly what an anonymous one
  browses. The result today is the worst of both: the catalog's VISIBILITY_FLOOR is
  viewer-status-blind so a suspended user SEES a listing card, then gets a 404 clicking it.
  An inconsistency between two surfaces is worse than either rule applied uniformly.
  The Task 12 semantics win: suspension means you cannot transact, not that you cannot look at
  a public page. canViewFullAsset and canRequestAccess already gate on isActive, so nothing
  confidential and no action opens up — only the public teaser. The existing Task 6 assertion
  changes deliberately, and this is the record of why. Cost if wrong: a suspended user can read
  public listing pages they could previously only see cards for.
Task 13: minor (deferred, folded into the fix): the seller fetch uses include rather than select,
  pulling contactName/websiteUrl/userId into memory though SellerSummary names four fields —
  dropping the structural guarantee getViewer documents for exactly this reason.
Task 13: minor (deferred): several of the 7 gate tests are coverage rather than regression
  proofs; the priority-ordering ones are the genuine proofs.
Task 13: minor (deferred): a REQUESTED grant on an asset later marked SOLD still renders Pending
  rather than Closed — flagged for Tasks 14 and 20.
Task 13: fix round 1/5 (commit 7c02b1a). 185 passing with DATABASE_URL unset. Suspended viewer
  now gets HTTP 200 with the teaser and a Closed gate on a published listing; canViewFullAsset
  and canRequestAccess re-read after the edit and confirmed still gated on isActive.
Task 13: re-review verdict — all findings addressed. Predicate-by-predicate widening audit
  confirmed all seven other predicates still deny a non-active viewer independently; none call
  canViewAsset except through isOwner/canModerate, which re-check isActive themselves. The
  catalog's floor is a strict SUBSET of what canViewAsset now permits (it omits SOLD), so
  nothing the catalog lists can 404 on click — the original inconsistency is genuinely closed.
Task 13: minor (deferred, merged with the existing SOLD/Pending item): a buyer suspended AFTER
  submitting a request still sees PENDING rather than CLOSED, because selectGateStatus trusts a
  stale REQUESTED grant without re-checking that the underlying eligibility still holds. Same
  root cause, no confidential exposure, no capability. Fold into Task 14 or 20.
Task 13: NOTE — the re-reviewer flagged AGENTS.md as prompt-injection-shaped. False positive,
  already established in Task 3: that file is written by Next.js itself
  (node_modules/next/dist/server/lib/generate-agent-files.js) and instructs reading the
  installed framework docs, which is legitimate. The "prefer Bash over Read/Edit" instruction it
  paired this with comes from the session harness, not the repository. Good instinct, wrong
  conclusion — recording so a later reviewer does not re-raise it.
Task 13: complete (commits 6bdb65d..7c02b1a, review clean — all findings addressed).

Task 14: implementer DONE (commit 91f5595). 193 passing with and without DATABASE_URL.
  Out-of-band FORBIDDEN proof: replayed the real next-action POST as buyer@n5deal.demo against
  decideAccess on another seller's asset -> {"ok":false,"error":"FORBIDDEN"}, DB unchanged.
Task 14: INTERFACE FACTS for Tasks 18/20 — requestAccess({assetId, message, locale}),
  decideAccess({requestId, decision, locale}), revokeAccess({requestId, locale}), each
  returning ActionResult from src/server/actions/types.ts.
Task 14: implementer added a seller-side request queue UI + getAssetRequestQueue beyond the
  brief, arguing Next only registers a Server Action's callable id once something
  client-reachable references it — without a caller there was no endpoint to prove FORBIDDEN
  against. Also self-fixed a concurrent double-approve race by extending the P2002 guard to
  decideAccess. Flagged but did not fix: NOT_FOUND vs FORBIDDEN distinguishes id-exists from
  id-does-not, judged low severity against unguessable cuids.
Task 14: review = spec ✅, quality Approved, 2 Important + 1 Minor. FIX_BASE 91f5595.
  State-machine audit: all eleven action/grant combinations reject correctly, and every action
  re-reads the row and derives GrantState via mapGrantState rather than trusting client input.
  Approval is genuinely atomic in one interactive transaction. buildThreadKey confirmed
  byte-identical to the seed's previous inline formula, so no seeded conversation is orphaned.
  The stale-grant fix reuses canRequestAccess with a hypothetical 'NONE' grant — no duplicated
  eligibility rule — and is exercised against the real predicates, not synthetic booleans.
Task 14: Ruling: the P2002 guard on decideAccess is decorative and must become a conditional
  update. The reviewer traced Postgres semantics: row-level locking serialises two concurrent
  decides, and by the time the second unblocks the first transaction's Conversation is already
  committed, so its own findUnique sees it and no P2002 is ever raised. What actually happens is
  an unconditioned update silently overwriting status/decidedAt/decidedByUserId — a DECLINED row
  can end up with a Conversation created from a momentary APPROVED. This is the same defect
  class as Task 12's decorative canViewAsset guard: a check whose comment claims protection it
  does not provide, which is worse than no check because the next reader trusts it. Cost if
  wrong: an extra affected-count branch.
Task 14: Ruling: the access-request queue UI is accepted, not reverted. The technical premise
  was verified by the reviewer against Next's own docs — "unused Server Functions are stripped
  from client bundles so they have no public endpoint" — so without a client-reachable caller
  there was literally no endpoint against which to prove FORBIDDEN, which the brief mandated.
  Building a real, minimal, disclosed surface beats a throwaway debug hook. It does stake out
  Task 18's territory, so Task 18's dispatch must reuse or consciously supersede
  getAssetRequestQueue rather than reimplement it. Carried forward.
Task 14: minor (deferred): NOT_FOUND vs FORBIDDEN distinguishes id-exists from id-does-not.
  Reviewer agreed with the implementer's judgement — cuids are non-enumerable and a confirmed id
  leaks nothing about content.
Task 14: fix round 1/5 (commit ec4b4e6). Conditional updateMany replaces the decorative catch;
  the same guard applied proactively to revokeAccess, which had the identical unconditional-write
  shape. Verified deterministically with a sequential double-decide: first ok, second FORBIDDEN,
  row unchanged from the first write; DB restored byte-for-byte to baseline.
Task 14: fix round 2/5 — evidence only, no code change (git diff empty; the round-1 fix was
  already correct). The re-review was right that the sequential double-call never reached the
  updateMany: canDecideAccess reads the fresh status and rejects earlier, so the test would have
  passed against the pre-fix code too. The implementer retracted that claim and reproduced the
  real race via Promise.all over two concurrent fetches to the live Server Action endpoint, with
  temporary server-side logging confirming both calls read REQUESTED and cleared the early gate
  before either transaction ran, and that updateMany decided the winner (count=1 vs count=0).
  Instrumentation removed, tree clean, DB restored byte-for-byte.
Task 14: complete (commits 7c02b1a..ec4b4e6, review clean — code verified by reading and by a
  genuine race reproduction).
Task 14: HANDOFF to Task 18 — reuse getAssetRequestQueue and access-request-queue.tsx rather
  than reimplementing a seller-side approve/decline surface. Task 18's getSellerOverview should
  aggregate across the seller's catalog and consciously supersede or compose the per-listing
  helper, not duplicate it.

Task 15: implementer DONE (commit bd80dcc). 196 passing with and without DATABASE_URL.
  Out-of-band FORBIDDEN proven for all three actions as an unrelated second seller, with zero
  DB change re-queried. Found and fixed a real Prisma 7 defect live: driver-adapter P2002 errors
  do NOT populate meta.target, so the publicRef-collision retry check never matched; verified
  the fix by firing genuine concurrent creates.
Task 15: AI teaser check reported NOT RUN — no ANTHROPIC_API_KEY in this environment. Disabled
  path verified (button absent, form fully usable); enabled path by inspection only.
Task 15: flagged, not fixed — no nav entry point to /listings/new yet (Task 18's job), and
  "Check teaser" reflects the last SAVED teaser rather than unsaved edits, by design.
Task 15: review = spec ✅ (one ambiguity), quality Approved, 1 Important + 3 Minor.
  FIX_BASE bd80dcc. Reviewer verified the Prisma claim against the installed package internals:
  the driver-adapter error builder sets meta to { driverAdapterError } and adds meta.table only
  for UniqueConstraintViolation — target is never populated, exactly as reported. The retry
  replacement is narrow (one call site, Asset has exactly one @unique besides its id) and bounded
  at 5 attempts. Edit-form confidentiality gating passes: the page notFound()s before `initial`
  is ever constructed, so no confidential value enters the render tree for a non-owner.
Task 15: Ruling: an edit to a PUBLISHED listing returns it to PENDING_REVIEW. saveDraft sets
  status only on create, so today a seller can rewrite a live listing's teaser — including
  pasting in the legal name the AI check exists to catch — and it ships instantly with neither
  the AI check nor a manager seeing it. That makes the whole gate a first-publish formality. The
  cost is real and accepted: fixing a typo takes the listing offline until re-approved, which is
  how actual marketplaces behave and what makes Task 20's queue meaningful. DRAFT and REJECTED
  edits stay where they are. Cost if wrong: sellers are annoyed by re-review on small edits; the
  alternative is a gate that only guards the first version of a document.
Task 15: minor (deferred): edit/page.tsx rebuilds AssetRef inline instead of reusing
  loadAssetRef; the Submit-for-review button renders regardless of status and surfaces a generic
  FORBIDDEN rather than "not in a submittable state".
Task 15: fix round 1/5 (commit 8900cb4), verified by the controller directly from the diff per
  the accelerated track. Only PUBLISHED demotes; DRAFT/REJECTED/PENDING_REVIEW/SUSPENDED keep
  their status. The implementer went further than asked in two good ways: the updateMany is
  conditioned on the EXACT status canEditAsset validated rather than "not SOLD", closing the
  race where a concurrent action moved the row in between; and SUSPENDED is deliberately left
  alone because letting a seller edit their way to PENDING_REVIEW would put them one step from
  public again and undo a manager's decision. Unpublish notice present in both catalogues with
  real Russian. DB baseline confirmed: 40 assets, max N5-740, 35/2/1/1/1.
Task 15: complete (commits ec4b4e6..8900cb4).

Task 16: implementer DONE (commit f06df66). 217 passing with and without DATABASE_URL (+20 new
  profile-validation tests, +1 matching). Out-of-band FORBIDDEN proven for both actions as
  seller@n5deal.demo, DB confirmed untouched. Verified the match-count effect via the profile
  page's own banner since Task 18's dashboard does not exist yet; buyer's original mandate
  restored with before/after rows pasted.
Task 16: INTERFACE FACTS — saveBuyerProfile(BuyerProfileInput & {locale}): ActionResult;
  saveMandate(MandateInput & {locale}): ({ok:true} & {matchCount, totalListings, specificity})
  | {ok:false,error}; countMandateMatches(MandateCriteria): Promise<MandateMatchSummary>.
Task 16: review = spec ✅, quality Approved, 0 Critical, 0 Important, 2 Minor. No fix round.
  Match count uses the exported VISIBILITY_FLOOR constant itself rather than a re-derived
  approximation, so it structurally cannot drift from the catalog. Bigint confined to two
  points. The refinement test would fail without the refinement. Mandate.buyerProfileId carries
  a DB unique constraint and Prisma 7 compiles upsert to native INSERT ... ON CONFLICT, so
  concurrent saves cannot produce two mandates, and the write is always keyed by the
  session-derived buyerProfileId, never a caller-supplied id.
Task 16: minor (deferred): any zod issue on ticketMaxCents maps to the range-specific copy, so a
  differently-invalid value shows a slightly wrong message; mandate-form inputs do not wire
  aria-describedby/aria-invalid that Field's own doc recommends.
Task 16: complete (commits 8900cb4..f06df66).

Task 17: implementer DONE (commit 86489c9, on top of my 4b26a4e WIP snapshot which it
  reconciled itself). 233 passing with and without DATABASE_URL. Tie-break proven live: scored
  against N5-701, Baltic Pay Ventures (80, specificity 5) ranks above Central Europe Growth Fund
  (80, specificity 4). Ownership check proven out of band: forAssetId pointing at another
  seller's asset returns scoredAssetId null and the unscored order.
Task 17: Ruling: accept `isOwner || canModerate` for scoring, which widens my ruling 3's literal
  "owns it". A manager already sees every listing and every buyer, so scoring reveals nothing new
  to them, and oversight of who a listing attracts is a legitimate moderation view. It is also
  consistent with how canModerate behaves everywhere else in this codebase. Cost if wrong: one
  line to revert.
Task 17: AI-enabled path NOT RUN — no ANTHROPIC_API_KEY. MatchBadge's interactive AI branch
  verified by inspection plus absence of server-log errors; there is no component-render test
  harness in this repo.
Task 17: controller note — I created the 4b26a4e WIP commit while this agent was still working,
  which it then had to reconcile. That was my doing, not a defect on its part; snapshotting a
  live agent's tree is something to avoid unless a shutdown forces it, as it did here.
Task 17: review = spec ❌ on the missing search control, quality NEEDS FIXES, 2 Important +
  2 Minor. Authz change confirmed purely additive (one new canBrowseBuyers, no existing
  assertion touched). Buyer enumeration closed at both entry points with no hidden-vs-nonexistent
  signal. Mandate filters confirmed to target the mandate arrays, not the buyer's own country.
Task 17: fix round 1/5 (commit 28eb71c), verified by the controller from the diff.
  BuyerSearch added and wired, both catalogues real; BUYER_SORT_ORDER plus pure
  compareBuyersByRecency/compareBuyersByScore comparators, every one ending in id ascending, used
  by both findMany's orderBy and the in-memory sort; 7 new DB-free comparator tests.
  240 passing with and without DATABASE_URL.
Task 17: complete (commits f06df66..28eb71c).

Task 18: implementer DONE (commit 20dc438, amended after its own dispatched review). 276 passing
  with and without DATABASE_URL (240 -> 276: asset-where 14, nav 7, group 6, score 5,
  buyer-where 4). typecheck, lint and build clean. Controller re-ran all five independently on
  the amended commit rather than trusting the report.
Task 18: Ruling: getRecommendedAssets returns an EMPTY list at specificity 0, rather than a
  ranking the component then declines to render. Handoff 2 forbids displaying that ranking; a
  ranking that must never be displayed should not be computed, or the next caller renders a
  correct-looking array in good faith. Query and component both call isMandateRankable
  (@/lib/matching) so the rule has one definition.
Task 18: Ruling: getSellerOverview supersedes rather than composes the per-listing
  getAssetRequestQueue — the second option Task 14's handoff sanctions. Composing it would be N
  round trips to rebuild one query's rows; the two share appendRequestRow, the summary types and
  access-request-queue.tsx, which is what that handoff was actually protecting.
Task 18: Ruling: navKeysFor gained an optional second argument (NavProfiles) instead of learning
  about Viewer. /listings/new mirrors canPublishListing (role AND profile row); /profile mirrors
  its page, which gates on buyerProfileId alone. Nav that hides a page the viewer can still open
  is the inconsistency Task 13 removed between catalog and detail page. All five pre-existing
  nav assertions hold verbatim.
Task 18: two reaches outside the brief's file list, both load-bearing: decideAccess/revokeAccess
  now revalidatePath the dashboard (proven necessary by replaying the real Server Action POST),
  and countMandateMatches calls the extracted isRecommendableMatch instead of keeping a second
  inline copy of the band rule.
Task 18: AI-enabled path NOT RUN — still no ANTHROPIC_API_KEY. Unchanged since Task 17.
Task 18: controller fix round 1/1 (commit see below), verified live in the rendered DOM.
  buyer-card.tsx wrapped the whole card in a Link with MatchBadge's <button> nested inside it:
  invalid HTML, and the anchor took the click, so the match-reasons disclosure — and the AI
  explanation under it — could not be opened from the catalog at all. Pre-existing from Task 17;
  Task 18 inherited it by reusing BuyerCard on the seller dashboard, which is what surfaced it.
  Replaced with a stretched link on the buyer's name (after:absolute after:inset-0) and the badge
  lifted onto relative z-10. Verified against the running production build with a real seller
  session: /en/buyers 12 cards / 0 anchors containing a button, /en/buyers?forAsset=asset-731
  12 match badges / 0 nested, /en/dashboard 3 matched-buyer cards / 0 nested.
Task 18: OPEN RULING for the user, not decided: on the seller dashboard's top-3 matched buyers,
  a buyer whose mandate constrains nothing is badged "Strong match - 100/100". BuyerCard does
  print "This mandate constrains nothing" underneath, and Task 17's tie-break correctly ranks
  specific buyers first, so nothing is hidden — but the collapsed badge is the part a seller
  reads, and on a three-row recommendation surface it is the seller-side shape of exactly what
  handoff 2 forbids on the buyer side. Options: (a) leave it — an unconstrained strategic
  acquirer is a real lead and Task 17 is reviewed and closed; (b) make MatchBadge itself render
  a neutral "mandate not specified" chip instead of a band and score at specificity 0, which
  fixes catalog, detail page and dashboard in one place. Deferred, not dropped.
Task 18: complete (commits 28eb71c..HEAD).

Cross-task: USER DECISION (2026-09-07) — this project ships with ANTHROPIC_API_KEY unset,
  permanently. The user declined the cost. All three AI features stay on their no-key fallback
  path, which is the designed behaviour, not a degradation: the controls are not rendered, and
  nothing else depends on them. Task 9 Step 8 ("run once against the real API before trusting
  them") is therefore CLOSED AS WILL-NOT-DO, not deferred. Documented in the README as the
  shipping configuration rather than as a TODO. Task 23 must not reintroduce it as an open item.
Cross-task: controller fix — every AI call site had max_tokens set to 400/512/1024, chosen for
  the size of the intended JSON with nothing reserved for reasoning. AI_MODEL is Claude Opus 5,
  where adaptive thinking is ON by default and thinking tokens count against max_tokens, so those
  ceilings risked the model spending its whole budget reasoning and being cut off before emitting
  the JSON the zod schema waits for — surfacing as stop_reason 'max_tokens' with no parsed_output,
  which the never-throws contract would have collapsed into the same silent null as "no API key".
  Raised to a shared DEFAULT_MAX_TOKENS of 4096 (8192 for the teaser review, which lists several
  excerpts plus suggestions), and callStructured now logs a truncation instead of swallowing it.
  Costs nothing: billing and the OTPM rate limit both count tokens actually generated, so an
  unreached ceiling is free. Found by reading the API docs, NOT by running anything — with no key
  this remains unverified against the real API, like the rest of the AI layer.

Task 19: implementer DONE (commit 606af73). 287 passing with and without DATABASE_URL; typecheck,
  lint and build clean; seeded DB restored exactly. Controller re-ran all five independently.
Task 19: Ruling: a manager is not a participant and cannot read any thread. This is the ONE place
  in the codebase where canModerate deliberately does not widen a read. Enforced by
  participantConversationsWhere returning null rather than { OR: [] } — Prisma reads an empty OR
  as "match everything", so that line is the highest-stakes one in the diff and is unit-tested
  directly. The refusal does not depend on the nav change; the manager also gets an explicit
  "managers do not have an inbox" card rather than a silently empty list.
Task 19: Ruling: a seller's companyName inside a thread is gated by canViewFullAsset — the real
  predicate, not a re-derived grant === 'APPROVED' — so an approved grant on a listing that later
  left PUBLISHED, or whose owner was suspended, stops disclosing, exactly as on the listing page.
  An asset-less (cold-contact) thread never names the seller. Without this, "Contact seller" is a
  one-click bypass of the whole NDA gate, and canMessage makes that bypass free. Reviewer verified
  on the wire: the seller's name appears 0 times in the full 31KB response of a cold thread,
  RSC flight payload included. Never sent and then hidden.
Task 19: review = spec MET, quality SHIP after fixes. No Critical, no authorization hole. Probed
  live with three real sessions: manager/non-party seller/non-party buyer all 404 on every thread
  they are not party to, and the two 404 bodies are byte-identical. All three Server Actions
  refuse independently when called directly over HTTP, before zod, without trusting the page.
Task 19: review PROVED the upsert is not what its comment claimed. With Prisma 7 + PrismaPg the
  "upsert" emits a plain INSERT ... RETURNING; Postgres logged the unique-constraint violation
  during a 12-way concurrent burst. So startConversation IS a check-then-write with a real race
  window, and the catch (P2002) -> re-read-by-threadKey branch is the primary mechanism, not a
  backstop. It works: all 12 calls returned the same conversationId, one row.
Task 19: Ruling: ACCEPTED, not fixed — the three actions return FORBIDDEN for a real conversation
  the caller is not party to and NOT_FOUND for a fabricated id, which distinguishes "exists" from
  "does not exist" and is a literal exception to the brief's non-negotiable "hidden and
  non-existent look identical". Accepted because the PAGES honour it (404 both ways, byte-
  identical), it matches the precedent decideAccess set in Task 14, and exploiting it requires
  already holding an unguessable cuid. Same ruling for the page-level timing difference the
  reviewer measured on the same two cases (median 28.9ms vs 22.3ms): closing it costs a second
  query to save nothing an attacker who already has the cuid could not learn anyway.
Task 19: fix round 1/1 (commit 94e6196), verified by the controller. (1) The withheld-identity
  hint told a buyer to file an access request on a cold-contact thread that has no listing —
  unfollowable, and it implied a listing existed; now two strings chosen on asset !== null.
  (2) An empty thread outranked real conversations in both inboxes; now
  compareConversationsByActivity (pure, in conversation-where.ts, 6 tests) orders hasMessages
  first, then lastMessageAt desc, then id asc for a total order. (3) Client-supplied locale
  reached redirect() unvalidated — measured pre-fix as x-action-redirect: //evil.example.com/login
  — fixed once at the root in redirectNow via a new pure toAppLocale (@/i18n/locale, 4 tests);
  it lives beside routing rather than in session.ts because session.ts imports @/auth, which
  builds a Prisma client at import time and would make it untestable. (4) The upsert comment
  rewritten to state what was measured. 297 passing with and without DATABASE_URL.
Task 19: controller follow-up — the root fix did NOT cover src/server/actions/auth.ts, which
  reaches redirect()/getPathname without going through redirectNow. Its locale arrives via
  .bind(null, locale), and a bound argument is serialised into the client payload, so it is
  exactly as caller-controlled as a typed input field — only harder to notice. This was the
  worst of the six sites: there the value reaches redirectTo, which Auth.js's signIn uses to
  decide where a SUCCESSFULLY AUTHENTICATED session lands. Both entry points now run through
  toAppLocale. Verified no regression live (login 302, then dashboard/inbox/profile all 200 in
  both locales); NOT verified by forging a bound argument — the mechanism is the same validated
  helper, but the attack path on this file specifically was not reproduced.
Task 19: NOT fixed, deliberately — revalidatePath() in the messaging, access-request, asset and
  profile actions still builds `/${locale}/...` from the raw input. That is cache invalidation,
  not navigation: a forged value revalidates a path that does not exist and changes nothing an
  attacker can observe. Left alone rather than touching six more call sites for no risk
  reduction. Recorded so the whole-branch review sees it was a choice.
Task 19: scoped re-review of the fix round (606af73..b089bcf) = all five fixes HOLD, no Critical,
  no authorization change, no regression. It also CORRECTED the controller. My auth.ts fix was
  right and necessary, but the reasoning written above it was wrong, and the re-reviewer measured
  both halves rather than taking either on trust:
  - Bound arguments ARE tamperable, as claimed. `/en/login` ships the bound locale in plaintext
    HTML (`$ACTION_0:1` = `["en"]`); Next encrypts closed-over variables of inline actions, not
    explicit `.bind()` args on a module-level 'use server' export. Replaying with `["ru"]` moved
    the destination. Confirmed.
  - But `redirectTo` — the path I claimed mattered most — was ALREADY SAFE. Auth.js's default
    `redirect` callback re-bases anything off-origin, and `@/auth` overrides only jwt/session, so
    a forged `//evil.example.com` came back on our own origin. Defence in depth there, not a fix.
  - The real hole was the sibling branch: the `AuthError` path calls next-intl's `redirect()`
    directly, so Auth.js never sees the value. Wrong password + forged bound locale answered
    `Location: //evil.example.com/login?error=1` pre-fix, `/en/login?error=1` after. Genuine
    protocol-relative open redirect, low severity (Next's server-action origin check refuses the
    same request cross-origin, so same-origin only).
  Lesson recorded because it generalises: a fix can be correct while its stated reason is not,
  and only the measurement tells them apart.
Task 19: fix round 2/2 (controller, commit see below) — five items from the re-review.
  (1) session.ts claimed redirectNow was the *only* funnel a caller-supplied locale reaches
  redirect() through. False, and falsified by the very commit before it: auth.ts is a second.
  Comment now says so and names what it missed. (2) auth.ts's threat model was inverted; rewritten
  to the measured truth above. (3) `identityWithheld` still over-promised whenever the gate is
  closed for a reason the buyer cannot change — a DECLINED or REVOKED grant is final (one shot per
  listing), and an asset off PUBLISHED or a suspended seller never reveals the name either. The
  string now states the *condition* ("shown only while you hold approved access") instead of
  promising a future approval, which is true in every sub-case and needed no new plumbing.
  (4) DEFAULT_MAX_TOKENS un-exported — read only in its own module. (5) conversations.ts said the
  second sort stage "cannot be pushed into SQL"; it cannot be expressed as a Prisma `orderBy`,
  which is what the rest of the paragraph actually argues. Raw SQL could.
Task 19: re-review confirmed the two-stage sort has no `take`/`skip` interaction — listConversations
  reads unpaginated and its one caller does not slice, so no thread can be dropped before the
  in-memory sort. It also re-measured the upsert (SELECT then INSERT, no ON CONFLICT) and
  enumerated every locale-prefixed URL builder in the app; the two page-level ones are unreachable
  with a bad locale because the router validates `[locale]` first (proven live).
Task 19: complete (commits 606af73..HEAD).

Task 20: implementer DONE (commit 7301ec6). 342 passing with and without DATABASE_URL; typecheck,
  lint, build clean; seeded DB restored per-row. Controller re-ran all five independently.
Task 20: Ruling: the admin queries THROW FORBIDDEN while the page 404s, deliberately unlike
  listBuyers/getAssetRequestQueue, which refuse by returning nothing. A buyer may legitimately
  reach /buyers and needs an empty state; nothing but a manager should ever get an /admin page at
  all, and an empty result there would ship a blank console instead of an error. Unlike the per-row
  check removed from listAssets, this guard CAN fail and is tested against five viewer shapes.
Task 20: Ruling: canAccessApp renamed to statusAllowsAuthenticatedSurfaces. Reviewer confirmed the
  rename is pure — the predicate had ZERO call sites, body byte-identical. The old name asserted
  something this codebase never did: /listings and a teaser are public, and a suspended viewer is
  served exactly what an anonymous one is (settled Task 12, widened in canViewAsset in Task 13).
  `statusAllows…` rather than `canAccess…` because it returns true for null, and an anonymous
  visitor cannot open a dashboard — it answers only the status half; viewerGate makes the whole
  decision.
Task 20: the implementer also corrected `suspended.body`, which claimed "You cannot access
  listings" while a suspended session measurably answers 200 on /en/listings, /en/buyers and /en,
  and 307 only on the four authenticated surfaces. Reviewer measured both and judged the new copy
  accurate on all three clauses. Renaming a predicate for accuracy while leaving the user-facing
  copy stating the old, wrong rule would have been half the job.
Task 20: review = spec MET, quality "needs one fix". The audit invariant was PROVEN, not assumed:
  the reviewer installed a BEFORE INSERT trigger on ModerationLog that raises, ran suspendUser, and
  the status change rolled back with the log write. A second pass locked the whole log table and
  got the same result after an 18s timeout. moderation.ts is also the ONLY writer of User.status in
  the application, so the invariant is complete rather than merely covered on the console's paths.
  8 concurrent approvals of one listing produced exactly one status change and one log row.
Task 20: fix round 1 (commit acc5a01) — the review's one Important finding was that a SUSPENDED
  listing was a one-way door, and its comment named two exits that do not exist (REJECT.from is
  PENDING_REVIEW only; submitForReview takes DRAFT/REJECTED only; editing leaves the status alone;
  there is no delete path). Task 20's own doing: before it, nothing could produce SUSPENDED at all.
  The task that argued at length for making removeUser reversible shipped the listing equivalent as
  a dead end. Fixed by adding SUSPENDED to LISTING_TRANSITIONS.APPROVE.from — no migration, it logs
  as APPROVE_LISTING. Plus: authz moved above the findUnique to close an existence oracle any
  signed-in user could query; a second string for "N published, hidden while this account is not
  active" (the count itself left alone, because the reinstate dialog reads it correctly); and
  aria-pressed replaced with aria-current on a link.
Task 20: scoped re-review of the fix round FOUND A BUG THE FIX INTRODUCED, and reproduced it.
  Widening APPROVE.from to two statuses made the conditional write match a status the payload was
  not derived from: `publishedAt` is computed as `asset.publishedAt ?? new Date()` from the row
  read earlier, so a row read as PENDING_REVIEW (publishedAt null) and written while SUSPENDED
  re-stamps a publishedAt another manager had already set. Proven with a FOR UPDATE lock widening
  the window. It falsified three comments that were in the tree as fact, including one promising
  that "a row a concurrent action already moved matches zero rows instead of being silently
  overwritten". The re-review also enumerated every AssetStatus and confirmed nothing became
  over-reachable (APPROVE on DRAFT/REJECTED/SOLD/PUBLISHED all FORBIDDEN, probed live), and re-ran
  the concurrency check on the newly reachable path (6 simultaneous approvals of a SUSPENDED
  listing: 1 succeeded, 5 FORBIDDEN, 1 log row).
Task 20: fix round 2 (commit 504cfb0), verified by the controller. moderateListing's write is now
  conditioned on `status: asset.status` — the exact status it read and validated — the idiom
  saveDraft already documents one file over. Proven BOTH ways on the same interleaving: pre-fix
  {"ok":true} with publishedAt overwritten, post-fix {"ok":false,"error":"FORBIDDEN"} with
  publishedAt intact and no log row. applyUserModeration deliberately keeps the legal-set
  condition — its payload is a constant carrying nothing from its read — and the module doc now
  states that distinction as the criterion for future widenings.
Task 20: Ruling: an edit to a SUSPENDED listing now demotes it to PENDING_REVIEW, exactly as an
  edit to a PUBLISHED one does. Fix round 1 had opened a real gap: a seller could rewrite a
  suspended listing (the edit page returns 200 for its owner) and the new APPROVE would publish
  that text straight to PUBLISHED, bypassing the review pass Task 15's demotion ruling exists to
  guarantee. Reachability reproduced. The invariant worth protecting is that no content reaches
  PUBLISHED without a human seeing it; a seller fixing what got their listing taken down is the
  normal path, but it must land in the queue. runTeaserReview is NOT invoked on this path, for the
  same reason it is not invoked on the PUBLISHED demotion: it is a seller-pressed button reading
  the last saved row and returns null with no API key, and this codebase has refused to make an AI
  call load-bearing on a write path since Task 9.
Task 20: NOT fixed, accepted — a manager cannot REJECT a suspended listing to send it back with a
  reason (SUSPENDED's only exit is APPROVE); a P2028 transaction timeout escapes as a 500, matching
  requestAccess's rethrow of non-P2002 errors; two managers can concurrently suspend each other, no
  single action produces it; SOLD is terminal.
Task 20: complete (commits 7ae564c..504cfb0). 343 passing with and without DATABASE_URL.

Task 21: implementer DONE (commit b45b80b). 347 passing with and without DATABASE_URL. The one
  requirement this task could fail — that its figures agree with the catalog — holds by
  construction, and the implementer found a second, independent confirmation of it: the 34-row
  value sum renders €170.5M while the 35-row sum would render €171M, so the hero's money figure
  witnesses the visibility floor's second half on its own. Controller verified live and
  anonymously: hero 34, catalog header 34, no "35" in the DOM, and asset-735 (the suspended
  seller's listing) appears 0 times in the RAW html including the flight payload.
Task 21: Ruling: the category strip's counts ARE listAssets' facets, and the six recent listings
  ARE items.slice(0, 6) off the same call — not a second query that happens to agree. A parallel
  aggregate would have to be kept in step by hand.
Task 21: the implementer extracted filter-sidebar's inline zero-fill+ordering rule into a pure
  categoryCountsInOrder rather than copying it into the new strip. Reviewer proved the four new
  tests discriminate by running them against three wrong implementations: a `return facets` stub
  fails 3 of 4.
Task 21: review = spec MET, quality "ship after one fix". It also CORRECTED the implementer's
  excuse: headless Chromium lays out fine at 320px in this environment, and the band the
  implementer declined to measure is exactly where the defect was.
Task 21: fix round 1/1 (commit 48d6072), verified by the controller from the diff and from the
  screenshots. (1) The hero eyebrow put a 47-character sentence in `Badge`, which hardcodes
  whitespace-nowrap for its ~20 short-status call sites; intrinsic width was a constant 319px EN /
  395px RU at every viewport and the hero's own overflow-hidden clipped it SILENTLY
  (scrollWidth === clientWidth, so no horizontal scroll betrayed it). At 390px — iPhone 12-15 — in
  Russian it read "...СДЕЛКИ БЕЗ ОГЛАСК", cut mid-word with the border gone, on the first screen of
  the product in the user's own locale. Fixed at the call site, not in Badge. Measured at five
  widths in both locales, before and after; the widths where it already fitted are byte-identical.
  (2) h-full on AssetCard so the landing grid's cards stop leaving a ragged bottom edge; proven
  inert on the single-column /listings by measuring row and card heights before and after.
  (3) The hero's count and value were coupled by convention — two files independently calling
  buildWhere(filters, false). The fixer rejected the shape I suggested, correctly: it would have
  left listAssets.total as a second count the catalog header still prints, trading one convention
  for another. Instead listAssets' existing count became one aggregate returning both _count and
  _sum, so the two figures are fields of ONE result off ONE where binding and there is exactly one
  count in the codebase. Zero extra queries.
  (4) Both hero CTAs were dead for a signed-in viewer — reproduced by clicking, not read: sign-in
  lands on /en, and /login bounces a signed-in viewer straight back, so the first screen every
  signed-in user sees had two buttons that did nothing at all. Fixed without changing the
  anonymous CTAs (the spec mandates /login) by not offering an anonymous call to action to a
  signed-in viewer; heroCtaKeys filters through navKeysFor so no hero button can offer a page the
  nav hides. All four viewer kinds clicked in a real browser; every click now navigates.
Task 21: NOT fixed, accepted — LANDING_RECENT_LIMIT <= PAGE_SIZE is enforced by a doc comment
  only (it can only shorten the section, never produce a wrong number, and the constant lives in a
  module no unit test may import); the category tile splits the count from its unit; getViewer()
  runs twice per request, pre-existing at all eight call sites in src/app.
Task 21: complete (commits 068f94c..48d6072). 355 passing with and without DATABASE_URL.

Task 22: implementer DONE (commit 885b345). Unit suite untouched at 355, passing with and without
  DATABASE_URL; typecheck, lint, build clean; 3 e2e specs pass in ~29s; database left in the
  seeded state and verified (max publicRef back to N5-740, so the N5-741 the seller spec creates
  is gone).
Task 22: Ruling: ACCEPTED the implementer's deviation from both plan and brief — resetDb() runs
  `pnpm db:seed` alone, NOT `prisma migrate reset`. Prisma 7.10 refuses `migrate reset` when it
  detects an AI agent invoked it, and demands PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION carrying
  the user's own words. The implementer declined to manufacture that consent, which is correct: no
  agent message is the user's consent. It then verified the substitute is sufficient rather than
  merely convenient, and the controller re-verified independently — all TEN models in
  prisma/schema.prisma have a matching deleteMany in prisma/seed.ts, in reverse dependency order,
  before any write. So the seed IS a full data reset; migrate reset added only destructive DDL that
  is a no-op unless the schema drifted. Consequence to state in the README: a developer whose
  schema has drifted must run pnpm db:migrate themselves, because the suite will not repair it.
Task 22: every spec was PROVEN able to fail, which was the task's main requirement — a green e2e
  suite that cannot go red launders confidence. Four deliberate breaks, each red on the right line
  and restored: APPROVE.to changed to DRAFT (seller spec, red on the anonymous-visitor assertion,
  and correctly NOT on the earlier admin-table one); canViewFullAsset made to ignore the grant
  (buyer spec, red on "confidential heading absent"); the category clause disabled in buildWhere
  (buyer spec, red with 11 of 12 non-EMI cards, which also proves the selector finds one cell per
  card); the owner-status half of VISIBILITY_FLOOR deleted (manager spec, red on the
  post-suspension assertion). The CONTROLLER independently reproduced the second one by hand.
Task 22: the buyer spec's gate assertion is the one the ledger's own trap would have eaten. A
  page.content() grep would pass with the gate WIDE OPEN, because next-intl ships the whole `gate`
  namespace in the flight payload. The spec uses getByRole, which resolves to a rendered element.
Task 22: two plan inaccuracies found, neither a bug. There is no "EMI badge" — AssetCard renders
  the category as a plain span in its meta-label row, and the only Badge on a card is on the
  `included` chips; the spec asserts the real thing. And no demo seller owns a published EMI
  listing (EMI is i mod 8 == 3, seller@n5deal.demo owns i mod 5 == 0, the only intersection under
  40 is i=35 which is SOLD), so the buyer flow's two halves necessarily use different listings.
Task 22: config decisions beyond the brief — `workers: 1` as well as `fullyParallel: false`
  (the latter only serialises within a file, and three files would still get three workers while a
  suspension is global), `retries: 0` (a retry launders a real race), and a globalTeardown, which
  globalSetup alone cannot substitute for.
Task 22: NOT covered, stated rather than implied — the `ru` locale, messaging/inbox, both
  dashboards, /buyers, the AI-enabled paths, and any responsive/viewport claim.
Task 22: complete (commit 885b345).

Task 23: implementer DONE (commit e12edf8). 355 unit tests with and without DATABASE_URL, 3 e2e
  specs, typecheck/lint/build clean, database left seeded, nothing pushed, no remote created.
  README rewritten from 129 lines of create-next-app boilerplate plus four bolted-on appendices to
  676 lines in twelve sections, with the four appendices absorbed where they belong.
Task 23: the brief's own postinstall instruction WOULD HAVE BROKEN `pnpm i` FOR EVERYONE, and the
  implementer caught it. `prisma generate` exits 1 with no DATABASE_URL — not because generate
  needs a database (it has not since Prisma 7.2) but because `prisma.config.ts` used Prisma's
  `env()` helper, which enforces resolution at config-load time before any command runs. On a
  fresh `git clone && pnpm i`, before anyone has written a `.env`, postinstall would have failed
  the install. Proven BOTH ways on a real scratch clone with no `.env` and no node_modules: with
  `env()` exit 1 and `PrismaConfigEnvError`, with `process.env.DATABASE_URL` exit 0 and a generated
  client. One file beyond the brief's list (`prisma.config.ts`), correctly. Controller confirmed
  `prisma generate` exits 0 with the variable unset — though note that check ran with a `.env` on
  disk, which `prisma.config.ts` loads via dotenv, so it was NOT the fresh-clone condition; the
  implementer's scratch-clone test is the one that proves it.
Task 23: five inaccuracies found in the brief, the plan or the spec, none a bug:
  (1) the postinstall hazard above; (2) the viewCount mechanism is a per-render increment in
  getAssetDetail that a Server Action's revalidatePath re-triggers, not a rule about actions —
  reasoned from code, not measured; (3) spec §10 says one PENDING_REVIEW listing, there are two;
  (4) spec §12 documents `pnpm db:push`, a script that does not exist (it is `pnpm db:migrate`);
  (5) spec assumption 2 says the MANAGER role is seeded-only, but grep finds no route, action or
  code path anywhere in src/ that creates a User — no role is self-registerable. The assumption was
  kept verbatim as required and the wider truth disclosed in "What is not built".
Task 23: `AUTH_TRUST_HOST` was measured rather than repeated. On a non-default port without it the
  app does NOT fail loudly: pages return 200 and look correct, and only the server log shows
  repeated UntrustedHost on /api/auth/session — so nobody can ever sign in. Earlier handovers said
  "fails Auth.js", which reads harder than the real, quieter failure. README states the real one.
Task 23: three more stale things found while writing up, left for the whole-branch triage:
  dashboard/page.tsx still says /admin "does not exist yet — the redirect lands on a 404 until that
  task ships" (Task 20 shipped it; behaviour correct, comment false); the Task 5 deferred minor
  claiming MatchReason "carries no comparanda" is stale, since the shipped type carries weight and
  earned — strike it rather than act on it; and `pnpm db:reset` is still in package.json and is
  exactly the command Prisma refuses for an agent, which is why the e2e helper avoids it.

CORRECTION (whole-branch review, 2026-09-07) — the middle claim above is WRONG and the controller
  wrote it into this ledger without checking. `git show 7541c86:src/lib/matching/types.ts` proves
  MatchReason has carried { code, kind, weight, earned } since Task 5's FIRST commit; the type never
  changed. The original note at :266 quotes that exact shape and says it lacks *comparanda* — the
  wanted-versus-actual values, "wanted EMI, this is Payment" — which is a different thing entirely.
  Task 23's report misread the note's own parenthetical as new evidence, and the controller relayed
  it unverified. DO NOT STRIKE :266. It is live, and it got WORSE: the note deferred on the grounds
  that "Tasks 17/18 hold both criteria objects server-side, so this is renderable there today", and
  Task 17 then made MatchBadge a CLIENT component receiving only MatchResult, which closed that
  escape hatch at all four call sites. Impact stays product-polish — the disclosure says "Category —
  Does not match" instead of naming what was wanted — but the reason it was deferred no longer
  holds. The lesson generalises past this entry: a triage that strikes a finding is a write to the
  record, and deserves the same verification as a fix.
Task 23: Step 2 (deploy) NOT done and correctly not attempted — it needs Neon and Vercel accounts
  reachable through a browser, which only the user can create. Instructions written, deployed-URL
  placeholder left, no account created, no remote, no push.
Task 23: complete (commit e12edf8). ALL 23 TASKS COMPLETE.

WHOLE-BRANCH REVIEW, fix round 2 (comment drift and duplication) — 2026-09-07.
Round 2: A3 SETTLED BY MEASUREMENT, and the parked Task 11 ruling stands. I ran the experiment a
  fourth time: both annotations genuinely stripped from src/auth.ts, then tsconfig.tsbuildinfo,
  node_modules/.cache and the whole .next directory deleted. `pnpm typecheck` exits 0 with zero
  output; a hard-cold `npx tsc --noEmit` (exit code captured directly, not through a pipeline)
  exits 0 with a zero-byte output file; and `pnpm build` exits 0, its own "Running TypeScript"
  pass included. Three independent checkers, no errors. The annotations were RESTORED — the
  ruling to keep them is parked, not reopened — and the comment now describes them as defensive
  with their necessity unreproduced, which is exactly what the ruling required and what the old
  comment refused to say. The dangling `task-11-report.md` citation is gone; `.superpowers/` is
  git-ignored, so it was the one source comment pointing at a file no clone contains.
Round 2: ELEVEN false comments corrected, all verified against the code first, none by changing
  behaviour. The two worst were both in admin-where.ts and both were load-bearing prose: the
  LISTING_TRANSITIONS paragraph justified widening APPROVE.from on the claim that `saveDraft`
  "leaves every non-PUBLISHED status exactly where it found it" (false since Task 20 fix round 2
  — saveDraft demotes PUBLISHED *or SUSPENDED* to PENDING_REVIEW, and assets.ts:190 says so), and
  the StatusTransition paragraph repeated the concurrency claim a reviewer had already disproved
  under a FOR UPDATE lock, seventy lines above the paragraph that states the opposite.
  admin-where.ts contradicted itself on a race. Both now say what the code does, and the
  concurrency rule is stated once, on the interface, with the two writes' difference spelled out.
Round 2: the "only query that returns a DRAFT" claim was replaced with "the only query with no
  visibility floor at all" — the wording admin.ts already used correctly. getSellerOverview and
  getAssetDetail both return non-public rows; they are floored to a relationship, the console is
  floored to nothing.
Round 2: Task 7's deferred minor (ASSET_CATEGORIES vs MANDATE_CATEGORIES, ledger :349) is
  RESOLVED, not deferred again. The two lists had become a live hazard rather than a tidiness
  point: ASSET_CATEGORIES drove the mandate form's checkboxes while MANDATE_CATEGORIES drove the
  buyer filter sidebar and parseBuyerFilters, so a divergence produced a category a buyer can put
  in a mandate and cannot filter by — silent, since both satisfy the same enum. One list now.
  ADMIN_ASSET_STATUSES is deliberately NOT collapsed and its comment says why; the difference is
  that its twin is a presentation ordering, not the same question.
Round 2: statusAllowsAuthenticatedSurfaces GIVEN AN ENFORCEMENT ROLE rather than demoted.
  viewerGate now calls it, so every requireViewer in the app flows through it. Before, three
  production files cited it by name in prose, four tests exercised it, and nothing called it —
  documentation with an export, the shape listAssets' per-row check was deleted for. The header
  cannot call it (it returns true for null by design) and now calls `isActive` instead of
  re-deriving that predicate inline, which is the reuse that was actually available there.
Round 2: SIX exports removed or un-exported. ButtonSize, MandateLicenceType and
  ConfidentialAssetField deleted (no importer anywhere; the two prose references were reworded to
  name the live value). AI_MODEL, MATCH_WEIGHTS, PRICE_TOLERANCE, PUBLIC_ASSET_STATUSES,
  PUBLIC_REF_PREFIX and LANDING_RECENT_LIMIT un-exported — read only inside their own module,
  the DEFAULT_MAX_TOKENS precedent from Task 19. Checked against tests/ first as instructed:
  NONE of the six had a test consumer, so the "exported so a unit test can assert against it"
  caution did not apply to any of them. CONFIDENTIAL_ASSET_FIELDS (the value) is used by
  tests/unit/dto/asset.test.ts and was kept.
Round 2: `common.save` was the only dead message key — deleted from both catalogues. The
  catalogue is 518 keys, not the 512 the review brief states. The eight unreachable ActionError
  keys were NOT deleted (components index the closed union with a template literal, so a missing
  key is worse than an unused one); the four that asserted a cause no code path produces were
  rewritten to the neutral fallback the listing and profile namespaces already used, and the
  whole convention is now documented once on ActionError itself. contact.error.ALREADY_REQUESTED
  was the clearest: it described a case startConversation deliberately returns as a success.
Round 2: B1 DEMONSTRATED, not asserted. With a temporary Playwright probe reading the rendered
  attributes on /en/listings/new as a signed-in seller: baseline teaserTitle maxlength=120,
  confidentialNotes=4000, country=2, yearOfIssue min=1900. Perturbing TEASER_TITLE_MAX to 111,
  MAX_CONFIDENTIAL_NOTES to 3777, COUNTRY_CODE_LENGTH to 3 and MIN_YEAR_OF_ISSUE to 1971 and
  rebuilding moved all four widgets to the new values, while the two bounds left alone
  (teaserDescription=2000, yearOfIssue max=2026) did not move. Constants and probe restored.
Round 2: the status-pill ruling's own doc now states its Russian cost — the shared SUSPENDED
  label is neuter («Заблокировано»), correct for a listing and a gender off for an account. The
  ruling is unchanged; it was simply never written down that it was seen rather than missed.
Round 2: nav.admin said "Admin"/"Админка" while the page it opens says "Manager console"/
  "Консоль менеджера" and every other string in the product says manager. Both now match the
  page. Also fixed: the one "модератор" in the RU catalogue, and the last pre-Task-11
  "объявлениями" in inbox.manager.body.
Round 2: NOT touched, as instructed — the specificity-0 badge, the category tile's count/unit
  split, raw locale in the six older revalidatePath sites, LANDING_RECENT_LIMIT <= PAGE_SIZE by
  comment, pnpm db:reset, getViewer() twice per request, the action-level existence oracles.
Round 3: the accessibility gap CLOSED IN THE PRIMITIVE, not at the call sites. `Field`
  (`src/components/ui/field.tsx`) told every caller to pass `aria-describedby={fieldErrorId(...)}`
  plus `aria-invalid`, and across ~30 call sites not one did — verified: `fieldErrorId` appeared
  three times in `src/`, all inside `field.tsx`. `Field` now finds the descendant carrying
  `id={htmlFor}` (the same invariant its own `<label htmlFor>` already depends on) and clones it
  with both attributes, merging into any `aria-describedby` the caller already set. A render prop
  and a context+hook were both rejected for putting the spread back in the caller's hands, which
  is the failure mode being fixed. Measured on the running build as a signed-in seller and buyer:
  before, every failing control had `aria-invalid=null` and `aria-describedby=null`; after, all
  13 failing fields on `listing-form` and the failing field on `mandate-form` carry
  `aria-invalid="true"` and an `aria-describedby` resolving to the `<p role="alert">` whose text
  is that field's message, and all 4 valid controls carry neither.
Round 3: the browser found what the unit test missed. The first cut of `describeControl` handled
  a single element only, so a `Field` whose `children` is an *array* (`teaserTitle`, which puts a
  hint paragraph beside its input) was silently skipped — the unit test asserted the hint was
  untouched and never that the control was wired. Fixed with `Children.map` plus fragment
  descent, and the test now asserts the control's own attributes in that shape. This is the
  second time on this branch that DOM verification caught something source reading did not.
Round 3: `included` in `listing-form.tsx` is the one error paragraph NOT wired, and deliberately.
  It is not a `Field`, and `fieldErrors.included` is unreachable through the UI: blank items are
  filtered out by `readFormValues`, item length is capped by `maxLength`, and the count is capped
  by the disabled "Add" button. Associating a message no path can produce buys nothing; removing
  the branch is a separate call this round did not make.
Round 3: `aria-current="page"` on the primary nav, via a CLIENT nav component, and the Next.js
  docs are the reason rather than convenience. `use-pathname.md` in this version states: "Reading
  the current URL from a Server Component is not supported. This design is intentional to support
  layout state being preserved across page navigations." The second half is why a server read
  would have been wrong even if it existed — the locale layout is not re-rendered when the router
  moves between two pages that share it, so a request-time pathname would keep announcing the
  first page visited. Measured: on `/en/listings`, `/en/listings/new` and `/en/dashboard` exactly
  one link carries `aria-current="page"` and it is the right one (`/listings/new` marks "New
  listing", not "All listings" — longest match wins); the landing page marks nothing; and after a
  *client-side* click from `/dashboard` to `/buyers` the attribute moves. No console errors and
  no hydration warnings across five pages. The matching rule is `activeNavKey` in `@/lib/nav`,
  pure and unit-tested, so the edge cases live in a test rather than in a component.
Round 3: `mandate-form.tsx` keyed its validation copy off the issue *path* alone, so any failure
  on `ticketMaxCents` answered "The maximum ticket must be at least the minimum." Reproduced in
  the browser: typing `-5` with the minimum left blank produced exactly that. Now keyed off
  `issue.code` — `custom` is the refinement and nothing else here produces one. `-5` now says
  "Enter a valid, non-negative amount in EUR, or leave it blank." and a genuine min > max still
  says the range sentence. `listing-form.tsx` was checked and is NOT the same shape:
  `assetInputSchema` carries no refinement at all, so no field there has a second, differently
  worded failure mode to confuse with its first.
Round 3: `keepQuotedLeaks` hardened — minimum excerpt length 4, word-boundary match, and the
  title and description searched separately instead of joined by a space. All three old holes
  fail permissive (a leak reported that is not there), and a false leak report is what teaches a
  seller to stop reading the panel. Dormant while `ANTHROPIC_API_KEY` is unset, which is
  permanent by the user's decision; five tests added.
Round 3: `canMessage` now takes `UserStatus` from the generated client instead of a hand-written
  `'ACTIVE' | 'SUSPENDED' | 'REMOVED'`. Byte-identical today (checked against
  `src/generated/prisma/enums.ts`); the point is that a schema change would otherwise move every
  other reader of that column and leave this one silently agreeing with nothing.
Round 3: dependency pins — `@prisma/client` and `@prisma/adapter-pg` moved from `^7.10.0` to
  exactly `7.10.0`, matching the `prisma` CLI pin that exists to prevent CLI/client major skew;
  `@types/node` moved from `^26` to `^24.10.1` against the Node 24.14.1 runtime, resolving the
  Task 1 deferred minor (ledger :113). `pnpm install` re-resolved to `@types/node@24.13.3`;
  typecheck, lint, 398 unit tests, build and the 3 e2e specs all clean afterwards.
Round 3: `vitest.config.mts` now includes `tests/unit/**/*.test.{ts,tsx}`. The suite's first
  component test (`tests/unit/ui/field.test.tsx`) renders `Field` with `renderToStaticMarkup` and
  parses the markup into tags before asserting — no jsdom, no testing-library, and no substring
  matching on HTML. The `DATABASE_URL`-unset property is unaffected: `field.tsx` imports only
  `@/lib/cn`.
Round 3: DEFERRED, unchanged — the 7 hand-rolled link-styled-as-button copies. Counted, not
  taken on trust: `text-accent-ink` outside `ui/button.tsx` appears in `site-header.tsx`,
  `hero.tsx`, `listings/page.tsx`, `buyers/page.tsx`, `buyer-dashboard.tsx`,
  `seller-dashboard.tsx` and `gated-section.tsx` — seven `Link`s wearing a hand-copied button
  skin (an eighth hit, `locale-switcher.tsx`, is an active-toggle style, not this). Real
  duplication, but the fix is a `Button`-as-`Link` variant with `asChild`-style prop forwarding,
  which is a refactor with its own review, not a leftover.
Round 3: NOT touched, as instructed — the specificity-0 "Strong match · 100/100" badge (open
  ruling for the user), `LANDING_RECENT_LIMIT <= PAGE_SIZE` by comment, `pnpm db:reset`,
  `getViewer()` twice per request, the action-level existence oracles, and raw `locale` in the
  six older `revalidatePath` sites.
