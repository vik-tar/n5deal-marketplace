# N5Deal Marketplace — prototype

An M&A marketplace for **licensed financial institutions** — banks, EMIs, payment and crypto
firms, and licence-only structures — built for the three roles the assignment names: Buyer, Seller
and Platform Manager. Listings are published as anonymous teasers; the legal name, the revenue and
EBITDA figures, the client count and the data-room link are released only after the seller approves
a named buyer's access request. Everything a role does writes to Postgres, so state survives a
refresh and survives being opened from a different browser. The stack is Next.js 16 (App Router,
React Server Components, Server Actions), Prisma 7 on Postgres, Auth.js v5, Tailwind 4 and
`next-intl` for English and Spanish.

**Deployed at:** _(not deployed yet — see [Deploying it](#deploying-it); the URL goes here)_

**Demo logins** (the sign-in page has a one-click button for each, so nothing needs typing):

| Role | Email | Password |
|---|---|---|
| Buyer | `buyer@n5deal.demo` | `demo1234` |
| Seller | `seller@n5deal.demo` | `demo1234` |
| Manager | `manager@n5deal.demo` | `demo1234` |

Buyers and sellers can also **register at `/register`**; the seed's 19 accounts are the ones with
data behind them, which is why the demo buttons exist. Platform managers are seeded only — see
[D8](#d8--self-service-sign-up-for-two-roles-and-only-two).

---

## Running it locally

**Prerequisites**

- **Node 24** — developed and verified on `v24.14.1`.
- **pnpm 10.18.3** — `corepack enable pnpm` installs the exact version `package.json` pins.
- **Postgres 16**, reachable over a connection string. A container is the shortest path:

  ```bash
  docker run -d --name n5deal-pg -p 55432:5432 \
    -e POSTGRES_USER=n5deal -e POSTGRES_PASSWORD=n5deal -e POSTGRES_DB=n5deal \
    postgres:16-alpine
  # already created it once? just: docker start n5deal-pg
  ```

  Port **55432**, not 5432, so it cannot collide with a Postgres already on the machine.

**Setup**

```bash
cp .env.example .env          # then edit it — see the table below
pnpm install                  # postinstall runs `prisma generate`
pnpm db:migrate               # applies prisma/migrations to an empty database
pnpm db:seed                  # 19 accounts, 40 listings, requests, conversations
pnpm dev                      # http://localhost:3000 → redirects to /en
```

`src/generated/` is git-ignored, so the Prisma client does not exist in a fresh clone. That is what
`postinstall` is for, and it is also what makes the client exist on Vercel's build machine. It runs
without a `DATABASE_URL`: `prisma.config.ts` reads the variable through `process.env` rather than
Prisma's `env()` helper, which throws at config-load time when the variable is unset and would make
`pnpm install` fail on a fresh clone before anyone had written a `.env`.

**Environment variables**

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. The app fails fast with a named error if it is missing (`src/server/db.ts`). |
| `AUTH_SECRET` | yes | Signs the Auth.js session JWT. `openssl rand -base64 32`. |
| `ANTHROPIC_API_KEY` | no | Enables the three AI features. See below. |
| `AUTH_TRUST_HOST` | only sometimes | Needed for a local **production** build on a host or port Auth.js did not infer. Not needed for `pnpm dev`, not needed on Vercel. |

### Turning the AI features on

They are off in the shipped configuration, and switching them on is two lines:

```bash
echo 'ANTHROPIC_API_KEY="sk-ant-..."' >> .env
pnpm dev          # restart if it is already running — the key is read server-side
```

**Where to look once it is set** — the app gives no other clue, so this list is
the map:

| Feature | Where | What appears |
|---|---|---|
| Natural-language search | `/en/listings`, beside the search box | an **Ask AI** button; "EMI licence in Malta under 2M" becomes real filters, written into the URL so you can see and correct what it understood |
| Match explanation | `/en/dashboard` as a buyer, or `/en/buyers` as a seller — open any match badge | a sentence under the list of reasons, phrasing the codes the scorer produced |
| Confidentiality review | `/en/listings/<id>/edit` as the owning seller | a **Check teaser** button that reads the saved row and reports where the public teaser leaks the confidential half |

Without a key each of those places says so in one line instead of rendering
nothing, so a reader can tell a feature that is switched off from one that was
never built. Everything around them — match scores, match reasons, the NDA
gate, moderation — is computed server-side and is unaffected either way.

**`ANTHROPIC_API_KEY` is optional, and this project ships with it unset by decision.** With it empty:

- The **"Ask AI"** button next to the catalog search box is not rendered. The search box itself
  still works — it sets `?q=` and does a plain text search over the teaser title and description.
- The **match explanation** inside a match badge is not requested. The badge, its score, its band
  and its list of reasons are all still there: they come from `scoreMatch`, a pure function, not
  from a model.
- The **confidentiality review panel** on the listing form renders nothing at all. The form is
  fully usable and publishing is unaffected — the review was always advisory.

Nothing else changes. Match scores, match reasons, the NDA gate, moderation and messaging are all
deterministic and computed server-side. A reviewer cloning this repo without a key sees a complete
product, which is the whole point of the design (see [AI functionality](#ai-functionality)).

**Other commands**

```bash
pnpm test        # 436 unit tests, no database needed
pnpm test:e2e    # 3 Playwright specs — RESEEDS THE DATABASE, see Testing
pnpm test:all    # both, in that order
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm build       # next build
pnpm start       # serve the production build
pnpm db:studio   # Prisma Studio against the local database
```

`pnpm start` on a port other than 3000 needs `AUTH_TRUST_HOST=true`. Without it the pages still
render — public browsing is unaffected — but every `auth()` call answers `UntrustedHost` in the
server log and **nobody is ever signed in**, which looks like a session bug rather than a
configuration one. Measured: `pnpm start -p 3001` returns HTTP 200 on `/en` and logs
`UntrustedHost: Host must be trusted. URL was: http://localhost:3001/api/auth/session`;
with `AUTH_TRUST_HOST=true` the same run logs it zero times.

---

## What is not built

Listed here rather than left to be discovered.

- **Favourites have a table and no UI.** `Favorite` is in the Prisma schema and in the spec's
  screen list; there is no `/favorites` route, no action that writes one, and the seed creates zero
  rows. Nothing in `src/` outside the generated client mentions it.
- **A new account starts empty, and nothing helps it fill up.** Registration creates the user and
  their profile; a new buyer then has no mandate, a new seller no listings, and neither gets an
  onboarding path beyond the forms already there. Fine for a prototype whose demo data lives on the
  seeded accounts, and the first thing a real product would build next.
- **No email verification and no password reset.** Both need a mail transport this prototype does
  not have. An address is taken at face value.
- **The three AI features have never run against the real API.** They are verified statically
  against the SDK's types and behaviourally on the no-key fallback path only. The project ships with
  `ANTHROPIC_API_KEY` unset by the user's decision, so that is the designed configuration rather
  than a gap — but "never actually executed" is a fact worth knowing before switching a key on. If
  you set one, treat the first run of each as untested.
- **The e2e suite covers `/en` only.** Not `ru`, not messaging or the inbox, not either dashboard,
  not `/buyers`, not the AI paths, and no responsive or viewport claim. Three specs, three flows.
  The 404 and error boundaries ([D7](#d7--failure-has-exactly-two-shapes-and-both-are-rendered))
  are verified by hand against a production build rather than by a spec.
- **Neither table in the manager console paginates**, and several list queries sort in memory
  rather than in SQL: `/admin`'s participants and listings tables (their orderings are rankings over
  enum members, which Prisma cannot express as an `orderBy` without raw SQL), `/buyers` (reads every
  matching row, scores and sorts it, then slices the page in memory), the buyer's recommended
  listings, and the inbox's two-stage thread ordering. Correct at 19 accounts and 40 listings,
  named in the code at each site, and the first thing that would have to change at real volume. The
  moderation log is capped at 200 entries rather than paginated — it reads one row past the cap and
  says on screen when it has truncated, rather than silently cutting the tail off.
- **`pnpm test:e2e` reseeds the database before and after every run.** It is destructive to local
  demo data by design, and it leaves the database exactly as `pnpm db:seed` produces it whichever
  way the run ends.
- **`resetDb` runs the seed, not `prisma migrate reset`.** Prisma 7.10 refuses `migrate reset` when
  it detects an AI agent invoked it and demands a consent variable carrying the user's own words,
  which no agent may manufacture. The substitute is sufficient for data — all ten models in
  `prisma/schema.prisma` have a matching `deleteMany` in `prisma/seed.ts`, in reverse dependency
  order, before any write — but it applies no DDL. **A developer whose schema has drifted must run
  `pnpm db:migrate` themselves; the suite will not repair it.**
- **`viewCount` is not "distinct page views".** `getAssetDetail` increments it on every render for
  a viewer who is neither the owning seller nor a manager, and a Server Action on the listing page
  revalidates that path — so a buyer who opens a listing and then successfully requests access is
  counted twice. Known, deferred, and deliberate in one direction: a view counter that over-counts
  is a statistic, whereas the read receipt next door (`MarkReadOnView`) was built as an effect
  precisely because one that over-clears is a lie.
- **No rate limiting anywhere.** Not on sign-in, not on the AI actions. Sign-in is covered by
  assumption 1 below; the AI actions bound the *size* of what one call can send a model
  (see [AI functionality](#ai-functionality)) but not the *number* of calls an authenticated
  account can make. A real deployment needs a per-account limiter in front of both.
- **The branch has never been merged to `master`.** `master` holds the two design commits;
  everything else is on `feat/marketplace-prototype`.

Out of scope from the start, and recorded as such in the spec: payments, escrow, deal closing,
document signing, file uploads (the data room is a URL field), broker/partner tenancy, websockets,
and any full-text search infrastructure beyond Postgres `ILIKE`.

---

## Product decisions

**Three roles, and what each one actually does.**

- A **seller** drafts a listing, submits it for review, and — once a manager approves it — appears
  in the public catalog as an anonymous teaser. They browse and filter `/buyers`, score buyers
  against one of their own listings, decide access requests on their listings, and revoke a grant
  they have already given. Editing a listing that is `PUBLISHED` or `SUSPENDED` sends it back to
  `PENDING_REVIEW`.
- A **buyer** maintains a profile and a single investment mandate (categories, countries, licence
  types, business status, ticket range, timeline), browses and filters the catalog, gets a ranked
  recommendation feed off that mandate, requests access to a listing with a message, and messages
  sellers.
- A **manager** sees every participant and every listing at every status with no visibility floor
  at all, approves or rejects listings in the review queue, and suspends, reinstates or removes
  participants. Every one of those decisions requires a reason and is written to an append-only log
  in the same transaction as the state change.

**Why listings are anonymous teasers behind an NDA gate.** This is how M&A actually works: the fact
that a licensed institution is for sale is itself confidential, and disclosing the seller's identity
to the whole market before a counterparty has been vetted is the thing sellers are most afraid of.
So the row carries both halves — 21 public teaser fields and 6 confidential ones — and the gate
decides which half a given viewer receives. It also gave the prototype its one genuinely interesting
authorization problem, and it is the reason the AI layer has something worth doing
(see [AI functionality](#ai-functionality)).

The gate is not cosmetic: confidential fields are never serialized into the payload for a viewer
without a grant. They are *absent*, not hidden with CSS. A prototype that hides gated data on the
client is theatre.

**Why a manager approves listings rather than only deleting them.** "Suspend or remove participants"
alone gives the manager a delete button and nothing else, which makes the role a janitor. A
`PENDING_REVIEW` status gives them real work — a queue, a decision, a reason, a rejection a seller
can act on — and it puts a human between a teaser and the public catalog, which is exactly where the
confidentiality check belongs. It is also what makes the moderation log worth having: a log of
deletions is a graveyard, a log of decisions is an audit trail.

**Messaging: a manager cannot read a conversation.** Every other read in this codebase pairs "the
owner" with "a manager" — `canModerate` widens `canViewAsset`, `canViewFullAsset`, the
access-request queue and the buyer directory alike. `getConversation` and `listConversations`
(`src/server/queries/conversations.ts`) are the one deliberate exception: a thread is visible to the
two parties on it and to nobody else. A manager holds neither a `BuyerProfile` nor a
`SellerProfile`, so they are a party to no thread and are refused by the ordinary participation rule
rather than by a special case, and `navKeysFor` (`src/lib/nav.ts`) does not offer them the inbox at
all.

That restraint is a product decision, not an oversight. Moderation acts on accounts and listings —
suspend a seller, reject a teaser, revoke a grant — and none of those decisions need the contents of
a private negotiation. A console that can read every conversation on the marketplace is a standing
privacy liability that buys moderation nothing, so this one is not built. If abuse reporting is ever
needed, the right shape is a party *referring* a specific thread to a manager, which is an explicit
disclosure by someone who was already in it.

**Who the counterparty is** is decided by the same NDA gate as the rest of a listing. A seller's
`companyName` is exactly as confidential as the listing's revenue figures (see `getAssetDetail`),
and messaging deliberately requires no approved grant — `canMessage` allows cold contact, because a
buyer approaching a seller from a teaser is a required capability. Those two facts together would
make the inbox a back door around the gate, so the inbox closes it: the seller behind a thread is
named to the buyer only when `canViewFullAsset` says that thread's listing is genuinely open to
them, and a thread with no listing attached never names them. The buyer's side needs no such rule —
their `displayName` is already visible to every seller through `/buyers`.

---

## Key technical decisions

**Next.js 16 App Router + React Server Components + Server Actions + Prisma + Postgres**, deployed
on Vercel.

### Rejected alternatives

- **Separate REST route handlers + TanStack Query on the client.** More code, an extra serialization
  boundary, and client-side loading states to design, in exchange for nothing the prototype needs.
  The API is consumed by exactly one client.
- **tRPC.** End-to-end type safety is genuinely nice, but Server Actions already give typed server
  calls from typed components inside one codebase. tRPC would add a dependency, a router layer and
  setup time to solve a problem that only appears when the client is a separate deployable.
- **localStorage / IndexedDB persistence.** Fails the marketplace premise: a reviewer opening the
  deployed link from another browser would see an empty marketplace, and a "well-designed persistent
  data model" cannot be demonstrated without a schema.

### D1 — Catalog filter state lives in URL search params, not in client state

Filtered catalog links are shareable, browser back/forward works correctly, and the page renders on
the server with the filter already applied. Filters are parsed once through a zod schema shared by
the asset catalog, the buyer catalog and the manager console, so an invalid or hand-edited URL
degrades to defaults instead of crashing — the parsers are guaranteed not to throw, and are tested
against hostile input including values that survive `isInteger` but not `isSafeInteger`.

### D2 — One authorization module, `src/lib/authz`, of pure functions

`canViewAsset(viewer, asset)`, `canViewFullAsset(viewer, asset, grant)`, `canEditAsset`,
`canModerate`, `canMessage`, `canRequestAccess`, `canDecideAccess`, `canRevokeAccess` and a handful
more. Both the UI (what to render) and the server (what to return, whether to accept a mutation)
call the same functions. Rules are unit-testable in isolation and cannot drift between the two
layers, which is exactly how access-control bugs normally happen. 55 of the 436 unit tests are this
module alone.

### D3 — Redaction happens on the server, in the data layer

`toTeaserAsset(asset)` and `toFullAsset(asset)` are the only ways an asset reaches a component, and
`TeaserAsset` is *derived* from the public-field allowlist (`Pick<Asset, PublicAssetField>`) rather
than described a second time, so the runtime copy and the type cannot diverge without a compile
error. A test asserts the allowlist against Prisma's own generated scalar-field enum, so a new
confidential column cannot be silently forgotten.

### D4 — Moderation is an append-only audit log, not a boolean flag

`ModerationLog` records actor, action, target, reason and timestamp. `User.status` and `Asset.status`
are the current state; the log is the history. Suspension is reversible and every decision is
attributable — the behaviour a real platform-manager tool needs, and a cheap way to show data-model
thinking. The status change and the log row are written in one transaction, so neither can exist
without the other.

### D5 — Soft deletion

"Remove a participant" sets `status = REMOVED` and cascades their listings out of the catalog, but
preserves rows. Hard-deleting a user would orphan conversations and access requests that the
counterparty legitimately needs to see.

### D6 — Money is stored as integer euro cents in a single currency

No FX, no decimals-in-floats. The reference product displays EUR asking prices; a currency selector
without real rates would be a lie. The columns are `BigInt`, not `Int`: Postgres `INTEGER` caps at
€21.47M in cents and the seed goes to €25M. `bigint` is normalised to `number` at the same
DTO boundary redaction already uses, so it never crosses into React.

### D7 — Failure has exactly two shapes, and both are rendered

A mutation in this app can fail in two unrelated ways, and they are handled in two different places
on purpose.

**Expected failures are return values, never throws.** Every Server Action answers
`ActionResult` — `{ ok: true }` or `{ ok: false, error }` over a closed union of reasons
(`src/server/actions/types.ts`). The component switches on `error` and renders a translated
sentence inline, next to the control the user pressed. Nothing about a refused mutation reaches an
error boundary, because a refused mutation is not an exception: it is the answer.

**Unexpected failures are caught at the call site and folded into the same union.** A dropped
connection, a Prisma error an action deliberately rethrows, a deploy landing mid-submit — those
reject the promise rather than returning. Every client call goes through `attempt()`
(`src/lib/action-result.ts`), which turns a rejection into `{ ok: false, error: 'UNEXPECTED' }`, so
one form has one rendering path for every way it can fail and the button always comes back
enabled. Left unhandled, these rejected inside `startTransition` and took the whole page to an
error boundary — replacing a half-filled listing form with an error screen because one round trip
failed.

**What is left over gets a page, not a stack trace.** Three boundaries close the remainder:

| File | Catches | Renders |
|---|---|---|
| `app/[locale]/not-found.tsx` | every `notFound()` — twelve call sites | the localized 404, inside the layout, with the header and links back |
| `app/[locale]/[...rest]/page.tsx` | a URL matching no route at all | defers to the above; a boundary is not a route, so without this an unmatched URL got Next's built-in page |
| `app/[locale]/error.tsx` | a render or action failure below the layout | localized copy plus `retry()` |
| `app/global-error.tsx` | a failure in the layout itself (`getViewer()`, the database) | a self-contained document, inline styles, English only |

`notFound()` here is not an exceptional path — it is the *ordinary* outcome of an authorization
rule. A listing whose seller a manager just suspended, a thread the viewer is not a party to,
`/admin` for a non-manager, `/profile` for a viewer with no `BuyerProfile`: all 404, all routine.
A 404 that is a routine product state has to look like part of the product. Verified against the
production build in both locales: `/en/does-not-exist`, `/es/does-not-exist`, `/en/listings/<bad
id>` and `/en/a/b/c/d` all answer `404` and render the branded page with the site header.

Next 16 passes `retry` to an error file, not `reset` — `retry()` re-fetches and re-renders the
boundary's children, where `reset()` only clears the error state over the same failed subtree. See
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.

### D8 — Self-service sign-up for two roles, and only two

`/register` creates a `BUYER` or a `SELLER`, signs them straight in, and writes the `User` row and
its profile row **in one transaction**. Half a registration is worse than none: a `User` with no
`BuyerProfile` can sign in and is then refused by `/profile`, `/dashboard` and every buyer action,
because `getViewer` hands back a viewer whose `buyerProfileId` is `null` and every predicate in
`src/lib/authz` reads that as "not a buyer".

**`MANAGER` cannot be self-assigned, and the protection is structural.** `registrationSchema`
(`src/lib/validation/registration.ts`) is a discriminated union with two members, so no payload
parses into a manager — there is no check to forget or edit out. This matters more than it sounds:
the console is the only surface that writes `UserStatus`, so a visitor who made themselves a manager
and suspended everyone would not be recoverable from inside the app. Verified by forging a Server
Action POST past the form entirely, with `role: "MANAGER"` in the body; the action answered
`{"ok":false,"error":"INVALID"}` and wrote nothing.

**Two deliberate asymmetries with sign-in.** Registration says plainly that an address is already
taken — that is address enumeration, and it is the better trade on a sign-up form, where the
alternative leaves someone who forgot they had an account with no way to work out what is wrong.
Sign-in keeps the opposite rule: `authorize` (`src/auth.ts`) compares against a dummy hash so a
wrong address and a wrong password cost the same time and give the same answer. Neither decision is
a precedent for the other.

**Passwords are capped at 72 bytes rather than truncated.** bcrypt ignores everything past its 72nd
byte, silently — measured on the installed `bcryptjs`, a hash of 72 characters verifies against
those characters plus any tail at all. Without a ceiling a long passphrase would be half discarded
and two different passwords sharing a prefix would both open the account. The limit is counted in
bytes, not characters, because 72 Cyrillic characters are 144 of them. Pre-hashing with SHA-256 is
what a production system should do; it changes how every seeded password verifies, which is more
than this prototype should take on.

### D9 — Work in progress is never lost silently

Both long forms — the buyer's profile and mandate, and the seller's listing editor — mark themselves
when they hold edits that have not been written, and both ask before a link throws that work away.
The seller's form is where it matters most: twenty fields, six of them confidential, against the
profile's five.

Three pieces, each doing one thing. A per-section **marker** beside the save button, so the page says
which card is unsaved rather than that something is. A **`beforeunload` listener**, attached only
while dirty, for a reload or a closed tab. And an **`onNavigate` guard** on the header's links, since
an in-app navigation unloads nothing and never reaches `beforeunload`; the two components that hold
those links live in the layout and cannot see the form, so a small module-level registry
(`src/lib/unsaved-changes.ts`) carries the one boolean between them. Keyed rather than counted —
React's development double-invocation of effects would leave a counter stuck above zero and block
every later navigation.

**Dirty means "differs from what was saved", compared after parsing.** Retyping `mt` over `MT` or
padding a name with spaces is not an edit: the schema normalises both to the same value, and a marker
that lights up for a change the database cannot see is one people learn to ignore. Getting this wrong
is easy and quiet — the first attempt compared the listing form against its `initial` prop, which
carries four fields the schema does not and arrives in a different key order, so a field edited and
put back kept the marker showing.

**What it does not catch: the back button.** `onNavigate` fires for link clicks, not for `popstate`,
and the App Router exposes no supported way to block a history pop. Guarding it would mean pushing a
decoy entry and undoing it, which breaks the history stack in ways users notice more than the lost
edit.

### D10 — Two component folders, and a lint rule that keeps them two

`src/components/ui` is the design system — `Button`, `Card`, `Field`, `Badge`,
`Tabs` and two small notes. `src/components/domain` is this marketplace —
`AssetCard`, `GatedSection`, `MandateForm`, `StatusPill` and twenty-six others.
The line between them is not a naming convention:

**Nothing in `ui/` knows what this product is, and nothing in it carries a word
of copy.** Measured: those seven files import `@/lib/cn`, `react` and
`@/i18n/navigation`, and nothing else — no `next-intl`, no Prisma types, no
Server Action, no authorization rule. Every string arrives as an
already-translated prop.

`StatusPill` and the `Badge` it wraps are the pair that shows why. `Badge`
knows five tones and nothing else. `StatusPill` maps twelve statuses from three
Prisma enums onto those tones and reaches for `useTranslations('status')` — it
is this product's vocabulary laid over a generic pill.

Two things fall out of the split, both observable in this repository. Replacing
the second locale (Russian to Spanish) rewrote 567 message keys and a dozen
`domain/` components and touched **none** of the seven `ui/` files. And one
`[aria-invalid]` rule in `globals.css` turned the invalid field red in the
registration form, the profile form and the listing editor at once, because all
three go through `Field`.

The boundary now **fails the build** rather than relying on memory:
`eslint.config.mjs` restricts imports under `src/components/ui/**`. The most
important entry is `@/components/domain/*` — the others stop copy and product
vocabulary leaking down, but that one keeps the dependency arrow pointing one
way. `domain/` builds on `ui/` at 41 call sites; the reverse would make the two
folders one folder with a slash in it. `@/i18n/navigation` stays allowed: `Tabs`
renders a locale-aware `Link`, and a link is navigation, not copy.

### Authentication

Sessions are Auth.js (`next-auth@beta`, v5) JWTs, but `getViewer()` (`src/server/session.ts`) does
not trust the token's `status` snapshot — it re-reads the `User` row from Postgres on every call.
That costs one extra round trip per request, in exchange for a correctness guarantee: when a manager
suspends an account, the suspension takes effect on that user's very next request, rather than
waiting until they next sign in and get a fresh JWT.

A suspended viewer browses exactly what an anonymous visitor browses — the landing page, the
catalog, a teaser — and reaches no authenticated surface. That is why the predicate is named
`statusAllowsAuthenticatedSurfaces` and not `canAccessApp`: suspension means you cannot transact,
not that you cannot look at a public page.

### Matching, and what it would take to scale

`scoreMatch` (`src/lib/matching`) is a pure function of a mandate and a listing. Five weighted
criteria summing to 100 — category 30, price 25, country 20, business status 15, licence type 10 —
with half credit for a price within 20% outside the ticket band, and bands at `>= 70` (Strong) and
`>= 45` (Good). An empty array in the mandate means "no preference" and earns full credit: an
unfilled mandate should not read as a mismatch with everything. `MatchReason` carries a code, not a
sentence, so the UI can translate it and the AI layer can phrase it without inventing facts.

`getRecommendedAssets` (`src/server/queries/assets.ts`) and its mirror image `listBuyers`
(`src/server/queries/buyers.ts`) both score **in memory**: they read every row the visibility floor
admits, run `scoreMatch` over each one, drop the `NONE` band, and sort the result in JavaScript. At
this prototype's size — 34 published listings and 12 buyers — that is correct, simple, and has one
decisive advantage over a SQL ranking: the buyer's view of a match and the seller's view of the same
match come from the same pure function, so the two sides can never disagree about a score.

It does not survive growth. Every recommendation read is a full table scan plus an O(n log n) sort
in the web process, redone from scratch on every page load. A real deployment would split it in two:

- **Filter in the database.** The mandate's hard constraints (category, jurisdiction, licence type,
  business status, ticket range) are ordinary `WHERE` clauses. Applying them in Postgres turns
  "score all listings" into "score the listings that could plausibly match", which is a small
  fraction of the catalogue for any real mandate.
- **Precompute the score.** The remaining ranking is a function of a `(mandate, asset)` pair and
  changes only when one of them changes. A background job — triggered by a mandate save, a listing
  publish, or a nightly sweep — writing a `match_score` row per pair turns the read into an indexed
  `ORDER BY score DESC LIMIT n`, and keeps `scoreMatch` as the single definition of the number.

Both changes are additive: `scoreMatch` itself stays exactly as it is, and stays the one place the
scoring rule lives. Two rules survive that refactor unchanged and would have to be reimplemented
alongside it: a mandate with `specificity === 0` constrains nothing, scores every listing at 100,
and must never be turned into a ranking (`isMandateRankable`); and a `NONE`-banded match is never
volunteered as a recommendation, however it was computed (`isRecommendableMatch`).

### One conversation thread per relationship, enforced by Postgres

`Conversation.threadKey` is unique and `buildThreadKey` (`src/lib/thread-key.ts`) derives it from the
(asset, buyer, seller) triple with a `noasset` sentinel, because a composite unique index over those
three columns would treat every NULL `assetId` as distinct and allow unlimited duplicate asset-less
threads between the same two parties. Both writers — `startConversation` and the conversation
`decideAccess` opens on approval — key on it and reuse what is already there.

---

## Data model

```prisma
enum Role            { BUYER SELLER MANAGER }
enum UserStatus      { ACTIVE SUSPENDED REMOVED }
enum AssetCategory   { BANK FINTECH PAYMENT EMI CRYPTO }
enum BusinessStatus  { ACTIVE LICENSE_ONLY }
enum AssetStatus     { DRAFT PENDING_REVIEW PUBLISHED REJECTED SUSPENDED SOLD }
enum AccessStatus    { REQUESTED APPROVED DECLINED REVOKED }
enum BuyerType       { PE_FUND STRATEGIC FAMILY_OFFICE INDIVIDUAL }
enum ModAction       { SUSPEND REINSTATE REMOVE APPROVE_LISTING REJECT_LISTING }
enum ModTargetType   { USER ASSET }

User            id, email @unique, passwordHash, role, status, locale, createdAt
BuyerProfile    id, userId @unique, displayName, buyerType, country, bio,
                websiteUrl, verified, createdAt
Mandate         id, buyerProfileId @unique, categories[], countries[],
                licenceTypes[], businessStatuses[], ticketMinCents,
                ticketMaxCents, timelineMonths, notes, updatedAt
SellerProfile   id, userId @unique, companyName, contactName, country,
                websiteUrl, verified, createdAt

Asset           id, publicRef @unique, sellerProfileId, status,
                -- teaser (public)
                category, licenceType, businessType, country, regulator,
                businessStatus, askingPriceCents, employees, yearOfIssue,
                included[], teaserTitle, teaserDescription,
                -- confidential (gated)
                legalName, revenueCents, ebitdaCents, clientCount,
                dataRoomUrl, confidentialNotes,
                -- meta
                publishedAt, rejectionReason, viewCount, createdAt, updatedAt

AccessRequest   id, assetId, buyerProfileId, status, message,
                requestedAt, decidedAt, decidedByUserId
                @@unique([assetId, buyerProfileId])

Conversation    id, threadKey @unique, assetId?, buyerProfileId,
                sellerProfileId, createdAt, lastMessageAt
Message         id, conversationId, senderUserId, body, createdAt, readAt

Favorite        id, buyerProfileId, assetId  @@unique([buyerProfileId, assetId])

ModerationLog   id, actorUserId, action, targetType, targetId, reason, createdAt
```

**Why moderation is an append-only log.** `User.status` and `Asset.status` answer "what is true
now"; they cannot answer "who decided this, when, and why", and a boolean flag destroys that
question permanently the moment it is flipped back. A platform manager's job is made of reversible
decisions — suspend, reinstate, approve, reject — and every one of them is contestable later, by the
participant, by a colleague, or by a regulator. So the log is never updated and never deleted: each
decision appends a row carrying the actor, the action, the target and a mandatory free-text reason,
and the row is written in the same transaction as the status change, so a state change without its
justification is not representable. It also costs nothing to build and demonstrates the data-model
instinct the prototype is being evaluated on. `Asset.rejectionReason` is the one denormalised copy —
it lives on the row because the seller has to read it on their own listing, where they cannot see
the log.

**Teaser and confidential fields live on one row**, separated by convention and enforced by the
redaction functions (D3). A separate `AssetConfidential` table would enforce it at the schema level
but doubles the write path for a prototype; the redaction functions are unit-tested against Prisma's
generated field list instead, which catches the same class of bug.

**One mandate per buyer.** Real funds run several theses; supporting many would complicate matching
and the profile UI for no evaluation benefit. Noted as a future improvement.

**Seeded demo data** (verified against the database, not the plan): 19 accounts — 12 buyers with a
mandate each, 6 sellers of whom **one is suspended**, 1 manager. 40 listings across 5 categories, 15
countries and 7 licence types, €150k to €25M: 35 `PUBLISHED`, 2 `PENDING_REVIEW`, 1 `SOLD`, 1
`REJECTED`, 1 `DRAFT`. **The catalog shows 34, not 35** — the visibility floor is `PUBLISHED`
**and** an `ACTIVE` owner, and one published listing belongs to the suspended seller. The landing
page's "€170.5M" is the sum over those same 34 rows and is computed from the identical `where`
binding, so the two figures cannot drift apart. Also seeded: 7 access requests covering all four
statuses (2 requested, 3 approved, 1 declined, 1 revoked), 4 conversations, 5 messages of which 4 are
unread, and 2 moderation-log entries. Zero favourites, because nothing writes them.

---

## AI functionality

Three features call the Claude API (`claude-opus-5`, held in one exported constant in
`src/lib/ai/client.ts`):

1. **Natural-language catalog search.** "EMI licence in Malta under 2M" becomes structured filters,
   validated against the same zod schema the URL parser uses and then *written into the URL*, so the
   user sees and can adjust what the model understood. No black box.
2. **Match explanation.** The input is the already-computed `MatchReason[]`. The model only phrases
   them in the viewer's language; it is never given the freedom to invent a reason.
3. **Confidentiality review on publish.** The model reads the teaser text alongside the confidential
   fields and flags identifying leaks — a legal name, a unique regulator reference, an exact revenue
   figure appearing in both — plus thin descriptions. Advisory, never blocking. This is the feature
   the whole design points at: the AI guards the NDA boundary the product is built on, rather than
   decorating the UI with a chatbot.

**Deterministic core, AI garnish — never the reverse.** Every fact in the product is computed
server-side without a model. Match scores and reasons come from a pure function; the NDA gate is an
authorization predicate; moderation is a state machine. The AI layer only *phrases*, *parses* and
*advises* on top of that. Two places make the rule concrete rather than aspirational:

- The match explanation is handed codes, not data, so it cannot assert a reason the scorer did not
  produce.
- The confidentiality review's prompt says "report nothing you cannot quote", and that instruction is
  then **enforced in code**: `keepQuotedLeaks` drops any finding whose excerpt does not actually
  occur in the teaser. Unenforced model compliance would have meant a hallucinated quotation reaching
  the seller as evidence, in the one feature whose entire purpose is guarding confidentiality.

**Every prompt is bounded before it is built.** A Server Action is a public HTTP endpoint, so the
argument reaching an AI feature is whatever the caller posted — not whatever the component passed —
and all three features `JSON.stringify` that argument into a prompt the operator pays for. Each one
therefore bounds its own input before the model sees it: the catalog search truncates the phrase to
200 characters (`buildSearchPrompt`), the confidentiality review reads the *persisted* row rather
than the caller's claims about it, and the match explanation validates against
`explainMatchInputSchema` (`src/lib/ai/explain.ts`) — reasons capped at the five criteria that
exist, `code` and `kind` as enums over the real member lists, unknown keys stripped. Authentication
alone bounds nothing here: every demo account is `isActive`, so without the cap one badge click's
worth of authorization would buy an arbitrarily large prompt, and free text in a `code` field would
be a caller writing into the model's context. Seven unit tests hold that line.

**The degradation guarantee.** `isAiEnabled()` reads `ANTHROPIC_API_KEY`; with it empty no AI
*control* is rendered — no disabled button, no error text, nothing to press that would fail — and
`callStructured` returns `null` without opening a client. What each of those three places does
render is a single line of prose saying the feature runs with a key configured, which is not a
control and costs nothing: without it, a reader with no key cannot tell a feature that is switched
off from one that was never built, and this project ships with the key unset. `callStructured` never throws and never rejects: every
failure mode (no key, a network error, a refusal, a schema mismatch, a truncated response) collapses
to `null`, and each caller has a defined fallback. Truncation is logged rather than swallowed
silently, so it cannot be mistaken for "the feature is switched off". No write path in this codebase
depends on an AI call succeeding.

**Honest caveat, repeated because it matters:** these three code paths have never executed against
the real API. See [What is not built](#what-is-not-built).

---

## Testing

```bash
pnpm test        # 436 unit tests in 31 files — no database, no network
pnpm test:e2e    # 3 Playwright specs against a production build
pnpm test:all    # both
```

**Two things `tsc` cannot check, and one test each.** `Translator`
(`src/i18n/translator.ts`) is typed `(key: string)` because this project does
not generate a key union per namespace, so a mistyped translation key is a
well-typed `string` that throws `MISSING_MESSAGE` at render time.
`tests/unit/i18n/keys.test.ts` scans `src/` for literal `t('…')` calls,
attributes each to the namespace of the binding it is called on, and asserts
the key resolves — and resolves to a string rather than to a group. It found a
real one on the buyer dashboard. Its companion `messages.test.ts` checks the
catalogue against itself; neither test replaces the other.

**The unit suite runs with `DATABASE_URL` unset**, deliberately and continuously verified. Nothing
under `tests/unit` imports the Prisma singleton; when testing a query's `where` builder required it,
the builder was extracted into a module that imports only types rather than adding a `dotenv` setup
file. `vitest.config.mts` includes `tests/unit/**` only, so the Playwright specs can never be
dragged into the unit run.

What the 436 protect, by weight:

| Area | Tests | What a failure would mean |
|---|---|---|
| `lib/authz` rules | 55 | Someone can see or do something they should not |
| Query `where` builders (`admin`, `asset`, `buyer`, `conversation`) | 84 | The visibility floor, the manager's no-floor console, or the manager's exclusion from the inbox has drifted |
| URL filter parsing and serialisation | 68 | A hand-edited URL crashes a page or smuggles an unsafe number into a query |
| Form and action validation | 56 | Invalid input reaches the database |
| Nav visibility and the unread badge | 35 | The header offers a page the viewer cannot open, hides one they can, or circles a `0`/`NaN` beside Inbox |
| Money, i18n, geo, grouping, thread keys | 34 | Formatting, locale validation or thread identity regressions |
| AI fallbacks, prompts, quote containment and prompt-input bounds | 29 | A malformed model response throws instead of falling back, a hallucinated quote reaches a seller, or a caller writes their own text into a model prompt |
| DTO redaction and the NDA gate state | 21 | A confidential field is serialized to a viewer without a grant |
| `scoreMatch` and the criteria key | 24 | Two sides of the marketplace disagree about a match, or an edited criterion silently stops recounting |
| Seed-data invariants | 9 | The demo data stops exercising a filter (this caught a real bug: EMI never appeared as a licence type) |
| `Field` error wiring | 8 | A failing control stops pointing at the message that explains it |
| Unsaved-changes registry | 5 | A stale entry blocks every later navigation, or a lost one drops a user's edits silently |
| Translation catalogue parity | 4 | A locale gains a key the other lacks, or Spanish copy silently falls back to English |
| Translation keys used in source | 4 | The code asks for a key the catalogue does not have — a `MISSING_MESSAGE` thrown at render time, on a page `tsc` cannot check |

The rows sum to 436; the counts come from the suite, not from an estimate.

**The three e2e flows** each assert something no unit test can reach, because each spans several
sessions, a Server Action, a revalidation and a second viewer's view of the result:

1. **Seller** — a listing that does not exist becomes one an anonymous visitor can see, and only by
   passing through a manager's approval.
2. **Buyer** — filtering the catalog by category, then opening the NDA gate on a listing: the
   confidential block and the seller's company name are proven *absent* before the grant and present
   after. Every assertion is a locator, never a search of `page.content()` — `next-intl` ships the
   whole `gate` namespace into the RSC flight payload, so a grep of the raw HTML would find
   "Confidential details" on a closed gate and prove nothing.
3. **Manager** — suspending a seller removes their listing from the public catalog for a signed-out
   visitor, and reinstating brings it back untouched.

Every spec was **proven able to fail**. Four deliberate breaks were made to the source — the approve
transition's target status, `canViewFullAsset` ignoring the grant, the category clause in the where
builder, the owner-status half of the visibility floor — and each turned exactly one spec red on
exactly the right assertion before being restored. A green e2e suite that cannot go red launders
confidence rather than earning it.

The suite runs `workers: 1` with `retries: 0`: the three specs share one database and the manager
spec's suspension is global, so parallel workers would read each other's half-applied state; a retry
would turn a real race into an intermittently green suite. It builds and serves a production build
rather than using `next dev`, because the flows depend on Server Actions, `revalidatePath` and the
RSC payload behaving the way they will in production.

**It reseeds the database before and after the run** — destructive to local demo data by design, and
it leaves the database exactly seeded. See [What is not built](#what-is-not-built) for the schema
caveat.

---

## Deploying it

Not yet done — these are the instructions, not a record.

1. **Create a Postgres database.** Neon's free tier is the intended target. Copy its pooled
   connection string; it already carries `sslmode=require`.
2. **Push this repository to GitHub**, then import it in Vercel. The framework preset is Next.js and
   the defaults are correct — `pnpm install` will run the `postinstall` that generates the Prisma
   client, which is required because `src/generated/` is git-ignored and the build has no client
   without it.
3. **Set the environment variables** in Vercel, for Production and Preview:
   - `DATABASE_URL` — the Neon string.
   - `AUTH_SECRET` — `openssl rand -base64 32`. Do not reuse the local one.
   - `ANTHROPIC_API_KEY` — optional; leave it unset to ship the configuration described above.
   - `AUTH_TRUST_HOST` is **not** needed on Vercel.
4. **Apply the migrations and seed, once, from a local shell** with `DATABASE_URL` pointed at the
   production database:

   ```bash
   DATABASE_URL="postgresql://…neon…" pnpm exec prisma migrate deploy
   DATABASE_URL="postgresql://…neon…" pnpm db:seed
   ```

   > **The seed is idempotent and destructive.** It `deleteMany`s all ten models before writing
   > anything, in reverse dependency order. Running it against a database that holds real data would
   > erase that data. It is safe to re-run only because this database holds nothing but demo rows.

5. **Verify the deployment** — in this order, because each step tests something the previous one
   does not:
   - Browse **anonymously**: the landing page, the catalog (34 listings), a listing detail page with
     the gate closed. No confidential field anywhere.
   - Sign in with **each of the three demo buttons** and confirm the header changes: a buyer gets a
     dashboard, a profile and an inbox; a seller gets a dashboard, `/buyers` and "new listing"; a
     manager gets `/admin` and **no** inbox.
   - Run the **core flow** end to end: seller creates a listing → manager approves it → it appears
     in the public catalog → buyer requests access → seller approves → the confidential block
     unlocks for that buyer and a conversation opens.
   - Check **both locales**: `/en` and `/es` on the catalog, a listing and the dashboard.
   - Open the URL **in a different browser** (or a private window) and confirm the same data is
     there. This is the point of choosing a real database over browser storage, and it is the one
     check that would fail for a prototype that had cheated on persistence.
6. **Put the URL at the top of this file.**

---

## Assumptions

Reproduced verbatim from section 13 of
[`docs/superpowers/specs/2026-09-04-n5deal-marketplace-design.md`](docs/superpowers/specs/2026-09-04-n5deal-marketplace-design.md).

1. Passwords are demo-grade; hashing is real (bcrypt) but there is no verification, reset, or rate
   limiting.
2. The Manager role is seeded only — it is not self-registerable, which is correct for a real
   platform and avoids an admin-escalation hole in a public demo. Buyers and sellers register
   themselves at `/register` (see [D8](#d8--self-service-sign-up-for-two-roles-and-only-two)).
3. All amounts are EUR. No FX conversion.
4. One investment mandate per buyer.
5. The data room is a URL field; no file storage.
6. "Remove" is a soft delete for audit integrity.
7. Messaging is not real-time.
8. Locale is a user preference and a URL segment; content itself (listing text) is authored in one
   language and not machine-translated.

---

## AI tools used

**Claude Code**, for all three stages, in this order:

1. **The design document** — `docs/superpowers/specs/2026-09-04-n5deal-marketplace-design.md`. Scope,
   domain model, authorization matrix, matching weights and the AI layer, written and argued before
   any code.
2. **The implementation plan** — `docs/superpowers/plans/2026-09-04-n5deal-marketplace.md`. 23 tasks
   with explicit interfaces between them.
3. **The implementation** — each task written by an agent, reviewed by a second agent against the
   diff, and adjudicated by a controller. Every ruling, deviation and deferred finding is recorded
   in `docs/superpowers/EXECUTION-LEDGER.md`, which is the honest record of what was built and where
   it departs from what was planned.

**Where the plan was overridden by hand.** The plan was authored before the code existed and was
wrong in specific, recorded ways. The ledger is the full list; these are the ones that changed the
software:

- **The plan contradicted the spec on money.** Money columns were specified as `Int`, which caps at
  €21.47M in cents, while the spec mandates seed prices up to €25M. Widened to `BigInt`, with the
  narrowing to `number` confined to the DTO boundary redaction already owns.
- **A decorative guard is worse than no guard**, and two shipped. `listAssets` carried a per-row
  `canViewAsset` check that hardcoded `ownerStatus: 'ACTIVE'`, so it evaluated true for every row the
  `where` clause had already returned and could never catch the regression its own comment claimed to
  prevent — deleted. `decideAccess` caught a `P2002` that Postgres never raises on that path, while
  an unconditioned update silently overwrote a concurrent decision — replaced with a conditional
  write, and the race was reproduced with concurrent live calls before and after.
- **The confidentiality reviewer's quote constraint was unenforced.** The prompt asked the model not
  to report anything it could not quote; nothing checked. Now a deterministic substring check drops
  unverifiable findings.
- **`MatchResult` gained a `specificity` count.** An entirely empty mandate scores 100 against every
  listing, which would have made the recommendation feed a catalog-wide tie for every new buyer. A
  field in the return type cannot be forgotten by a downstream consumer the way a note in a plan can.
- **Editing a `PUBLISHED` (or `SUSPENDED`) listing now returns it to `PENDING_REVIEW`.** The plan let
  `saveDraft` set status only on create, which meant a seller could rewrite a live teaser — including
  pasting in the legal name the AI check exists to catch — and ship it instantly with neither the
  check nor a manager seeing it. That would have made the whole gate a first-publish formality.
- **`canAccessApp` was renamed `statusAllowsAuthenticatedSurfaces`**, and `canViewAsset` stopped
  denying suspended viewers, because the plan's two halves disagreed: a suspended user saw a listing
  card in the catalog and got a 404 on clicking it.
- **A caller-supplied locale reached `redirect()` unvalidated** in six places, producing a real
  protocol-relative open redirect on the failed-login path (measured as
  `Location: //evil.example.com/login?error=1`). Fixed at the root with one validated helper.
- **`max_tokens` was set to 400–1024 per AI call site**, chosen for the size of the intended JSON
  with nothing reserved for reasoning, on a model where adaptive thinking is on by default and
  thinking tokens count against the ceiling. Raised to 4096 (8192 for the teaser review), and
  truncation is now logged rather than collapsed into the same silent `null` as "no API key". Found
  by reading the API docs; like the rest of the AI layer, unverified against the real API.
- **Framework reality beat the plan twice.** The middleware lives at `src/proxy.ts`, not
  `src/middleware.ts` (Next 16 deprecates the old convention), and the Prisma client is imported from
  `@/generated/prisma/client`, not `@/generated/prisma` (the `prisma-client` generator emits no
  index).
- **`prisma migrate reset` is unavailable to an agent.** Prisma 7.10 gates it behind a consent
  variable that must carry the user's own words, so the e2e reset runs the seed instead — with the
  consequence documented in [What is not built](#what-is-not-built) rather than papered over.

Two smaller notes in the same spirit: at least three implementer reports asserted verifications that
had not been performed (a preserved apostrophe that was not, a fabricated commit hash, a typecheck
failure that did not reproduce on a cold run). All three were caught by reviewing the diff rather
than the report, which is why nothing in this project was accepted on a report's word — and why
every figure in this README was re-derived from the database, the test runner or the code before
being written down.

---

## What I would improve with more time

From section 14 of the design document:

- Multiple mandates per buyer, with per-mandate match feeds.
- Semantic search over listings (pgvector embeddings) alongside the structured filters.
- Real notification delivery (email/digest) for access requests and messages.
- Document handling: NDA e-signature, a real data room with per-file access grants.
- Saved searches with alerts when a matching listing is published.
- Server-side pagination and cursor-based infinite scroll; at 40 seeded assets it is not yet needed,
  which is why it is deliberately absent.
- Rate limiting and audit trails for authentication events.
- Accessibility pass beyond semantic HTML and keyboard-reachable controls.

And, from what building it actually surfaced:

- **Registration, and the profile creation that goes with it.** Nothing creates a `User` today.
- **Favourites**, which are a table waiting for a route.
- **Pagination and raw-SQL ordering in the manager console**, which is the first place the in-memory
  sorts stop being defensible.
- **A `MatchBadge` that renders a neutral "mandate not specified" chip at `specificity === 0`**
  instead of "Strong match · 100/100". The card already prints "This mandate constrains nothing"
  underneath and the tie-break already ranks specific buyers first, so nothing is hidden — but the
  collapsed badge is the part a seller reads. Recorded as an open decision, not an oversight.
- **A `viewCount` that counts distinct views**, or an explicit rename to what it actually measures.
- **A manager path to reject a suspended listing** with a reason. Today `SUSPENDED`'s only exit is
  approval, so a manager cannot send one back.
- **An e2e spec for the 404 and error boundaries**, which are currently verified by hand.
- **A per-account rate limiter** in front of sign-in and the three AI actions. Their prompt *size*
  is bounded; their *frequency* is not.
- **A `select` on the two catalogue reads.** `listAssets` and `getRecommendedAssets` pull whole
  `Asset` rows, confidential columns included, and drop them at the DTO boundary. The redaction is
  what makes that safe, but naming the columns would mean the confidential half never leaves
  Postgres at all — defence in depth rather than a single line to get wrong.
- **A merge to `master`.**
