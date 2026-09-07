# N5Deal Marketplace Prototype — Design

**Date:** 2026-09-04
**Status:** Approved, ready for implementation planning
**Author:** Viktor Taraskevych (with Claude Code)

---

## 1. Context

Technical assignment: build a working marketplace prototype for M&A of financial
assets, with three roles (Buyer, Seller, Platform Manager). Reference product:
`https://n5deal.com/all-listing`. Budget: 24 hours end to end.

The assignment is deliberately under-specified. The evaluation is explicitly about
the *quality of decisions inside a chosen scope*, not about feature count. This
document records the scope and the reasoning behind each decision.

### What the reference product actually is

N5Deal is not a generic "buy a business" marketplace. It sells **licensed financial
institutions and their licences**. Observed from the reference:

- Categories: Bank, Fintech, Payment, EMI, Crypto, plus License-Only structures.
- Per-listing fields: public asset ref (`#750`), country, licence type (MSO, SEMI...),
  business type, business status (Active / License Only), asking price in EUR,
  employee count, year of licence issue, regulator (FCA, C&ED...), what is included
  in the deal (staff, software, security), view and favourite counts.
- Catalog filters: category (with counts), country, price range, business status,
  sort by popularity / recency.
- Audience segments: Seller, Buyer, Partner.
- Visual language: dark background, white text, horizontal cards, flag icons,
  verified badges, clean sans-serif hierarchy.

The domain model below is built for this specific domain rather than for an abstract
"business for sale". This is where most of the product credibility comes from.

---

## 2. Goals and non-goals

### Goals

1. A working application — every listed role flow actually mutates persisted state.
2. State survives refresh, and survives being opened from a different browser
   (real database, not browser storage).
3. Enough demo data to evaluate every flow without creating anything first.
4. A defensible architecture, written down with its reasoning.
5. Visual kinship with N5Deal.

### Non-goals (explicitly out of scope, documented as assumptions in the README)

- Production-grade auth: no email verification, no password reset, no OAuth, no MFA.
- Payments, escrow, deal closing, document signing.
- File uploads. The data room is represented by a URL field.
- Multi-tenant brokers/partners (the reference has a Partner segment; the assignment
  names three roles, so Partner is out).
- Real-time transport (websockets). Messaging refreshes on navigation/revalidation.
- Full-text search infrastructure. Postgres `ILIKE` + trigram-free indexing is enough
  at demo data volume.

---

## 3. Scope

### Required (from the assignment)

| Role | Capability |
|---|---|
| Seller | publish an asset; browse buyers; filter/search buyers; contact a buyer |
| Buyer | create/maintain profile; describe investment interests; browse assets; filter/search assets; contact a seller |
| Manager | see buyers/sellers/assets; search/filter them; suspend or remove participants |

### Chosen additions

1. **NDA / teaser flow.** Listings are anonymous teasers; identifying and financial
   data is released only after the seller approves a buyer's access request. This is
   how M&A actually works, and it is the assignment's "edge case not explicitly
   described".
2. **AI layer** — natural-language search, match explanation, confidentiality
   validation on publish (section 8).
3. **Automated tests** — Vitest on the pure logic, Playwright on three role flows.
4. **i18n** — English and Spanish via `next-intl`.
5. **Threaded messaging** with an inbox and unread counts.

### Cut order under time pressure

Agreed in advance, cut from the bottom:

1. Threaded messaging degrades to a single "contact request" with a message body and
   status. (Data model already supports this: one conversation, one message.)
2. Playwright e2e. Vitest unit coverage of matching, authorization and redaction is
   never cut — it protects the logic that is hardest to verify by clicking.

i18n and the NDA flow are not cut: both are cheap when designed in from the start and
expensive to retrofit.

---

## 4. Architecture

**Next.js 15 App Router + React Server Components + Server Actions + Prisma +
Postgres (Neon), deployed on Vercel.**

### Rejected alternatives

- **Separate REST route handlers + TanStack Query on the client.** More code, an
  extra serialization boundary, and client-side loading states to design, in exchange
  for nothing the prototype needs. The API is consumed by exactly one client.
- **tRPC.** End-to-end type safety is genuinely nice, but Server Actions already give
  typed server calls from typed components inside one codebase. tRPC would add a
  dependency, a router layer, and setup time to solve a problem that only appears
  when the client is a separate deployable.
