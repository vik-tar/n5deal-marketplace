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
