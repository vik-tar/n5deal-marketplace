This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Authentication

Sessions are Auth.js (`next-auth@beta`, v5) JWTs, but `getViewer()` (`src/server/session.ts`)
does not trust the token's `status` snapshot — it re-reads the `User` row from Postgres on
every call. That costs one extra round trip per request, in exchange for a correctness
guarantee: when a manager suspends an account, the suspension takes effect on that user's
very next request, rather than waiting until they next sign in and get a fresh JWT.

## Matching at scale

`getRecommendedAssets` (`src/server/queries/assets.ts`) and its mirror image `listBuyers`
(`src/server/queries/buyers.ts`) both score **in memory**: they read every row the visibility
floor admits, run `scoreMatch` (`src/lib/matching`) over each one, drop the `NONE` band, and sort
the result in JavaScript. At this prototype's size — 34 published listings and 12 buyers — that is
correct, simple, and has one decisive advantage over a SQL ranking: the buyer's view of a match
and the seller's view of the same match come from the same pure function, so the two sides can
never disagree about a score.

It does not survive growth. Every recommendation read is a full table scan plus an O(n log n) sort
in the web process, and the work is redone from scratch on every page load. A real deployment
would split it in two:

- **Filter in the database.** The mandate's hard constraints (category, jurisdiction, licence
  type, business status, ticket range) are ordinary `WHERE` clauses. Applying them in Postgres
  turns "score all listings" into "score the listings that could plausibly match", which is a small
  fraction of the catalogue for any real mandate.
- **Precompute the score.** The remaining ranking is a function of a `(mandate, asset)` pair and
  changes only when one of them changes. A background job — triggered by a mandate save, a listing
  publish, or a nightly sweep — writing a `match_score` row per pair turns the read into an indexed
  `ORDER BY score DESC LIMIT n`, and keeps `scoreMatch` as the single definition of the number.

Both changes are additive: `scoreMatch` itself stays exactly as it is, and stays the one place the
scoring rule lives.

Two rules survive that refactor unchanged, and would have to be reimplemented alongside it:
a mandate with `specificity === 0` constrains nothing, scores every listing at 100, and must never
be turned into a ranking (`isMandateRankable`); and a `NONE`-banded match is never volunteered as
a recommendation, however it was computed (`isRecommendableMatch`).

## Messaging

**A manager cannot read a conversation.** Every other read in this codebase pairs "the owner"
with "a manager" — `canModerate` widens `canViewAsset`, `canViewFullAsset`, the access-request
queue and the buyer directory alike. `getConversation` and `listConversations`
(`src/server/queries/conversations.ts`) are the one deliberate exception: a thread is visible to
the two parties on it and to nobody else. A manager holds neither a `BuyerProfile` nor a
`SellerProfile`, so they are a party to no thread and are refused by the ordinary participation
rule rather than by a special case, and `navKeysFor` (`src/lib/nav.ts`) does not offer them the
inbox at all.

That restraint is a product decision, not an oversight. Moderation acts on accounts and listings
— suspend a seller, reject a teaser, revoke a grant — and none of those decisions need the
contents of a private negotiation. A console that can read every conversation on the marketplace
is a standing privacy liability that buys moderation nothing, so this one is not built. If
abuse reporting is ever needed, the right shape is a party *referring* a specific thread to a
manager, which is an explicit disclosure by someone who was already in it.

**Who the counterparty is** is decided by the same NDA gate as the rest of a listing. A seller's
`companyName` is exactly as confidential as the listing's revenue figures (see `getAssetDetail`),
and messaging deliberately requires no approved grant — `canMessage` allows cold contact, because
a buyer approaching a seller from a teaser is a required capability. Those two facts together
would make the inbox a back door around the gate, so the inbox closes it: the seller behind a
thread is named to the buyer only when `canViewFullAsset` says that thread's listing is genuinely
open to them, and a thread with no listing attached never names them. The buyer's side needs no
such rule — their `displayName` is already visible to every seller through `/buyers`.

**One thread per relationship** is enforced by Postgres, not by application logic.
`Conversation.threadKey` is unique and `buildThreadKey` (`src/lib/thread-key.ts`) derives it from
the (asset, buyer, seller) triple with a `noasset` sentinel, because a composite unique index over
those three columns would treat every NULL `assetId` as distinct and allow unlimited duplicate
asset-less threads between the same two parties. Both writers — `startConversation` and the
conversation `decideAccess` opens on approval — key on it and reuse what is already there.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