- **localStorage / IndexedDB persistence.** Fails the marketplace premise: a reviewer
  opening the deployed link from another browser would see an empty marketplace, and
  "well-designed persistent data model" cannot be demonstrated without a schema.

### Key decisions

**D1 — Catalog filter state lives in URL search params, not in client state.**
Filtered catalog links are shareable, browser back/forward works correctly, and the
page renders on the server with the filter already applied. Filters are parsed once
through a zod schema shared by the asset catalog and the buyer catalog, so an invalid
or hand-edited URL degrades to defaults instead of crashing.

**D2 — One authorization module, `lib/authz`, of pure functions.**
Signatures like `canViewFullAsset(viewer, asset, grant)`, `canEditAsset(viewer, asset)`,
`canModerate(viewer)`, `canMessage(viewer, counterparty)`. Both the UI (what to render)
and the server (what to return, whether to accept a mutation) call the same functions.
Rules are unit-testable in isolation and cannot drift between the two layers, which is
exactly how access-control bugs normally happen.

**D3 — Redaction happens on the server, in the data layer.**
`toTeaserAsset(asset)` and `toFullAsset(asset)` are the only ways an asset reaches a
component. Confidential fields are never serialized into the HTML payload for a viewer
without a grant — they are absent, not hidden with CSS. A prototype that hides gated
data client-side is theatre; this is the difference.

**D4 — Moderation is an append-only audit log, not a boolean flag.**
`ModerationLog` records actor, action, target, reason and timestamp. `User.status` and
`Asset.status` are the current state; the log is the history. Suspension is reversible
and every decision is attributable — which is the behaviour a real platform-manager
tool needs, and a cheap way to show data-model thinking.

**D5 — Soft deletion.**
"Remove a participant" sets `status = REMOVED` and cascades their listings out of the
catalog, but preserves rows. Hard-deleting a user would orphan conversations and
access requests that the counterparty legitimately needs to see.

**D6 — Money is stored as integer euro cents in a single currency.**
No FX, no decimals-in-floats. The reference displays EUR asking prices; a currency
selector without real rates would be a lie.

### Project structure

```
src/
  app/[locale]/...            routes (see section 9)
  server/
    actions/                  Server Actions, one file per aggregate
    queries/                  server-side read functions (return redacted DTOs)
    db.ts                     Prisma client singleton
  lib/
    authz/                    pure authorization rules + tests
    matching/                 pure match scoring + tests
    ai/                       Claude client, prompts, zod schemas, fallbacks
    filters/                  URL search-param schemas + parsers
  components/
    ui/                       primitives (button, card, badge, select, ...)
    domain/                   AssetCard, BuyerCard, MatchBadge, GatedSection, ...
  messages/                   en.json, ru.json
prisma/
  schema.prisma
  seed.ts
tests/
  unit/                       Vitest
  e2e/                        Playwright
```

The rule: everything in `lib/` is pure and dependency-free, so it can be tested
without a database or a network.

---

## 5. Data model

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

### Model notes

- **Teaser and confidential fields live on one row, separated by convention and
  enforced by the redaction functions (D3).** A separate `AssetConfidential` table
  would enforce it at the schema level, but doubles the write path for a prototype;
  the redaction functions are unit-tested instead, which catches the same class of bug.
- **`threadKey`** is a deterministic string (`assetId|buyerId|sellerId`, with a literal
  `none` where `assetId` is absent) carrying the unique constraint. A composite unique
  index over a nullable `assetId` would not work: Postgres treats NULLs as distinct, so
  duplicate no-asset conversations between the same pair would slip through.
- **One mandate per buyer.** Real funds run several theses; supporting many would
  complicate matching and the profile UI for no evaluation benefit. Noted as a future
  improvement.
- **`AssetStatus.PENDING_REVIEW`** gives the manager real work beyond deletion, and
  gives the AI confidentiality check a natural place to sit in the flow.
- **`viewCount`** is incremented once per detail-page render for viewers other than the
  owning seller and the manager, and is seeded with plausible values. It exists because
  the reference product surfaces it and because it makes the "Most popular" sort real
  rather than decorative.

---

## 6. Authorization and visibility

Two orthogonal questions, answered separately: *may this actor perform this action*
(authz) and *which fields may this actor see* (redaction).

| Viewer | Teaser fields | Confidential fields |
|---|---|---|
| Anonymous | published assets only | never |
| Buyer, no grant | published assets | never |
| Buyer, approved grant | yes | yes |
| Owning seller | own assets, any status | yes |
| Manager | any asset, any status | yes |
| Suspended / removed user | no access to the app beyond a notice screen | never |

Additional invariants, each with a unit test:

- A suspended seller's published assets disappear from the public catalog immediately
  and return on reinstatement.
- A suspended user cannot send messages or create access requests, and cannot log in
  past the account-status screen.
- Only the owning seller decides on an access request for their asset.
- An approved grant is revocable; revocation re-hides confidential fields.
- A buyer cannot open a second access request for an asset they have already
  requested — enforced by the unique constraint, surfaced in the UI as the current
  request state rather than as an error.
- Every Server Action re-checks authorization server-side. UI gating is a convenience,
  never the control.

---

## 7. Matching

Pure function, no I/O:

```ts
scoreMatch(mandate: Mandate, asset: Asset): { score: number; reasons: MatchReason[] }
```

Weights (sum 100):

| Criterion | Weight | Partial credit |
|---|---|---|
| Category in mandate categories | 30 | — |
| Country in mandate countries | 20 | — |
| Asking price within [min, max] | 25 | half credit within 20% outside the band |
| Business status matches | 15 | — |
| Licence type in mandate licence types | 10 | — |

An empty array in the mandate means "no preference" and scores full credit — an
unfilled mandate should not read as a mismatch with everything.

`MatchReason` is `{ code, kind: 'MATCH' | 'PARTIAL' | 'MISMATCH', values }` — a code,
not a sentence, so the UI can translate it (i18n) and the AI layer can phrase it
without inventing facts.

Presentation bands: `>= 70` Strong match, `>= 45` Good match, below that no badge.
Matching never hides results; it sorts and annotates them. Hard exclusions (unpublished
asset, suspended owner) are filtering, done in the query, not in scoring.

The same function powers both directions: a buyer's "recommended assets" and a seller's
"matched buyers" for a given listing.

---

## 8. AI layer

Model: `claude-opus-5`, held in a single exported constant. All three tasks are short
and structured, so if the search box proves latency-sensitive in practice, dropping to
`claude-haiku-4-5` is a one-line change — but that is a measured decision, not a
pre-emptive downgrade.

**Every AI feature degrades gracefully.** With no `ANTHROPIC_API_KEY`, the app runs
fully; AI entry points either hide or fall back, and the README says so. A reviewer
cloning the repo without a key must still see a complete product.

1. **Natural-language search.** "EMI licence in Malta under 2M" → structured filters,
   returned as JSON, validated against the same zod schema the URL parser uses. On an
   invalid response or a missing key, fall back to plain text search over the teaser
   title and description. Parsed filters are written into the URL, so the user sees and
   can adjust what the AI understood — no black box.

2. **Match explanation.** Input is the already-computed `MatchReason[]`; the model only
   phrases them in the viewer's language. Facts come from the deterministic scorer, so
   the model cannot hallucinate a reason the data does not support.

3. **Confidentiality validation on publish.** The model reads the teaser text plus the
   confidential fields and flags identifying leaks (legal name, unique regulator ref,
   an exact revenue figure that appears in both) and thin descriptions. Advisory, not
   blocking: it surfaces warnings the seller may override. This is the feature the
   whole design points at — the AI protects the NDA boundary the product is built on,
   rather than decorating the UI with a chatbot.

All AI calls happen server-side; the key never reaches the client. Failures are caught
and logged, never surfaced as a crash.

---

## 9. Screens and flows

Routes are locale-prefixed: `/[locale]/...` with `en` and `es`.

**Public**
- `/` — landing in N5Deal's visual language: dark, value proposition, aggregate stats
  from real seed data, "Start Buying" / "Start Selling".
- `/listings` — asset catalog. Sidebar filters (category with live counts, country,
  price range, business status), sort, natural-language search box, teaser cards.
- `/listings/[id]` — teaser detail plus a `GatedSection` that either shows confidential
  data or the request-access call to action, depending on grant state.
- `/login` — email/password, plus three one-click demo logins (Buyer / Seller / Manager).
  Credentials are shown on the page; the reviewer never types a password.

**Buyer**
- `/dashboard` — mandate summary, recommended assets with match badges, access request
  statuses, unread messages.
- `/profile` — profile and mandate editing (the assignment's "describe your investment
  interests").
- `/favorites`.

**Seller**
- `/dashboard` — own listings by status, incoming access requests, buyers matched to a
  selected listing.
- `/listings/new`, `/listings/[id]/edit` — publish flow with the AI confidentiality
  check before submission.
- `/buyers` — buyer catalog with filters (buyer type, categories of interest, countries,
  ticket size) and match scoring against a chosen listing.
- `/buyers/[id]` — buyer profile and mandate, contact action.

**Both**
- `/inbox`, `/inbox/[conversationId]`.

**Manager**
- `/admin` — tabs for Participants (buyers and sellers, searchable and filterable by
  status), Assets (including the `PENDING_REVIEW` queue), and the moderation log.
  Actions: approve/reject a listing, suspend/reinstate/remove a participant, each
  requiring a reason that is written to the log.

### Core flow, end to end

Seller drafts a listing → AI checks the teaser for leaks → submits → manager approves →
listing appears in the public catalog as an anonymous teaser → buyer filters (or asks in
natural language), sees a match badge and its explanation → requests access with a
message → seller reviews the buyer's profile and mandate, approves → confidential fields
unlock for that buyer → conversation opens → both message in the inbox. At any point the
manager can suspend either party, and the listing leaves the catalog immediately.

---

## 10. Demo data

Seeded idempotently, re-runnable via `pnpm db:reset`:

- ~40 assets across all five categories and ~15 jurisdictions, price range roughly
  €150k–€25M, mixed `ACTIVE` and `LICENSE_ONLY`, realistic regulator names.
- 12 buyers with deliberately varied mandates, including narrow ones (single category,
  single country) and broad ones, so match scores visibly differ.
- 6 sellers, 1 manager.
- Pre-existing state so every screen is populated on first load: access requests in each
  status, a few conversations with unread messages, one listing in `PENDING_REVIEW`, one
  suspended seller with their listings already hidden, one `SOLD` asset.

---

## 11. Testing

**Vitest (pure logic, no database):**
- `scoreMatch` — each criterion, partial price credit, empty-mandate semantics,
  band boundaries.
- `lib/authz` — the full matrix from section 6, including suspended and removed users.
- Redaction — `toTeaserAsset` never emits a confidential key, asserted against the
  Prisma-generated type so a new confidential field cannot be forgotten.
- AI schema validation — a malformed model response falls back instead of throwing.
- Filter parsing — hostile URL params degrade to defaults.

**Playwright (three role flows against a seeded database):**
1. Seller publishes a listing and approves an access request.
2. Buyer filters the catalog, requests access, and messages the seller.
3. Manager suspends a seller and the listing disappears from the public catalog.

---

## 12. Deployment

Vercel + Neon Postgres. `DATABASE_URL`, `AUTH_SECRET`, optional `ANTHROPIC_API_KEY`.
README documents local setup (`pnpm i`, `pnpm db:push`, `pnpm db:seed`, `pnpm dev`) and
the demo credentials.

---

## 13. Assumptions

1. Passwords are demo-grade; hashing is real (bcrypt) but there is no verification,
   reset, or rate limiting.
2. The Manager role is seeded only — it is not self-registerable, which is correct for
   a real platform and avoids an admin-escalation hole in a public demo.
3. All amounts are EUR. No FX conversion.
4. One investment mandate per buyer.
5. The data room is a URL field; no file storage.
6. "Remove" is a soft delete for audit integrity.
7. Messaging is not real-time.
8. Locale is a user preference and a URL segment; content itself (listing text) is
   authored in one language and not machine-translated.

---

## 14. What we would improve with more time

- Multiple mandates per buyer, with per-mandate match feeds.
- Semantic search over listings (pgvector embeddings) alongside the structured filters.
- Real notification delivery (email/digest) for access requests and messages.
- Document handling: NDA e-signature, a real data room with per-file access grants.
- Saved searches with alerts when a matching listing is published.
- Server-side pagination and cursor-based infinite scroll; at 40 seeded assets it is
  not yet needed, which is why it is deliberately absent.
- Rate limiting and audit trails for authentication events.
- Accessibility pass beyond semantic HTML and keyboard-reachable controls.
