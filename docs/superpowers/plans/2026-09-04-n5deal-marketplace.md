# N5Deal Marketplace Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working three-role marketplace for licensed financial assets — buyers, sellers and a platform manager — with real persistence, an NDA-gated teaser flow, deterministic match scoring, and an AI layer on top.

**Architecture:** Next.js App Router with React Server Components reading through a server query layer, and Server Actions for every mutation. All business rules live in pure, dependency-free modules under `src/lib` (matching, authorization, filter parsing, AI schemas) so they are unit-testable without a database. Confidential asset fields are stripped server-side before serialization, never hidden in the client. Postgres via Prisma; moderation is an append-only audit log.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, Prisma + PostgreSQL (Neon), Auth.js v5 (credentials, JWT sessions), next-intl v4, zod v4, Vitest, Playwright, `@anthropic-ai/sdk`.

**Spec:** `docs/superpowers/specs/2026-09-04-n5deal-marketplace-design.md`

## Global Constraints

- **TypeScript strict mode is on.** No `any` in committed code; use `unknown` plus a zod parse at boundaries.
- **Money is integer euro cents** everywhere (`askingPriceCents`, `ticketMinCents`, ...). Never floats, never a second currency.
- **Everything under `src/lib/` is pure**: no Prisma import at runtime, no `fetch`, no environment reads. Type-only imports from the generated Prisma client are allowed.
- **Every Server Action re-checks authorization server-side** through `src/lib/authz`. UI gating is convenience, never the control.
- **Confidential asset fields** are exactly: `legalName`, `revenueCents`, `ebitdaCents`, `clientCount`, `dataRoomUrl`, `confidentialNotes`. They may only reach a component through `toFullAsset`.
- **Prisma import path is `@/generated/prisma/client`.** The `prisma-client` generator emits no index file; `src/generated/prisma/` contains `client.ts`, `enums.ts` and `models.ts`, and `client.ts` re-exports `PrismaClient`, all nine enums and all ten model types.
- **The five money columns are `BigInt` in the database and `number` above the DTO layer.** `Asset.askingPriceCents`, `Asset.revenueCents`, `Asset.ebitdaCents`, `Mandate.ticketMinCents` and `Mandate.ticketMaxCents` are Postgres `bigint`, because `Int` caps at €21.47M and the seed spans up to €25M. Prisma therefore hands them back as JavaScript `bigint`. Convert to `number` in the DTO layer (`src/lib/dto/`) and in the query layer — `bigint` must never reach a React component, because Next.js cannot serialise it across the server/client boundary. `Number.MAX_SAFE_INTEGER` is €90 trillion in cents, so the narrowing is lossless. Conversely, Prisma `where` clauses filtering these columns need `BigInt(...)` around the `number` bounds coming from the URL filters.
- **No user-facing English or Russian string literals in components.** All copy goes through `next-intl` message keys in `messages/en.json` and `messages/ru.json`.
- **Every AI feature must degrade.** With `ANTHROPIC_API_KEY` unset the app runs fully; AI entry points hide or fall back to deterministic behaviour.
- **Anthropic model id:** `claude-opus-5` (exact string, never with a date suffix).
- **Commit after every task.** Conventional commit prefixes (`feat:`, `test:`, `chore:`, `docs:`).

## File Structure

```
prisma/
  schema.prisma                  data model (Task 2)
  seed.ts                        demo data (Task 10)
prisma.config.ts                 schema path, migrations, seed command (Task 2)
src/
  generated/prisma/              Prisma client output (git-ignored)
  i18n/
    routing.ts                   locales, defaultLocale (Task 3)
    request.ts                   per-request messages (Task 3)
    navigation.ts                Link/redirect/usePathname/useRouter (Task 3)
  proxy.ts                       next-intl locale middleware (Task 3)
  app/[locale]/
    layout.tsx                   shell: provider, header, theme (Task 4)
    page.tsx                     landing (Task 21)
    login/page.tsx               credentials + demo logins (Task 11)
    suspended/page.tsx           account status notice (Task 11)
    listings/page.tsx            asset catalog (Task 12)
    listings/[id]/page.tsx       asset detail + gate (Task 13)
    listings/new/page.tsx        create listing (Task 15)
    listings/[id]/edit/page.tsx  edit listing (Task 15)
    buyers/page.tsx              buyer catalog (Task 17)
    buyers/[id]/page.tsx         buyer detail (Task 17)
    profile/page.tsx             buyer profile + mandate (Task 16)
    dashboard/page.tsx           role-dispatching dashboard (Task 18)
    inbox/page.tsx               conversation list (Task 19)
    inbox/[id]/page.tsx          thread (Task 19)
    admin/page.tsx               moderation console (Task 20)
  app/api/auth/[...nextauth]/route.ts   Auth.js handlers (Task 11)
  auth.ts                        Auth.js config (Task 11)
  server/
    db.ts                        PrismaClient singleton (Task 2)
    session.ts                   getViewer() -> Viewer | null (Task 11)
    queries/
      assets.ts                  catalog + detail reads, redaction applied (Task 12,13)
      buyers.ts                  buyer catalog reads (Task 17)
      conversations.ts           inbox reads (Task 19)
      admin.ts                   participant/asset reads for manager (Task 20)
    actions/
      assets.ts                  create/update/submit/moderate listing (Task 15,20)
      access-requests.ts         request/decide/revoke (Task 14)
      profile.ts                 buyer profile + mandate (Task 16)
      messages.ts                start conversation, send message (Task 19)
      moderation.ts              suspend/reinstate/remove (Task 20)
  lib/
    matching/
      types.ts                   MandateCriteria, AssetCriteria, MatchResult
      score.ts                   scoreMatch()
      index.ts
    authz/
      types.ts                   Viewer, AssetRef, GrantState
      rules.ts                   can* predicates
      index.ts
    filters/
      asset-filters.ts           zod schema + parse + serialize
      buyer-filters.ts           zod schema + parse + serialize
    dto/
      asset.ts                   toTeaserAsset / toFullAsset / toAssetDto
    ai/
      client.ts                  isAiEnabled(), callClaude()
      search.ts                  parseSearchQuery()
      explain.ts                 explainMatch()
      teaser-review.ts           reviewTeaser()
    thread-key.ts                buildThreadKey()
    money.ts                     formatCents(), parseEuros()
  components/
    ui/                          Button, Card, Badge, Select, RangeInput, Tabs
    domain/                      AssetCard, BuyerCard, MatchBadge, GatedSection,
                                 FilterSidebar, StatusPill, LocaleSwitcher
messages/
  en.json  ru.json
tests/
  unit/                          Vitest, mirrors src/lib
  e2e/                           Playwright
```

---

### Task 1: Project scaffold and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `src/app/globals.css`, `.gitignore`, `.env.example`
- Create: `tests/unit/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm test:watch` scripts; path alias `@/*` -> `src/*`.

- [ ] **Step 1: Scaffold the app**

```bash
cd /Users/viktortaraskevych/Downloads/n5deal-marketplace
pnpm dlx create-next-app@latest . --typescript --tailwind --app --src-dir \
  --import-alias "@/*" --eslint --no-turbopack --use-pnpm
```

Answer "yes" to overwriting nothing — the directory already contains `docs/` and `.git/`, which the scaffolder leaves alone.

- [ ] **Step 2: Add test and validation dependencies**

```bash
pnpm add zod
pnpm add -D vitest @vitejs/plugin-react vite-tsconfig-paths @types/node
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 4: Write a smoke test that fails**

Create `tests/unit/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatCents } from '@/lib/money'

describe('formatCents', () => {
  it('renders euro cents as a grouped euro amount', () => {
    expect(formatCents(250_000_00, 'en')).toBe('€250,000')
  })

  it('renders millions compactly', () => {
    expect(formatCents(2_400_000_00, 'en')).toBe('€2.4M')
  })

  it('localises grouping', () => {
    expect(formatCents(250_000_00, 'ru')).toBe('250 000 €')
  })
})
```

- [ ] **Step 5: Run it and confirm it fails**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "@/lib/money"`.

- [ ] **Step 6: Implement `formatCents`**

Create `src/lib/money.ts`:

```ts
/** Formats integer euro cents for display. Compact above €1M. */
export function formatCents(cents: number, locale: string): string {
  const euros = Math.round(cents / 100)
  const useCompact = euros >= 1_000_000
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    notation: useCompact ? 'compact' : 'standard',
    maximumFractionDigits: useCompact ? 1 : 0,
  }).format(euros)
}

/** Parses a user-entered euro amount into integer cents. Returns null when unparseable. */
export function parseEuros(input: string): number | null {
  const normalised = input.replace(/[\s ,]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null
  return Math.round(Number(normalised) * 100)
}
```

- [ ] **Step 7: Run the test**

Run: `pnpm test`
Expected: PASS. If the Russian assertion fails, adjust the expected string to whatever `Intl` produces on Node 20+ for `ru` — record the real output rather than forcing a format.

- [ ] **Step 8: Write `.env.example` and extend `.gitignore`**

`.env.example`:

```
DATABASE_URL="postgresql://user:password@host/db?sslmode=require"
AUTH_SECRET="generate-with-openssl-rand-base64-32"
# Optional. Without it the app runs fully and AI features fall back.
ANTHROPIC_API_KEY=""
```

Append to `.gitignore`:

```
.env
src/generated
/test-results
/playwright-report
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest and money formatting"
```

---

### Task 2: Prisma schema and database access

**Files:**
- Create: `prisma/schema.prisma`, `prisma.config.ts`, `src/server/db.ts`
- Modify: `package.json` (db scripts)

**Interfaces:**
- Consumes: `DATABASE_URL` from Task 1's `.env.example`.
- Produces: generated client at `@/generated/prisma/client` exporting `PrismaClient` and every enum (`Role`, `UserStatus`, `AssetCategory`, `BusinessStatus`, `AssetStatus`, `AccessStatus`, `BuyerType`, `ModAction`, `ModTargetType`); `prisma` singleton exported from `@/server/db`.

- [ ] **Step 1: Install Prisma**

```bash
pnpm add @prisma/client @prisma/adapter-pg pg
pnpm add -D prisma tsx @types/pg
```

- [ ] **Step 2: Write the schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role           { BUYER SELLER MANAGER }
enum UserStatus     { ACTIVE SUSPENDED REMOVED }
enum AssetCategory  { BANK FINTECH PAYMENT EMI CRYPTO }
enum BusinessStatus { ACTIVE LICENSE_ONLY }
enum AssetStatus    { DRAFT PENDING_REVIEW PUBLISHED REJECTED SUSPENDED SOLD }
enum AccessStatus   { REQUESTED APPROVED DECLINED REVOKED }
enum BuyerType      { PE_FUND STRATEGIC FAMILY_OFFICE INDIVIDUAL }
enum ModAction      { SUSPEND REINSTATE REMOVE APPROVE_LISTING REJECT_LISTING }
enum ModTargetType  { USER ASSET }

model User {
  id            String        @id @default(cuid())
  email         String        @unique
  passwordHash  String
  role          Role
  status        UserStatus    @default(ACTIVE)
  locale        String        @default("en")
  createdAt     DateTime      @default(now())

  buyerProfile   BuyerProfile?
  sellerProfile  SellerProfile?
  sentMessages   Message[]        @relation("MessageSender")
  moderationActs ModerationLog[]  @relation("ModerationActor")
  accessDecided  AccessRequest[]  @relation("AccessDecider")

  @@index([role, status])
}

model BuyerProfile {
  id          String    @id @default(cuid())
  userId      String    @unique
  user        User      @relation(fields: [userId], references: [id])
  displayName String
  buyerType   BuyerType
  country     String
  bio         String    @default("")
  websiteUrl  String?
  verified    Boolean   @default(false)
  createdAt   DateTime  @default(now())

  mandate        Mandate?
  accessRequests AccessRequest[]
  conversations  Conversation[]
  favorites      Favorite[]
}

model Mandate {
  id               String           @id @default(cuid())
  buyerProfileId   String           @unique
  buyerProfile     BuyerProfile     @relation(fields: [buyerProfileId], references: [id])
  categories       AssetCategory[]
  countries        String[]
  licenceTypes     String[]
  businessStatuses BusinessStatus[]
  ticketMinCents   BigInt?
  ticketMaxCents   BigInt?
  timelineMonths   Int?
  notes            String           @default("")
  updatedAt        DateTime         @updatedAt
}

model SellerProfile {
  id          String   @id @default(cuid())
  userId      String   @unique
  user        User     @relation(fields: [userId], references: [id])
  companyName String
  contactName String
  country     String
  websiteUrl  String?
  verified    Boolean  @default(false)
  createdAt   DateTime @default(now())

  assets        Asset[]
  conversations Conversation[]
}

model Asset {
  id              String         @id @default(cuid())
  publicRef       String         @unique
  sellerProfileId String
  sellerProfile   SellerProfile  @relation(fields: [sellerProfileId], references: [id])
  status          AssetStatus    @default(DRAFT)

  // Teaser (public)
  category          AssetCategory
  licenceType       String
  businessType      String
  country           String
  regulator         String
  businessStatus    BusinessStatus
  askingPriceCents  BigInt
  employees         Int
  yearOfIssue       Int
  included          String[]
  teaserTitle       String
  teaserDescription String

  // Confidential (gated behind an approved AccessRequest)
  legalName          String
  revenueCents       BigInt
  ebitdaCents        BigInt
  clientCount        Int
  dataRoomUrl        String?
  confidentialNotes  String  @default("")

  publishedAt     DateTime?
  rejectionReason String?
  viewCount       Int       @default(0)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  accessRequests AccessRequest[]
  conversations  Conversation[]
  favorites      Favorite[]

  @@index([status, category, country])
  @@index([status, publishedAt])
}

model AccessRequest {
  id             String       @id @default(cuid())
  assetId        String
  asset          Asset        @relation(fields: [assetId], references: [id])
  buyerProfileId String
  buyerProfile   BuyerProfile @relation(fields: [buyerProfileId], references: [id])
  status         AccessStatus @default(REQUESTED)
  message        String       @default("")
  requestedAt    DateTime     @default(now())
  decidedAt      DateTime?
  decidedByUserId String?
  decidedBy      User?        @relation("AccessDecider", fields: [decidedByUserId], references: [id])

  @@unique([assetId, buyerProfileId])
  @@index([buyerProfileId, status])
}

model Conversation {
  id              String        @id @default(cuid())
  threadKey       String        @unique
  assetId         String?
  asset           Asset?        @relation(fields: [assetId], references: [id])
  buyerProfileId  String
  buyerProfile    BuyerProfile  @relation(fields: [buyerProfileId], references: [id])
  sellerProfileId String
  sellerProfile   SellerProfile @relation(fields: [sellerProfileId], references: [id])
  createdAt       DateTime      @default(now())
  lastMessageAt   DateTime      @default(now())

  messages Message[]

  @@index([buyerProfileId, lastMessageAt])
  @@index([sellerProfileId, lastMessageAt])
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  senderUserId   String
  sender         User         @relation("MessageSender", fields: [senderUserId], references: [id])
  body           String
  createdAt      DateTime     @default(now())
  readAt         DateTime?

  @@index([conversationId, createdAt])
}

model Favorite {
  id             String       @id @default(cuid())
  buyerProfileId String
  buyerProfile   BuyerProfile @relation(fields: [buyerProfileId], references: [id])
  assetId        String
  asset          Asset        @relation(fields: [assetId], references: [id])
  createdAt      DateTime     @default(now())

  @@unique([buyerProfileId, assetId])
}

model ModerationLog {
  id           String        @id @default(cuid())
  actorUserId  String
  actor        User          @relation("ModerationActor", fields: [actorUserId], references: [id])
  action       ModAction
  targetType   ModTargetType
  targetId     String
  reason       String
  createdAt    DateTime      @default(now())

  @@index([targetType, targetId, createdAt])
}
```

- [ ] **Step 3: Configure the Prisma CLI**

Create `prisma.config.ts`:

```ts
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
```

Add scripts to `package.json`:

```json
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev",
"db:reset": "prisma migrate reset --force",
"db:seed": "prisma db seed",
"db:studio": "prisma studio"
```

- [ ] **Step 4: Create the database and run the first migration**

Create a free Neon project, copy the pooled connection string into `.env` as `DATABASE_URL`, then:

```bash
pnpm db:migrate --name init
```

Expected: migration applied, client generated into `src/generated/prisma`.

- [ ] **Step 5: Write the client singleton**

Create `src/server/db.ts`:

```ts
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

The singleton exists because Next.js hot-reload would otherwise open a new pool on every edit and exhaust Neon's connection limit.

- [ ] **Step 6: Verify the connection**

```bash
pnpm dlx tsx -e "import {prisma} from './src/server/db'; prisma.user.count().then(c => { console.log('users:', c); process.exit(0) })"
```

Expected: `users: 0`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema, migrations and client singleton"
```

---

### Task 3: Internationalisation foundation

**Files:**
- Create: `src/i18n/routing.ts`, `src/i18n/request.ts`, `src/i18n/navigation.ts`, `src/proxy.ts`, `messages/en.json`, `messages/ru.json`
- Modify: `next.config.ts`
- Move: `src/app/layout.tsx` and `src/app/page.tsx` into `src/app/[locale]/`

**Interfaces:**
- Consumes: nothing.
- Produces: `routing` (locales `['en','ru']`, defaultLocale `'en'`); `Link`, `redirect`, `usePathname`, `useRouter`, `getPathname` from `@/i18n/navigation`; `useTranslations` / `getTranslations` usable everywhere.

i18n is set up before any UI exists because retrofitting message keys across finished screens costs several hours; doing it first costs nothing per screen.

- [ ] **Step 1: Install**

```bash
pnpm add next-intl
```

- [ ] **Step 2: Define routing**

Create `src/i18n/routing.ts`:

```ts
import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'ru'],
  defaultLocale: 'en',
})

export type AppLocale = (typeof routing.locales)[number]
```

Create `src/i18n/navigation.ts`:

```ts
import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
```

- [ ] **Step 3: Wire the request config and middleware**

Create `src/i18n/request.ts`:

```ts
import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
```

Create `src/proxy.ts` (Next.js 16 deprecates the `middleware.ts` file convention in favour of `proxy.ts`; same contents, same matcher):

```ts
import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

export default createMiddleware(routing)

export const config = {
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
}
```

Update `next.config.ts`:

```ts
import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {}

export default withNextIntl(nextConfig)
```

- [ ] **Step 4: Restructure the app directory**

```bash
mkdir -p src/app/\[locale\]
git mv src/app/layout.tsx src/app/\[locale\]/layout.tsx
git mv src/app/page.tsx src/app/\[locale\]/page.tsx
```

Rewrite `src/app/[locale]/layout.tsx`:

```tsx
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import '../globals.css'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()

  return (
    <html lang={locale} className="dark">
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Seed the message catalogues**

Create `messages/en.json`:

```json
{
  "common": {
    "appName": "N5Deal",
    "signIn": "Sign in",
    "signOut": "Sign out",
    "cancel": "Cancel",
    "save": "Save"
  },
  "nav": {
    "listings": "All listings",
    "buyers": "Buyers",
    "dashboard": "Dashboard",
    "inbox": "Inbox",
    "admin": "Admin"
  }
}
```

Create `messages/ru.json` with the same key structure:

```json
{
  "common": {
    "appName": "N5Deal",
    "signIn": "Войти",
    "signOut": "Выйти",
    "cancel": "Отмена",
    "save": "Сохранить"
  },
  "nav": {
    "listings": "Все объекты",
    "buyers": "Покупатели",
    "dashboard": "Кабинет",
    "inbox": "Сообщения",
    "admin": "Админка"
  }
}
```

Replace the body of `src/app/[locale]/page.tsx` with a translated placeholder so the wiring is provable:

```tsx
import { useTranslations } from 'next-intl'

export default function Home() {
  const t = useTranslations('nav')
  return <main className="p-8"><h1>{t('listings')}</h1></main>
}
```

- [ ] **Step 6: Verify both locales render**

```bash
pnpm dev
```

Open `http://localhost:3000/en` — expect "All listings". Open `http://localhost:3000/ru` — expect "Все объекты". Open `http://localhost:3000/` — expect a redirect to `/en`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add next-intl routing with English and Russian catalogues"
```

---

### Task 4: Design system and application shell

**Files:**
- Modify: `src/app/globals.css`, `src/app/[locale]/layout.tsx`
- Create: `src/components/ui/button.tsx`, `card.tsx`, `badge.tsx`, `field.tsx`, `tabs.tsx`
- Create: `src/components/domain/site-header.tsx`, `src/components/domain/locale-switcher.tsx`, `src/components/domain/status-pill.tsx`
- Create: `src/lib/cn.ts`

**Interfaces:**
- Consumes: `Link` from `@/i18n/navigation`.
- Produces: `cn(...classes)`; `<Button variant="primary"|"secondary"|"ghost"|"danger" size="sm"|"md">`; `<Card>`, `<CardHeader>`, `<CardBody>`; `<Badge tone="neutral"|"accent"|"success"|"warning"|"danger">`; `<Field label htmlFor error>`; `<Tabs items={{id,label}[]} activeId>`; `<StatusPill status>` for `AssetStatus` and `UserStatus`; `<SiteHeader viewer>`.

The visual target is the reference product: near-black ground, white type, a single accent, horizontal cards, small uppercase meta labels, flag emoji for jurisdiction.

- [ ] **Step 1: Define the theme tokens**

Replace the contents of `src/app/globals.css`:

```css
@import "tailwindcss";

@theme {
  --color-ground: #0a0b0d;
  --color-surface: #121418;
  --color-surface-2: #1a1d23;
  --color-border: #262a32;
  --color-ink: #f4f5f7;
  --color-ink-muted: #9aa1ad;
  --color-accent: #3b82f6;
  --color-accent-ink: #ffffff;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --radius-card: 0.75rem;
}

html, body {
  background: var(--color-ground);
  color: var(--color-ink);
}

.meta-label {
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-ink-muted);
}
```

- [ ] **Step 2: Add the class-merge helper**

```bash
pnpm add clsx tailwind-merge
```

Create `src/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 3: Build the primitives**

Create `src/components/ui/button.tsx`:

```tsx
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:opacity-90',
  secondary: 'bg-surface-2 text-ink border border-border hover:bg-surface',
  ghost: 'text-ink-muted hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition',
        'disabled:opacity-50 disabled:pointer-events-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
```

Create `card.tsx`, `badge.tsx`, `field.tsx` and `tabs.tsx` following the same shape: a typed variant map, `cn()` merging, native props spread, and a visible focus ring on every interactive element.

- [ ] **Step 4: Build the header**

Create `src/components/domain/site-header.tsx`. It takes `viewer: Viewer | null` (the type arrives in Task 7; until then type the prop as `{ role: string; email: string } | null` and tighten it in Task 11). It renders the wordmark linking to `/`, the nav items visible to the viewer's role (`listings` for everyone, `buyers` for sellers and managers, `dashboard`/`inbox` when signed in, `admin` for managers), the locale switcher, and either the sign-in link or the email plus a sign-out button.

Create `locale-switcher.tsx` as a client component that reads `usePathname()` from `@/i18n/navigation` and pushes the same pathname under the other locale, preserving search params.

- [ ] **Step 5: Mount the header in the layout**

Add `<SiteHeader viewer={null} />` above `{children}` in `src/app/[locale]/layout.tsx`, wrapped in a `<div className="min-h-screen">`. The real viewer is passed in Task 11.

- [ ] **Step 6: Verify**

Run `pnpm dev`, open `/en`, confirm the dark shell renders, the locale switcher moves between `/en` and `/ru` without losing the path, and tabbing shows focus rings.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add dark design system and application shell"
```

---

### Task 5: Match scoring

**Files:**
- Create: `src/lib/matching/types.ts`, `src/lib/matching/score.ts`, `src/lib/matching/index.ts`
- Test: `tests/unit/matching/score.test.ts`

**Interfaces:**
- Consumes: enum types from `@/generated/prisma/client` (type-only import).
- Produces:
  - `scoreMatch(mandate: MandateCriteria, asset: AssetCriteria): MatchResult` — the result carries `specificity` (0-5), the count of criteria the mandate constrains
  - `MATCH_WEIGHTS: Record<MatchReasonCode, number>`
  - types `MandateCriteria`, `AssetCriteria`, `MatchReason`, `MatchReasonCode`, `MatchReasonKind`, `MatchBand`, `MatchResult`

This function is used in both directions: a buyer's recommended assets (Task 18) and a seller's matched buyers (Task 17). It is pure so both callers get identical numbers.

- [ ] **Step 1: Define the types**

Create `src/lib/matching/types.ts`:

```ts
import type { AssetCategory, BusinessStatus } from '@/generated/prisma/client'

/** The buyer's stated interests. Empty arrays and null bounds mean "no preference". */
export interface MandateCriteria {
  categories: AssetCategory[]
  countries: string[]
  licenceTypes: string[]
  businessStatuses: BusinessStatus[]
  ticketMinCents: number | null
  ticketMaxCents: number | null
}

/** The comparable facets of a listing. */
export interface AssetCriteria {
  category: AssetCategory
  country: string
  licenceType: string
  businessStatus: BusinessStatus
  askingPriceCents: number
}

export type MatchReasonCode =
  | 'CATEGORY'
  | 'COUNTRY'
  | 'PRICE'
  | 'BUSINESS_STATUS'
  | 'LICENCE_TYPE'

export type MatchReasonKind = 'MATCH' | 'PARTIAL' | 'MISMATCH' | 'NO_PREFERENCE'

/** A translatable, machine-readable justification. Never a sentence. */
export interface MatchReason {
  code: MatchReasonCode
  kind: MatchReasonKind
  weight: number
  earned: number
}

export type MatchBand = 'STRONG' | 'GOOD' | 'NONE'

export interface MatchResult {
  score: number
  band: MatchBand
  /**
   * How many of the five criteria the mandate actually constrains, 0-5.
   * A score of 100 at specificity 0 means "this mandate excludes nothing",
   * not "this is a strong fit" — consumers must not rank on score alone.
   */
  specificity: number
  reasons: MatchReason[]
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/matching/score.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { scoreMatch } from '@/lib/matching'
import type { AssetCriteria, MandateCriteria } from '@/lib/matching'

const asset: AssetCriteria = {
  category: 'EMI',
  country: 'MT',
  licenceType: 'SEMI',
  businessStatus: 'ACTIVE',
  askingPriceCents: 1_000_000_00,
}

const narrowMandate: MandateCriteria = {
  categories: ['EMI'],
  countries: ['MT'],
  licenceTypes: ['SEMI'],
  businessStatuses: ['ACTIVE'],
  ticketMinCents: 500_000_00,
  ticketMaxCents: 1_500_000_00,
}

const emptyMandate: MandateCriteria = {
  categories: [],
  countries: [],
  licenceTypes: [],
  businessStatuses: [],
  ticketMinCents: null,
  ticketMaxCents: null,
}

describe('scoreMatch', () => {
  it('scores a perfect match at 100 in the strong band', () => {
    const result = scoreMatch(narrowMandate, asset)
    expect(result.score).toBe(100)
    expect(result.band).toBe('STRONG')
  })

  it('treats an unfilled mandate as no preference rather than a mismatch', () => {
    const result = scoreMatch(emptyMandate, asset)
    expect(result.score).toBe(100)
    expect(result.reasons.every((r) => r.kind === 'NO_PREFERENCE')).toBe(true)
  })

  it('drops the category weight when the category is wrong', () => {
    const result = scoreMatch({ ...narrowMandate, categories: ['BANK'] }, asset)
    expect(result.score).toBe(70)
    expect(result.reasons.find((r) => r.code === 'CATEGORY')?.kind).toBe('MISMATCH')
  })

  it('falls to the good band when category and country both miss', () => {
    const result = scoreMatch(
      { ...narrowMandate, categories: ['BANK'], countries: ['GB'] },
      asset,
    )
    expect(result.score).toBe(50)
    expect(result.band).toBe('GOOD')
  })

  it('gives half the price weight just outside the ticket band', () => {
    const result = scoreMatch({ ...narrowMandate, ticketMaxCents: 900_000_00 }, asset)
    expect(result.reasons.find((r) => r.code === 'PRICE')?.kind).toBe('PARTIAL')
    expect(result.score).toBe(88)
  })

  it('gives no price weight far outside the ticket band', () => {
    const result = scoreMatch({ ...narrowMandate, ticketMaxCents: 400_000_00 }, asset)
    expect(result.reasons.find((r) => r.code === 'PRICE')?.kind).toBe('MISMATCH')
    expect(result.score).toBe(75)
  })

  it('treats an open-ended upper bound as unbounded', () => {
    const result = scoreMatch({ ...narrowMandate, ticketMaxCents: null }, asset)
    expect(result.reasons.find((r) => r.code === 'PRICE')?.kind).toBe('MATCH')
  })

  it('returns no band when nothing matches', () => {
    const result = scoreMatch(
      {
        categories: ['BANK'],
        countries: ['GB'],
        licenceTypes: ['FCA-AP'],
        businessStatuses: ['LICENSE_ONLY'],
        ticketMinCents: 10_000_000_00,
        ticketMaxCents: 20_000_000_00,
      },
      asset,
    )
    expect(result.score).toBe(0)
    expect(result.band).toBe('NONE')
  })

  it('returns exactly one reason per criterion', () => {
    const codes = scoreMatch(narrowMandate, asset).reasons.map((r) => r.code)
    expect(codes).toEqual([
      'CATEGORY',
      'COUNTRY',
      'PRICE',
      'BUSINESS_STATUS',
      'LICENCE_TYPE',
    ])
  })
})
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `pnpm test tests/unit/matching/score.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/matching"`.

- [ ] **Step 4: Implement the scorer**

Create `src/lib/matching/score.ts`:

```ts
import type {
  AssetCriteria,
  MandateCriteria,
  MatchReason,
  MatchReasonCode,
  MatchResult,
} from './types'

export const MATCH_WEIGHTS: Record<MatchReasonCode, number> = {
  CATEGORY: 30,
  COUNTRY: 20,
  PRICE: 25,
  BUSINESS_STATUS: 15,
  LICENCE_TYPE: 10,
}

/** How far outside the ticket band still earns partial credit. */
export const PRICE_TOLERANCE = 0.2

const STRONG_THRESHOLD = 70
const GOOD_THRESHOLD = 45

function membershipReason<T>(
  code: MatchReasonCode,
  preferences: readonly T[],
  value: T,
): MatchReason {
  const weight = MATCH_WEIGHTS[code]
  if (preferences.length === 0) {
    return { code, kind: 'NO_PREFERENCE', weight, earned: weight }
  }
  const hit = preferences.includes(value)
  return { code, kind: hit ? 'MATCH' : 'MISMATCH', weight, earned: hit ? weight : 0 }
}

function priceReason(
  minCents: number | null,
  maxCents: number | null,
  priceCents: number,
): MatchReason {
  const code: MatchReasonCode = 'PRICE'
  const weight = MATCH_WEIGHTS.PRICE

  if (minCents === null && maxCents === null) {
    return { code, kind: 'NO_PREFERENCE', weight, earned: weight }
  }

  const lower = minCents ?? 0
  const upper = maxCents ?? Number.POSITIVE_INFINITY
  if (priceCents >= lower && priceCents <= upper) {
    return { code, kind: 'MATCH', weight, earned: weight }
  }

  const tolerantLower = lower * (1 - PRICE_TOLERANCE)
  const tolerantUpper =
    upper === Number.POSITIVE_INFINITY ? upper : upper * (1 + PRICE_TOLERANCE)
  if (priceCents >= tolerantLower && priceCents <= tolerantUpper) {
    return { code, kind: 'PARTIAL', weight, earned: weight / 2 }
  }

  return { code, kind: 'MISMATCH', weight, earned: 0 }
}

/**
 * Scores how well a listing fits a buyer's mandate.
 * Pure: the same inputs always produce the same score, so buyer-side and
 * seller-side views of the same pair never disagree.
 */
export function scoreMatch(
  mandate: MandateCriteria,
  asset: AssetCriteria,
): MatchResult {
  const reasons: MatchReason[] = [
    membershipReason('CATEGORY', mandate.categories, asset.category),
    membershipReason('COUNTRY', mandate.countries, asset.country),
    priceReason(mandate.ticketMinCents, mandate.ticketMaxCents, asset.askingPriceCents),
    membershipReason('BUSINESS_STATUS', mandate.businessStatuses, asset.businessStatus),
    membershipReason('LICENCE_TYPE', mandate.licenceTypes, asset.licenceType),
  ]

  const score = Math.round(reasons.reduce((sum, r) => sum + r.earned, 0))
  const band =
    score >= STRONG_THRESHOLD ? 'STRONG' : score >= GOOD_THRESHOLD ? 'GOOD' : 'NONE'

  return { score, band, reasons }
}
```

Create `src/lib/matching/index.ts`:

```ts
export * from './types'
export * from './score'
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test tests/unit/matching/score.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matching tests/unit/matching
git commit -m "feat: add deterministic mandate-to-asset match scoring"
```

---

### Task 6: Authorization rules

**Files:**
- Create: `src/lib/authz/types.ts`, `src/lib/authz/rules.ts`, `src/lib/authz/index.ts`
- Test: `tests/unit/authz/rules.test.ts`

**Interfaces:**
- Consumes: enum types from `@/generated/prisma/client`.
- Produces: types `Viewer`, `MaybeViewer`, `AssetRef`, `GrantState`; predicates `isActive`, `canAccessApp`, `isOwner`, `canModerate`, `canViewAsset`, `canViewFullAsset`, `canEditAsset`, `canRequestAccess`, `canDecideAccess(viewer, asset, grant)`, `canRevokeAccess(viewer, asset, grant)`, `canMessage(viewer, counterparty: { userId, status })`, `canPublishListing`; constant `PUBLIC_ASSET_STATUSES`.

Three signatures differ from the code block below, which was written before review. `canDecideAccess` and `canRevokeAccess` each take the current `GrantState` and enforce the transition — decide only from `REQUESTED`, revoke only from `APPROVED` — so the state machine is guarded in the authorization layer rather than remembered by each mutation. `canMessage` takes a counterparty object rather than a bare status, refuses self-messaging, and carries a comment recording that relationship scoping is deliberately absent because cold contact is a required capability.

Every Server Action in Tasks 14–20 calls these. They are the single source of truth for both rendering decisions and mutation guards.

- [ ] **Step 1: Define the types**

Create `src/lib/authz/types.ts`:

```ts
import type { AssetStatus, Role, UserStatus } from '@/generated/prisma/client'

/** The authenticated actor, flattened from the session. */
export interface Viewer {
  userId: string
  email: string
  role: Role
  status: UserStatus
  buyerProfileId: string | null
  sellerProfileId: string | null
}

/** `null` is an anonymous visitor, who may browse published listings. */
export type MaybeViewer = Viewer | null

/** The minimum an authorization decision needs to know about a listing. */
export interface AssetRef {
  id: string
  sellerProfileId: string
  status: AssetStatus
  /** The owning seller's account status — a suspended owner hides their listings. */
  ownerStatus: UserStatus
}

export type GrantState = 'NONE' | 'REQUESTED' | 'APPROVED' | 'DECLINED' | 'REVOKED'
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/authz/rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  canDecideAccess,
  canEditAsset,
  canMessage,
  canModerate,
  canRequestAccess,
  canViewAsset,
  canViewFullAsset,
} from '@/lib/authz'
import type { AssetRef, Viewer } from '@/lib/authz'

const buyer: Viewer = {
  userId: 'u-buyer',
  email: 'buyer@example.com',
  role: 'BUYER',
  status: 'ACTIVE',
  buyerProfileId: 'bp-1',
  sellerProfileId: null,
}

const seller: Viewer = {
  userId: 'u-seller',
  email: 'seller@example.com',
  role: 'SELLER',
  status: 'ACTIVE',
  buyerProfileId: null,
  sellerProfileId: 'sp-1',
}

const otherSeller: Viewer = { ...seller, userId: 'u-seller-2', sellerProfileId: 'sp-2' }
const manager: Viewer = {
  userId: 'u-manager',
  email: 'manager@example.com',
  role: 'MANAGER',
  status: 'ACTIVE',
  buyerProfileId: null,
  sellerProfileId: null,
}

const published: AssetRef = {
  id: 'a-1',
  sellerProfileId: 'sp-1',
  status: 'PUBLISHED',
  ownerStatus: 'ACTIVE',
}
const draft: AssetRef = { ...published, status: 'DRAFT' }
const ownerSuspended: AssetRef = { ...published, ownerStatus: 'SUSPENDED' }

describe('canViewAsset', () => {
  it('lets anonymous visitors see published listings', () => {
    expect(canViewAsset(null, published)).toBe(true)
  })

  it('hides drafts from anonymous visitors', () => {
    expect(canViewAsset(null, draft)).toBe(false)
  })

  it('hides listings whose owner is suspended', () => {
    expect(canViewAsset(buyer, ownerSuspended)).toBe(false)
  })

  it('still shows a suspended owner their own listing to the manager', () => {
    expect(canViewAsset(manager, ownerSuspended)).toBe(true)
  })

  it('shows a seller their own draft', () => {
    expect(canViewAsset(seller, draft)).toBe(true)
  })

  it('hides another seller’s draft', () => {
    expect(canViewAsset(otherSeller, draft)).toBe(false)
  })

  it('locks out a suspended viewer entirely', () => {
    expect(canViewAsset({ ...buyer, status: 'SUSPENDED' }, published)).toBe(false)
  })
})

describe('canViewFullAsset', () => {
  it('withholds confidential data from a buyer without a grant', () => {
    expect(canViewFullAsset(buyer, published, 'NONE')).toBe(false)
  })

  it('withholds it while the request is still pending', () => {
    expect(canViewFullAsset(buyer, published, 'REQUESTED')).toBe(false)
  })

  it('releases it once the grant is approved', () => {
    expect(canViewFullAsset(buyer, published, 'APPROVED')).toBe(true)
  })

  it('withholds it again after the grant is revoked', () => {
    expect(canViewFullAsset(buyer, published, 'REVOKED')).toBe(false)
  })

  it('always shows the owning seller their own confidential data', () => {
    expect(canViewFullAsset(seller, published, 'NONE')).toBe(true)
  })

  it('always shows the manager', () => {
    expect(canViewFullAsset(manager, published, 'NONE')).toBe(true)
  })

  it('withholds it from a suspended buyer holding an approved grant', () => {
    expect(canViewFullAsset({ ...buyer, status: 'SUSPENDED' }, published, 'APPROVED')).toBe(
      false,
    )
  })
})

describe('canEditAsset', () => {
  it('allows the owner', () => {
    expect(canEditAsset(seller, draft)).toBe(true)
  })

  it('denies another seller', () => {
    expect(canEditAsset(otherSeller, draft)).toBe(false)
  })

  it('denies the manager, who moderates rather than edits', () => {
    expect(canEditAsset(manager, draft)).toBe(false)
  })

  it('denies editing a sold listing', () => {
    expect(canEditAsset(seller, { ...published, status: 'SOLD' })).toBe(false)
  })
})

describe('canRequestAccess', () => {
  it('allows an active buyer with no prior request', () => {
    expect(canRequestAccess(buyer, published, 'NONE')).toBe(true)
  })

  it('denies a second request while one is pending', () => {
    expect(canRequestAccess(buyer, published, 'REQUESTED')).toBe(false)
  })

  it('treats a declined request as final', () => {
    expect(canRequestAccess(buyer, published, 'DECLINED')).toBe(false)
  })

  it('denies sellers, who buy nothing', () => {
    expect(canRequestAccess(seller, { ...published, sellerProfileId: 'sp-9' }, 'NONE')).toBe(
      false,
    )
  })

  it('denies requests against unpublished listings', () => {
    expect(canRequestAccess(buyer, draft, 'NONE')).toBe(false)
  })
})

describe('canDecideAccess', () => {
  it('allows only the owning seller', () => {
    expect(canDecideAccess(seller, published)).toBe(true)
    expect(canDecideAccess(otherSeller, published)).toBe(false)
    expect(canDecideAccess(manager, published)).toBe(false)
  })
})

describe('canModerate and canMessage', () => {
  it('restricts moderation to active managers', () => {
    expect(canModerate(manager)).toBe(true)
    expect(canModerate({ ...manager, status: 'SUSPENDED' })).toBe(false)
    expect(canModerate(seller)).toBe(false)
    expect(canModerate(null)).toBe(false)
  })

  it('blocks messaging a suspended counterparty', () => {
    expect(canMessage(buyer, 'ACTIVE')).toBe(true)
    expect(canMessage(buyer, 'SUSPENDED')).toBe(false)
    expect(canMessage({ ...buyer, status: 'REMOVED' }, 'ACTIVE')).toBe(false)
    expect(canMessage(manager, 'ACTIVE')).toBe(false)
  })
})
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `pnpm test tests/unit/authz/rules.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/authz"`.

- [ ] **Step 4: Implement the rules**

Create `src/lib/authz/rules.ts`:

```ts
import type { AssetStatus } from '@/generated/prisma/client'
import type { AssetRef, GrantState, MaybeViewer, Viewer } from './types'

/** Statuses whose listings are reachable by a public URL. */
export const PUBLIC_ASSET_STATUSES: readonly AssetStatus[] = ['PUBLISHED', 'SOLD']

export function isActive(viewer: MaybeViewer): viewer is Viewer {
  return viewer !== null && viewer.status === 'ACTIVE'
}

/** Anonymous visitors may browse; suspended and removed accounts may not. */
export function canAccessApp(viewer: MaybeViewer): boolean {
  return viewer === null || viewer.status === 'ACTIVE'
}

export function isOwner(viewer: MaybeViewer, asset: AssetRef): boolean {
  return (
    isActive(viewer) &&
    viewer.sellerProfileId !== null &&
    viewer.sellerProfileId === asset.sellerProfileId
  )
}

export function canModerate(viewer: MaybeViewer): boolean {
  return isActive(viewer) && viewer.role === 'MANAGER'
}

export function canPublishListing(viewer: MaybeViewer): boolean {
  return isActive(viewer) && viewer.role === 'SELLER' && viewer.sellerProfileId !== null
}

/** Teaser-level visibility. */
export function canViewAsset(viewer: MaybeViewer, asset: AssetRef): boolean {
  if (canModerate(viewer)) return true
  if (isOwner(viewer, asset)) return true
  if (viewer !== null && viewer.status !== 'ACTIVE') return false
  return PUBLIC_ASSET_STATUSES.includes(asset.status) && asset.ownerStatus === 'ACTIVE'
}

/** Confidential-field visibility. Requires an approved, still-valid grant. */
export function canViewFullAsset(
  viewer: MaybeViewer,
  asset: AssetRef,
  grant: GrantState,
): boolean {
  if (canModerate(viewer)) return true
  if (isOwner(viewer, asset)) return true
  if (!isActive(viewer) || viewer.buyerProfileId === null) return false
  return grant === 'APPROVED' && canViewAsset(viewer, asset)
}

export function canEditAsset(viewer: MaybeViewer, asset: AssetRef): boolean {
  return isOwner(viewer, asset) && asset.status !== 'SOLD'
}

/**
 * A buyer gets one shot per listing: the unique constraint on
 * (assetId, buyerProfileId) means a declined or revoked grant is final.
 */
export function canRequestAccess(
  viewer: MaybeViewer,
  asset: AssetRef,
  grant: GrantState,
): boolean {
  if (!isActive(viewer) || viewer.buyerProfileId === null) return false
  if (asset.status !== 'PUBLISHED') return false
  if (!canViewAsset(viewer, asset)) return false
  return grant === 'NONE'
}

export function canDecideAccess(viewer: MaybeViewer, asset: AssetRef): boolean {
  return isOwner(viewer, asset)
}

export function canRevokeAccess(viewer: MaybeViewer, asset: AssetRef): boolean {
  return isOwner(viewer, asset) || canModerate(viewer)
}

/** Managers moderate the marketplace; they do not transact in it. */
export function canMessage(
  viewer: MaybeViewer,
  counterpartyStatus: 'ACTIVE' | 'SUSPENDED' | 'REMOVED',
): boolean {
  if (!isActive(viewer)) return false
  if (viewer.role === 'MANAGER') return false
  return counterpartyStatus === 'ACTIVE'
}
```

Create `src/lib/authz/index.ts`:

```ts
export * from './types'
export * from './rules'
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test tests/unit/authz/rules.test.ts`
Expected: PASS, 26 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/authz tests/unit/authz
git commit -m "feat: add central authorization rules for the three roles"
```

---

### Task 7: URL filter parsing

**Files:**
- Create: `src/lib/filters/asset-filters.ts`, `src/lib/filters/buyer-filters.ts`, `src/lib/filters/shared.ts`
- Test: `tests/unit/filters/asset-filters.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseAssetFilters(sp: RawSearchParams): AssetFilters`
  - `assetFiltersToSearchParams(f: Partial<AssetFilters>): URLSearchParams`
  - `parseBuyerFilters(sp: RawSearchParams): BuyerFilters`
  - `buyerFiltersToSearchParams(f: Partial<BuyerFilters>): URLSearchParams`
  - types `AssetFilters`, `BuyerFilters`, `RawSearchParams`
  - `ASSET_SORTS`, `PAGE_SIZE`, `MAX_PAGE`, `MAX_FILTER_CENTS`

Filters live in the URL (design decision D1), so this module is the boundary where untrusted strings become typed values. Every unknown or hostile value degrades to a default instead of throwing.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/filters/asset-filters.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { assetFiltersToSearchParams, parseAssetFilters } from '@/lib/filters/asset-filters'

describe('parseAssetFilters', () => {
  it('returns defaults for empty input', () => {
    expect(parseAssetFilters({})).toEqual({
      q: '',
      categories: [],
      countries: [],
      businessStatuses: [],
      priceMinCents: null,
      priceMaxCents: null,
      sort: 'newest',
      page: 1,
    })
  })

  it('parses a comma-separated category list', () => {
    expect(parseAssetFilters({ categories: 'EMI,PAYMENT' }).categories).toEqual([
      'EMI',
      'PAYMENT',
    ])
  })

  it('parses a repeated query parameter', () => {
    expect(parseAssetFilters({ categories: ['EMI', 'BANK'] }).categories).toEqual([
      'EMI',
      'BANK',
    ])
  })

  it('drops unknown enum members but keeps valid ones', () => {
    expect(parseAssetFilters({ categories: 'EMI,WOMBAT' }).categories).toEqual(['EMI'])
  })

  it('uppercases country codes and drops malformed ones', () => {
    expect(parseAssetFilters({ countries: 'mt,GBR,gb' }).countries).toEqual(['MT', 'GB'])
  })

  it('deduplicates repeated values', () => {
    expect(parseAssetFilters({ countries: 'MT,MT' }).countries).toEqual(['MT'])
  })

  it('swaps an inverted price range', () => {
    const f = parseAssetFilters({ priceMin: '900000', priceMax: '100000' })
    expect(f.priceMinCents).toBe(100_000_00)
    expect(f.priceMaxCents).toBe(900_000_00)
  })

  it('reads prices as euros and stores cents', () => {
    expect(parseAssetFilters({ priceMin: '250000' }).priceMinCents).toBe(250_000_00)
  })

  it('falls back to the default sort for an unknown sort key', () => {
    expect(parseAssetFilters({ sort: 'DROP TABLE assets' }).sort).toBe('newest')
  })

  it('clamps a nonsensical page number', () => {
    expect(parseAssetFilters({ page: '-5' }).page).toBe(1)
    expect(parseAssetFilters({ page: 'abc' }).page).toBe(1)
  })

  it('truncates an overlong search string instead of rejecting it', () => {
    expect(parseAssetFilters({ q: 'x'.repeat(500) }).q).toHaveLength(200)
  })
})

describe('assetFiltersToSearchParams', () => {
  it('omits defaults so shared URLs stay short', () => {
    expect(assetFiltersToSearchParams({ sort: 'newest', page: 1 }).toString()).toBe('')
  })

  it('serialises arrays as comma lists', () => {
    const sp = assetFiltersToSearchParams({ categories: ['EMI', 'BANK'] })
    expect(sp.get('categories')).toBe('EMI,BANK')
  })

  it('round-trips through parse without drift', () => {
    const original = parseAssetFilters({
      categories: 'EMI',
      countries: 'MT',
      priceMin: '100000',
      sort: 'price_asc',
      page: '3',
    })
    const reparsed = parseAssetFilters(
      Object.fromEntries(assetFiltersToSearchParams(original)),
    )
    expect(reparsed).toEqual(original)
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm test tests/unit/filters`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the shared helpers**

Create `src/lib/filters/shared.ts`:

```ts
export type RawSearchParams = Record<string, string | string[] | undefined>

export const PAGE_SIZE = 12

/** Accepts both `?k=a,b` and `?k=a&k=b`, deduplicating the result. */
export function toList(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  const parts = Array.isArray(value) ? value : value.split(',')
  return [...new Set(parts.map((p) => p.trim()).filter(Boolean))]
}

/** Keeps only members of the allowed set, preserving input order. */
export function keepKnown<T extends string>(
  values: string[],
  allowed: readonly T[],
): T[] {
  return values.filter((v): v is T => (allowed as readonly string[]).includes(v))
}

/** Largest page number the catalog will honour, bounding pagination arithmetic. */
export const MAX_PAGE = 10_000

/** Largest filter bound the catalog will honour: EUR 10 billion, in cents. */
export const MAX_FILTER_CENTS = 1_000_000_000_000

export function toPositiveInt(
  value: string | string[] | undefined,
  fallback: number,
): number {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_PAGE) return fallback
  return parsed
}

/**
 * Reads a whole-euro query parameter and returns integer cents.
 *
 * The upper bound is not cosmetic. These values are handed to Prisma as
 * `BigInt` for the money columns, and `BigInt()` on an integer-valued but
 * unsafe double does not throw — it silently returns a different number
 * (`BigInt(1e23)` is 99999999999999991611392). Rejecting here is the only
 * place the problem is still visible.
 */
export function toCents(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === undefined || raw === '') return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  const cents = Math.round(parsed * 100)
  if (!Number.isSafeInteger(cents) || cents > MAX_FILTER_CENTS) return null
  return cents
}

export function toCountryCodes(value: string | string[] | undefined): string[] {
  return [
    ...new Set(
      toList(value)
        .map((c) => c.toUpperCase())
        .filter((c) => /^[A-Z]{2}$/.test(c)),
    ),
  ]
}
```

- [ ] **Step 4: Implement the asset filters**

Create `src/lib/filters/asset-filters.ts`:

```ts
import type { AssetCategory, BusinessStatus } from '@/generated/prisma/client'
import {
  keepKnown,
  toCents,
  toCountryCodes,
  toList,
  toPositiveInt,
  type RawSearchParams,
} from './shared'

export const ASSET_CATEGORIES = [
  'BANK',
  'FINTECH',
  'PAYMENT',
  'EMI',
  'CRYPTO',
] as const satisfies readonly AssetCategory[]

export const BUSINESS_STATUSES = [
  'ACTIVE',
  'LICENSE_ONLY',
] as const satisfies readonly BusinessStatus[]

export const ASSET_SORTS = ['newest', 'popular', 'price_asc', 'price_desc'] as const
export type AssetSort = (typeof ASSET_SORTS)[number]

export interface AssetFilters {
  q: string
  categories: AssetCategory[]
  countries: string[]
  businessStatuses: BusinessStatus[]
  priceMinCents: number | null
  priceMaxCents: number | null
  sort: AssetSort
  page: number
}

const DEFAULTS: AssetFilters = {
  q: '',
  categories: [],
  countries: [],
  businessStatuses: [],
  priceMinCents: null,
  priceMaxCents: null,
  sort: 'newest',
  page: 1,
}

export function parseAssetFilters(sp: RawSearchParams): AssetFilters {
  const rawQ = Array.isArray(sp.q) ? sp.q[0] : sp.q
  const sortRaw = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort

  let priceMinCents = toCents(sp.priceMin)
  let priceMaxCents = toCents(sp.priceMax)
  if (priceMinCents !== null && priceMaxCents !== null && priceMinCents > priceMaxCents) {
    ;[priceMinCents, priceMaxCents] = [priceMaxCents, priceMinCents]
  }

  return {
    q: (rawQ ?? '').trim().slice(0, 200),
    categories: keepKnown(toList(sp.categories), ASSET_CATEGORIES),
    countries: toCountryCodes(sp.countries),
    businessStatuses: keepKnown(toList(sp.businessStatuses), BUSINESS_STATUSES),
    priceMinCents,
    priceMaxCents,
    sort: (ASSET_SORTS as readonly string[]).includes(sortRaw ?? '')
      ? (sortRaw as AssetSort)
      : DEFAULTS.sort,
    page: toPositiveInt(sp.page, 1),
  }
}

export function assetFiltersToSearchParams(
  filters: Partial<AssetFilters>,
): URLSearchParams {
  const sp = new URLSearchParams()
  if (filters.q) sp.set('q', filters.q)
  if (filters.categories?.length) sp.set('categories', filters.categories.join(','))
  if (filters.countries?.length) sp.set('countries', filters.countries.join(','))
  if (filters.businessStatuses?.length)
    sp.set('businessStatuses', filters.businessStatuses.join(','))
  if (filters.priceMinCents != null) sp.set('priceMin', String(filters.priceMinCents / 100))
  if (filters.priceMaxCents != null) sp.set('priceMax', String(filters.priceMaxCents / 100))
  if (filters.sort && filters.sort !== DEFAULTS.sort) sp.set('sort', filters.sort)
  if (filters.page && filters.page !== 1) sp.set('page', String(filters.page))
  return sp
}
```

- [ ] **Step 5: Implement the buyer filters**

Create `src/lib/filters/buyer-filters.ts` with the same shape. `BuyerFilters` is
`{ q: string; buyerTypes: BuyerType[]; categories: AssetCategory[]; countries: string[]; ticketMinCents: number | null; page: number }`,
parsed by `parseBuyerFilters` and serialised by `buyerFiltersToSearchParams`, reusing
the helpers from `shared.ts`. `buyerTypes` is validated against
`['PE_FUND','STRATEGIC','FAMILY_OFFICE','INDIVIDUAL'] as const satisfies readonly BuyerType[]`.
`categories` and `countries` filter on the buyer's *mandate*, not on the buyer's own
country. `ticketMinCents` selects buyers whose `ticketMaxCents` is at least that value —
"show me buyers who can afford this".

- [ ] **Step 6: Run the tests**

Run: `pnpm test tests/unit/filters`
Expected: PASS, 14 tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/filters tests/unit/filters
git commit -m "feat: parse and serialise catalog filters through the URL"
```

---

### Task 8: Asset redaction

**Files:**
- Create: `src/lib/dto/asset.ts`
- Test: `tests/unit/dto/asset.test.ts`

**Interfaces:**
- Consumes: `Asset` type and `Prisma` runtime metadata from `@/generated/prisma/client`.
- Produces: `CONFIDENTIAL_ASSET_FIELDS`, `PUBLIC_ASSET_FIELDS`, types `PublicAssetField`, `ConfidentialAssetField`, `TeaserAsset`, `FullAsset`, `AssetDto`; functions `toTeaserAsset`, `toFullAsset`, `toAssetDto`, and the type guard `isFullAsset`.
- Note: `Prisma.dmmf` does NOT exist in this Prisma 7 generated client. The classification test uses `Prisma.AssetScalarFieldEnum`, which holds exactly the 27 scalar column names and no relation field. Also, `tsconfig` targets ES2017, so bigint literals (`1_00n`) do not compile — build fixture values with `BigInt(...)` instead.

This is the enforcement point for design decision D3. `toAssetDto` takes a boolean rather than a viewer so it stays pure — the decision itself belongs to `@/lib/authz`.

The second test in this task is the important one: it compares the field allowlists against Prisma's runtime model metadata, so adding any column to `Asset` fails the suite until someone classifies it as public or confidential. That is what stops a future field from silently leaking through the teaser.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/dto/asset.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import type { Asset } from '@/generated/prisma/client'
import {
  CONFIDENTIAL_ASSET_FIELDS,
  PUBLIC_ASSET_FIELDS,
  isFullAsset,
  toAssetDto,
  toTeaserAsset,
} from '@/lib/dto/asset'

const sample: Asset = {
  id: 'a-1',
  publicRef: 'N5-750',
  sellerProfileId: 'sp-1',
  status: 'PUBLISHED',
  category: 'EMI',
  licenceType: 'SEMI',
  businessType: 'Payments',
  country: 'MT',
  regulator: 'MFSA',
  businessStatus: 'ACTIVE',
  askingPriceCents: 1_000_000_00n,
  employees: 14,
  yearOfIssue: 2019,
  included: ['Staff', 'Software'],
  teaserTitle: 'Maltese EMI with live portfolio',
  teaserDescription: 'Operating EMI, EEA passporting, active client base.',
  legalName: 'Valletta Payments Ltd',
  revenueCents: 2_100_000_00n,
  ebitdaCents: 400_000_00n,
  clientCount: 3_200,
  dataRoomUrl: 'https://dataroom.example.com/750',
  confidentialNotes: 'Founder retiring; sale is time-sensitive.',
  publishedAt: new Date('2026-08-01T00:00:00Z'),
  rejectionReason: null,
  viewCount: 41,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
}

describe('toTeaserAsset', () => {
  it('omits every confidential field from the object entirely', () => {
    const teaser = toTeaserAsset(sample)
    for (const field of CONFIDENTIAL_ASSET_FIELDS) {
      expect(Object.hasOwn(teaser, field)).toBe(false)
    }
  })

  it('keeps the teaser fields intact', () => {
    const teaser = toTeaserAsset(sample)
    expect(teaser.teaserTitle).toBe(sample.teaserTitle)
    expect(teaser.askingPriceCents).toBe(Number(sample.askingPriceCents))
  })

  it('narrows bigint money to a JSON-serialisable number', () => {
    const teaser = toTeaserAsset(sample)
    expect(typeof teaser.askingPriceCents).toBe('number')
    // bigint would throw here — this is exactly what Next.js does at the
    // server/client boundary, so the assertion is the real failure mode.
    expect(() => JSON.stringify(teaser)).not.toThrow()
  })

  it('does not leak confidential values through JSON serialisation', () => {
    const serialised = JSON.stringify(toTeaserAsset(sample))
    expect(serialised).not.toContain('Valletta Payments Ltd')
    expect(serialised).not.toContain('dataroom.example.com')
  })
})

describe('field classification', () => {
  it('classifies every scalar column on the Asset model', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Asset')
    expect(model).toBeDefined()
    const columns = model!.fields
      .filter((f) => f.kind !== 'object')
      .map((f) => f.name)
      .sort()

    const classified = [...PUBLIC_ASSET_FIELDS, ...CONFIDENTIAL_ASSET_FIELDS].sort()
    expect(classified).toEqual(columns)
  })
})

describe('toAssetDto', () => {
  it('redacts when the caller has no full access', () => {
    const dto = toAssetDto(sample, false)
    expect(isFullAsset(dto)).toBe(false)
  })

  it('returns the full record when the caller has access', () => {
    const dto = toAssetDto(sample, true)
    expect(isFullAsset(dto)).toBe(true)
    if (isFullAsset(dto)) expect(dto.legalName).toBe('Valletta Payments Ltd')
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm test tests/unit/dto`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the DTOs**

Create `src/lib/dto/asset.ts`:

```ts
import type { Asset } from '@/generated/prisma/client'

/**
 * Fields released only to a buyer holding an approved access request,
 * to the owning seller, and to the platform manager.
 */
export const CONFIDENTIAL_ASSET_FIELDS = [
  'legalName',
  'revenueCents',
  'ebitdaCents',
  'clientCount',
  'dataRoomUrl',
  'confidentialNotes',
] as const

/**
 * Fields safe for the anonymous teaser. `rejectionReason` is listed here because
 * it carries no deal information — it is only ever rendered on the owning
 * seller's own dashboard.
 */
export const PUBLIC_ASSET_FIELDS = [
  'id',
  'publicRef',
  'sellerProfileId',
  'status',
  'category',
  'licenceType',
  'businessType',
  'country',
  'regulator',
  'businessStatus',
  'askingPriceCents',
  'employees',
  'yearOfIssue',
  'included',
  'teaserTitle',
  'teaserDescription',
  'publishedAt',
  'rejectionReason',
  'viewCount',
  'createdAt',
  'updatedAt',
] as const

export type ConfidentialAssetField = (typeof CONFIDENTIAL_ASSET_FIELDS)[number]

/**
 * Money columns are `bigint` on the Prisma row and `number` from here upward.
 * Next.js cannot serialise a bigint across the server/client boundary, so this
 * layer — which already exists to strip confidential fields — is also where the
 * narrowing happens. Lossless: MAX_SAFE_INTEGER is €90 trillion in cents.
 */
const MONEY_FIELDS = ['askingPriceCents', 'revenueCents', 'ebitdaCents'] as const
type MoneyField = (typeof MONEY_FIELDS)[number]

export type PublicAssetField = (typeof PUBLIC_ASSET_FIELDS)[number]

/**
 * Derived from the allowlist, not from `Omit<Asset, ...>`, so the type and the
 * runtime copy loop read the same array. Dropping a field from the allowlist
 * then becomes a compile error at every call site, not a silent `undefined`.
 */
export type TeaserAsset = Omit<Pick<Asset, PublicAssetField>, 'askingPriceCents'> & {
  askingPriceCents: number
  redacted: true
}
export type FullAsset = Omit<Asset, MoneyField> & Record<MoneyField, number> & {
  redacted: false
}
export type AssetDto = TeaserAsset | FullAsset

/** Builds a teaser by construction, not by deletion — a new column is absent by default. */
export function toTeaserAsset(asset: Asset): TeaserAsset {
  const teaser = {} as Record<string, unknown>
  for (const field of PUBLIC_ASSET_FIELDS) {
    const value = asset[field]
    teaser[field] = typeof value === 'bigint' ? Number(value) : value
  }
  teaser.redacted = true
  return teaser as TeaserAsset
}

export function toFullAsset(asset: Asset): FullAsset {
  return {
    ...asset,
    askingPriceCents: Number(asset.askingPriceCents),
    revenueCents: Number(asset.revenueCents),
    ebitdaCents: Number(asset.ebitdaCents),
    redacted: false,
  }
}

export function toAssetDto(asset: Asset, canSeeConfidential: boolean): AssetDto {
  return canSeeConfidential ? toFullAsset(asset) : toTeaserAsset(asset)
}

export function isFullAsset(dto: AssetDto): dto is FullAsset {
  return dto.redacted === false
}
```

Note the direction: `toTeaserAsset` copies the allowlist across rather than deleting the
blocklist. A column added to the schema and forgotten is therefore absent from the
teaser, which fails safe; the classification test then makes the omission loud.

- [ ] **Step 4: Run the tests**

Run: `pnpm test tests/unit/dto`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dto tests/unit/dto
git commit -m "feat: redact confidential asset fields server-side"
```

---

### Task 9: AI layer

**Files:**
- Create: `src/lib/ai/client.ts`, `src/lib/ai/search.ts`, `src/lib/ai/explain.ts`, `src/lib/ai/teaser-review.ts`
- Test: `tests/unit/ai/search.test.ts`, `tests/unit/ai/fallback.test.ts`

**Interfaces:**
- Consumes: `AssetFilters` from `@/lib/filters/asset-filters`; `MatchReason` from `@/lib/matching`.
- Produces:
  - `AI_MODEL`, `isAiEnabled(): boolean`
  - `callStructured<T>(opts: StructuredCallOptions<T>): Promise<T | null>`
  - `parseSearchQuery(query: string): Promise<Partial<AssetFilters> | null>` and the pure helpers `buildSearchPrompt`, `toFilterPatch`
  - `explainMatch(input: ExplainMatchInput): Promise<string | null>`
  - `reviewTeaser(input: TeaserReviewInput): Promise<TeaserReview | null>`
  - `keepQuotedLeaks(leaks, teaserTitle, teaserDescription)` — pure; drops any leak whose excerpt does not actually occur in the teaser after whitespace and case normalisation. `reviewTeaser` applies it before returning, so a caller can trust that every `excerpt` it receives is a real quote from the text the seller wrote.

Model choice: `claude-opus-5`. It is one exported constant — if the search box feels slow in practice, changing `AI_MODEL` to `claude-haiku-4-5` is a one-line change, but do not downgrade pre-emptively.

Every function here returns `null` on any failure. `null` means "AI unavailable", and every caller already has a deterministic path.

- [ ] **Step 1: Install the SDK**

```bash
pnpm add @anthropic-ai/sdk
```

- [ ] **Step 2: Write the client wrapper**

Create `src/lib/ai/client.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'

export const AI_MODEL = 'claude-opus-5'

let client: Anthropic | null = null

/** AI features are additive: without a key the app runs, they just hide. */
export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

function getClient(): Anthropic | null {
  if (!isAiEnabled()) return null
  client ??= new Anthropic()
  return client
}

export interface StructuredCallOptions<T> {
  system: string
  user: string
  schema: z.ZodType<T>
  maxTokens?: number
  effort?: 'low' | 'medium' | 'high'
}

/**
 * One structured request. Returns null for every failure mode — no key, a
 * refusal, a rate limit, an unparseable response — so callers have exactly one
 * branch to handle instead of five.
 */
export async function callStructured<T>(
  opts: StructuredCallOptions<T>,
): Promise<T | null> {
  const anthropic = getClient()
  if (anthropic === null) return null

  try {
    const response = await anthropic.messages.parse({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      output_config: {
        format: zodOutputFormat(opts.schema),
        effort: opts.effort ?? 'low',
      },
    })

    if (response.stop_reason === 'refusal') return null
    return response.parsed_output ?? null
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(`[ai] API error ${error.status}: ${error.message}`)
    } else {
      console.error('[ai] unexpected failure', error)
    }
    return null
  }
}
```

Two things to verify while writing this file, both cheap and both silent if wrong:
1. `zodOutputFormat` must accept the installed zod major version. If the types
   complain, list `node_modules/@anthropic-ai/sdk/helpers/` and import the
   version-matched entry point rather than casting the schema to `any`.
2. If the API rejects `format` and `effort` together in `output_config`, drop
   `effort`. Do not leave it in — the catch block would swallow the 400 and the
   feature would look like it works while always falling back.

- [ ] **Step 3: Write the failing tests for the search parser**

Create `tests/unit/ai/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildSearchPrompt, toFilterPatch } from '@/lib/ai/search'

describe('buildSearchPrompt', () => {
  it('includes the user query verbatim', () => {
    expect(buildSearchPrompt('EMI licence in Malta under 2M')).toContain(
      'EMI licence in Malta under 2M',
    )
  })

  it('truncates a hostile input to the filter length limit', () => {
    expect(buildSearchPrompt('x'.repeat(5000)).length).toBeLessThan(1000)
  })
})

describe('toFilterPatch', () => {
  it('converts euros to cents', () => {
    const patch = toFilterPatch({
      categories: [],
      countries: [],
      businessStatuses: [],
      priceMinEur: null,
      priceMaxEur: 2_000_000,
      freeText: '',
    })
    expect(patch.priceMaxCents).toBe(2_000_000_00)
  })

  it('drops country codes that are not two letters', () => {
    const patch = toFilterPatch({
      categories: ['EMI'],
      countries: ['MT', 'Malta', 'gb'],
      businessStatuses: [],
      priceMinEur: null,
      priceMaxEur: null,
      freeText: '',
    })
    expect(patch.countries).toEqual(['MT', 'GB'])
  })

  it('omits empty facets so they do not overwrite existing filters', () => {
    const patch = toFilterPatch({
      categories: [],
      countries: [],
      businessStatuses: [],
      priceMinEur: null,
      priceMaxEur: null,
      freeText: 'crypto',
    })
    expect(patch).toEqual({ q: 'crypto' })
  })
})
```

Create `tests/unit/ai/fallback.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { isAiEnabled } from '@/lib/ai/client'
import { parseSearchQuery } from '@/lib/ai/search'
import { explainMatch } from '@/lib/ai/explain'
import { reviewTeaser } from '@/lib/ai/teaser-review'

describe('graceful degradation without an API key', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('reports AI as disabled', () => {
    expect(isAiEnabled()).toBe(false)
  })

  it('returns null from the search parser instead of throwing', async () => {
    await expect(parseSearchQuery('anything')).resolves.toBeNull()
  })

  it('returns null from the match explainer', async () => {
    await expect(
      explainMatch({ score: 80, reasons: [], locale: 'en' }),
    ).resolves.toBeNull()
  })

  it('returns null from the teaser reviewer', async () => {
    await expect(
      reviewTeaser({
        teaserTitle: 'A title',
        teaserDescription: 'A description',
        legalName: 'Acme Ltd',
        revenueCents: 100_000_00,
        ebitdaCents: 10_000_00,
        clientCount: 10,
      }),
    ).resolves.toBeNull()
  })
})
```

- [ ] **Step 4: Run the tests to confirm they fail**

Run: `pnpm test tests/unit/ai`
Expected: FAIL — modules not found.

- [ ] **Step 5: Implement the search parser**

Create `src/lib/ai/search.ts`:

```ts
import { z } from 'zod'
import type { AssetFilters } from '@/lib/filters/asset-filters'
import { ASSET_CATEGORIES, BUSINESS_STATUSES } from '@/lib/filters/asset-filters'
import { callStructured } from './client'

const searchResultSchema = z.object({
  categories: z.array(z.enum(ASSET_CATEGORIES)),
  countries: z.array(z.string()),
  businessStatuses: z.array(z.enum(BUSINESS_STATUSES)),
  priceMinEur: z.number().nullable(),
  priceMaxEur: z.number().nullable(),
  freeText: z.string(),
})

export type SearchResult = z.infer<typeof searchResultSchema>

const SYSTEM = `You convert a marketplace search phrase into filters for a marketplace of licensed financial institutions.

Categories: BANK, FINTECH, PAYMENT, EMI, CRYPTO.
Business status: ACTIVE (a trading business) or LICENSE_ONLY (a licence with no operations).
Countries: ISO 3166-1 alpha-2 codes.
Prices: whole euros, null when the phrase says nothing about price.
freeText: anything that is not expressible as a filter, otherwise an empty string.

Extract only what the phrase actually says. Never guess a country or a price.`

/** Pure: the exact prompt sent for a query. */
export function buildSearchPrompt(query: string): string {
  return `Search phrase: ${query.trim().slice(0, 200)}`
}

/** Pure: converts a model result into a filter patch, dropping empty facets. */
export function toFilterPatch(result: SearchResult): Partial<AssetFilters> {
  const patch: Partial<AssetFilters> = {}

  if (result.categories.length > 0) patch.categories = result.categories
  const countries = result.countries
    .map((c) => c.toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c))
  if (countries.length > 0) patch.countries = countries
  if (result.businessStatuses.length > 0) patch.businessStatuses = result.businessStatuses
  if (result.priceMinEur !== null) patch.priceMinCents = Math.round(result.priceMinEur * 100)
  if (result.priceMaxEur !== null) patch.priceMaxCents = Math.round(result.priceMaxEur * 100)
  if (result.freeText.trim() !== '') patch.q = result.freeText.trim()

  return patch
}

export async function parseSearchQuery(
  query: string,
): Promise<Partial<AssetFilters> | null> {
  const result = await callStructured({
    system: SYSTEM,
    user: buildSearchPrompt(query),
    schema: searchResultSchema,
    maxTokens: 512,
  })
  return result === null ? null : toFilterPatch(result)
}
```

- [ ] **Step 6: Implement the explainer and the teaser reviewer**

Create `src/lib/ai/explain.ts`:

```ts
import { z } from 'zod'
import type { MatchReason } from '@/lib/matching'
import { callStructured } from './client'

export interface ExplainMatchInput {
  score: number
  reasons: MatchReason[]
  locale: string
}

const explanationSchema = z.object({ explanation: z.string() })

const SYSTEM = `You restate pre-computed match reasons in one or two short sentences.

You receive a score and a list of reasons. Each reason has a criterion code and a
kind: MATCH, PARTIAL, MISMATCH or NO_PREFERENCE. Explain what fits and what does
not, in that order.

You must not introduce any fact that is not in the reasons. Do not name a
country, a price or a licence type unless it appears in the input.
Write in the requested language.`

export async function explainMatch(input: ExplainMatchInput): Promise<string | null> {
  const result = await callStructured({
    system: SYSTEM,
    user: JSON.stringify({
      language: input.locale === 'ru' ? 'Russian' : 'English',
      score: input.score,
      reasons: input.reasons.map((r) => ({ criterion: r.code, kind: r.kind })),
    }),
    schema: explanationSchema,
    maxTokens: 400,
  })
  return result?.explanation.trim() ?? null
}
```

Create `src/lib/ai/teaser-review.ts`:

```ts
import { z } from 'zod'
import { callStructured } from './client'

export interface TeaserReviewInput {
  teaserTitle: string
  teaserDescription: string
  legalName: string
  revenueCents: number
  ebitdaCents: number
  clientCount: number
}

const reviewSchema = z.object({
  leaks: z.array(
    z.object({
      field: z.enum(['legalName', 'revenue', 'ebitda', 'clientCount', 'other']),
      excerpt: z.string(),
      explanation: z.string(),
    }),
  ),
  suggestions: z.array(z.string()),
})

export type TeaserReview = z.infer<typeof reviewSchema>

const SYSTEM = `You review the public teaser of a confidential M&A listing.

The teaser is shown to every visitor. The confidential values are released only
after the seller approves a buyer under an NDA. Your job is to find places where
the teaser reveals confidential information, directly or by obvious inference —
the legal entity name, an exact revenue or EBITDA figure, an exact client count,
or a detail so specific that the company could be identified from it.

Quote the offending text in "excerpt" exactly as it appears. Report nothing you
cannot quote. Then give at most three short suggestions for making the teaser
more useful to a buyer without revealing more.`

export async function reviewTeaser(
  input: TeaserReviewInput,
): Promise<TeaserReview | null> {
  return callStructured({
    system: SYSTEM,
    user: JSON.stringify({
      teaser: { title: input.teaserTitle, description: input.teaserDescription },
      confidential: {
        legalName: input.legalName,
        revenueEur: Math.round(input.revenueCents / 100),
        ebitdaEur: Math.round(input.ebitdaCents / 100),
        clientCount: input.clientCount,
      },
    }),
    schema: reviewSchema,
    maxTokens: 1024,
    effort: 'medium',
  })
}
```

- [ ] **Step 7: Run the tests**

Run: `pnpm test tests/unit/ai`
Expected: PASS, 9 tests.

- [ ] **Step 8: Smoke-test against the real API once**

With `ANTHROPIC_API_KEY` set in `.env`:

```bash
pnpm dlx tsx -e "import 'dotenv/config'; import {parseSearchQuery} from './src/lib/ai/search'; parseSearchQuery('EMI licence in Malta under 2 million').then(r => { console.log(r); process.exit(0) })"
```

Expected: an object containing `categories: ['EMI']`, `countries: ['MT']` and
`priceMaxCents: 200000000`. If it prints `null`, the failure is logged above it —
fix it now rather than shipping a feature that silently always falls back.

- [ ] **Step 9: Commit**

```bash
git add src/lib/ai tests/unit/ai package.json pnpm-lock.yaml
git commit -m "feat: add AI search parsing, match explanation and teaser review"
```

---

### Task 10: Demo data

**Files:**
- Create: `prisma/seed.ts`, `prisma/seed-data/assets.ts`, `prisma/seed-data/participants.ts`

**Interfaces:**
- Consumes: `prisma` from `@/server/db`; Prisma enums.
- Produces: a populated database, and the exported constant `DEMO_PASSWORD = 'demo1234'` plus `DEMO_ACCOUNTS` (one email per role) reused by the login page in Task 11 and the e2e tests in Task 22.

The seed is idempotent: it deletes in reverse dependency order and re-inserts, so `pnpm db:seed` can be run repeatedly and the e2e suite always starts from a known state.

- [ ] **Step 1: Install the hashing dependency**

```bash
pnpm add bcryptjs
pnpm add -D @types/bcryptjs
```

- [ ] **Step 2: Write the participant fixtures**

Create `prisma/seed-data/participants.ts` exporting:

- `DEMO_PASSWORD = 'demo1234'`
- `DEMO_ACCOUNTS = { buyer: 'buyer@n5deal.demo', seller: 'seller@n5deal.demo', manager: 'manager@n5deal.demo' }`
- `SELLERS`: 6 entries `{ email, companyName, contactName, country, verified }`. Make `seller@n5deal.demo` the first. Give one seller `status: 'SUSPENDED'` on the user — this is the pre-suspended participant the manager screen needs.
- `BUYERS`: 12 entries `{ email, displayName, buyerType, country, bio, verified, mandate }` where `mandate` is `{ categories, countries, licenceTypes, businessStatuses, ticketMinCents, ticketMaxCents, timelineMonths, notes }`. Vary them deliberately: two very narrow (single category, single country, tight ticket), three broad (empty arrays, wide ticket), the rest in between. `buyer@n5deal.demo` is a mid-breadth PE fund whose mandate matches several seeded assets at different bands, so the recommendations screen shows a spread rather than a wall of 100s.
- `MANAGER`: one entry.

- [ ] **Step 3: Write the asset fixtures**

Create `prisma/seed-data/assets.ts` exporting `ASSETS`: 40 entries shaped as the `Asset` create input minus `sellerProfileId`. Constraints that make the demo meaningful:

- All five categories represented, `PAYMENT` most common (mirrors the reference product's distribution).
- ~15 jurisdictions using real regulator names: `MT`/MFSA, `GB`/FCA, `LT`/Bank of Lithuania, `CY`/CySEC, `HK`/C&ED, `SG`/MAS, `AE`/DFSA, `EE`/FSA, `US`/FinCEN, `CH`/FINMA, and others.
- Licence types drawn from `['EMI', 'SEMI', 'MSO', 'PI', 'API', 'CASP', 'Banking']`.
- Asking prices spread across €150,000 to €25,000,000.
- Mixed `ACTIVE` and `LICENSE_ONLY`.
- `publicRef` in the form `N5-701` … `N5-740`.
- Statuses: 34 `PUBLISHED`, 2 `PENDING_REVIEW`, 1 `REJECTED` with a reason, 1 `DRAFT`, 1 `SOLD`, and 1 `PUBLISHED` belonging to the suspended seller (so it is correctly invisible in the catalog on first load).
- `viewCount` seeded between 5 and 400 so "Most popular" sorts visibly.
- Teasers written as real teasers: no legal names, no exact revenue figures. One deliberate exception — a single `PENDING_REVIEW` listing whose teaser leaks its legal name, so the AI teaser review has something true to find during a demo.

- [ ] **Step 4: Write the seed script**

Create `prisma/seed.ts`. Order of operations:

1. Delete in reverse dependency order: `message`, `conversation`, `favorite`, `accessRequest`, `moderationLog`, `asset`, `mandate`, `buyerProfile`, `sellerProfile`, `user`.
2. Hash `DEMO_PASSWORD` once with `bcrypt.hash(DEMO_PASSWORD, 10)` and reuse the hash for every account — hashing 19 times separately adds seconds for nothing.
3. Create users with their profiles and mandates.
4. Create assets, round-robin across the active sellers, with the suspended seller owning exactly one.
5. Create access requests covering every status: 3 `APPROVED` (one of them for `buyer@n5deal.demo`, so the gated view is immediately demonstrable), 2 `REQUESTED` against `seller@n5deal.demo`'s listings (so the seller dashboard has a queue), 1 `DECLINED`, 1 `REVOKED`.
6. Create 4 conversations, two with unread messages addressed to `buyer@n5deal.demo` and two to `seller@n5deal.demo`, using `buildThreadKey` from Task 19. Since Task 19 comes later, inline the same expression here and replace it with the import when Task 19 lands.
7. Create 2 `ModerationLog` rows explaining the pre-suspended seller.
8. Log a summary line per table.

- [ ] **Step 5: Run the seed**

```bash
pnpm db:seed
```

Expected: a summary showing 19 users, 12 buyer profiles, 6 seller profiles, 40 assets, 7 access requests, 4 conversations.

- [ ] **Step 6: Spot-check in Studio**

```bash
pnpm db:studio
```

Confirm the suspended seller's asset exists and that `buyer@n5deal.demo` has exactly one approved access request.

- [ ] **Step 7: Commit**

```bash
git add prisma package.json pnpm-lock.yaml
git commit -m "feat: seed demo participants, listings and access requests"
```

---

### Task 11: Authentication and the viewer

**Files:**
- Create: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/server/session.ts`, `src/types/next-auth.d.ts`
- Create: `src/app/[locale]/login/page.tsx`, `src/app/[locale]/login/demo-login.tsx`, `src/app/[locale]/suspended/page.tsx`
- Modify: `src/app/[locale]/layout.tsx`, `src/components/domain/site-header.tsx`, `src/proxy.ts`

**Interfaces:**
- Consumes: `prisma`, `DEMO_ACCOUNTS`/`DEMO_PASSWORD`, `Viewer` from `@/lib/authz`.
- Produces:
  - `auth`, `signIn`, `signOut`, `handlers` from `@/auth`
  - `getViewer(): Promise<Viewer | null>` from `@/server/session`
  - `requireViewer(): Promise<Viewer>` — redirects to `/login` when absent, to `/suspended` when not active

- [ ] **Step 1: Install**

```bash
pnpm add next-auth@beta
```

- [ ] **Step 2: Configure Auth.js**

Create `src/auth.ts`:

```ts
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/server/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '').toLowerCase().trim()
        const password = String(credentials?.password ?? '')
        if (!email || !password) return null

        const user = await prisma.user.findUnique({
          where: { email },
          include: { buyerProfile: true, sellerProfile: true },
        })
        if (!user) return null
        if (user.status === 'REMOVED') return null

        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) return null

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          buyerProfileId: user.buyerProfile?.id ?? null,
          sellerProfileId: user.sellerProfile?.id ?? null,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.status = user.status
        token.buyerProfileId = user.buyerProfileId
        token.sellerProfileId = user.sellerProfileId
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as typeof session.user.role
      session.user.status = token.status as typeof session.user.status
      session.user.buyerProfileId = token.buyerProfileId as string | null
      session.user.sellerProfileId = token.sellerProfileId as string | null
      return session
    },
  },
})
```

A suspended user still receives a session — they must be able to see *why* they are locked out. `REMOVED` is refused outright.

Create `src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from '@/auth'

export const { GET, POST } = handlers
```

Create `src/types/next-auth.d.ts` augmenting `Session["user"]` and `JWT` with `id`, `role`, `status`, `buyerProfileId`, `sellerProfileId`, importing `Role` and `UserStatus` from `@/generated/prisma/client`.

- [ ] **Step 3: Build the viewer helpers**

Create `src/server/session.ts`:

```ts
import { redirect } from '@/i18n/navigation'
import { auth } from '@/auth'
import type { Viewer } from '@/lib/authz'

/**
 * The session is a JWT, so `status` is a snapshot from sign-in time.
 * Re-reading it here means a manager's suspension takes effect on the
 * suspended user's very next request rather than at their next sign-in.
 */
export async function getViewer(): Promise<Viewer | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const { prisma } = await import('@/server/db')
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { buyerProfile: { select: { id: true } }, sellerProfile: { select: { id: true } } },
  })
  if (!user || user.status === 'REMOVED') return null

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    buyerProfileId: user.buyerProfile?.id ?? null,
    sellerProfileId: user.sellerProfile?.id ?? null,
  }
}

export async function requireViewer(locale: string): Promise<Viewer> {
  const viewer = await getViewer()
  if (viewer === null) redirect({ href: '/login', locale })
  if (viewer.status !== 'ACTIVE') redirect({ href: '/suspended', locale })
  return viewer
}
```

That extra query per request is a deliberate trade: correctness of suspension over one round trip. Note it in the README.

- [ ] **Step 4: Build the login page**

`src/app/[locale]/login/page.tsx` is a server component rendering the email/password form (posting to a Server Action that calls `signIn('credentials', ...)`) plus `<DemoLogin />`.

`demo-login.tsx` is a client component rendering three buttons — Buyer, Seller, Manager — each calling the same Server Action with the corresponding address from `DEMO_ACCOUNTS` and `DEMO_PASSWORD`. Show the credentials as visible text under the buttons so a reviewer can also sign in manually.

`src/app/[locale]/suspended/page.tsx` explains that the account is suspended, shows the reason from the most recent `ModerationLog` row targeting the user, and offers sign-out.

- [ ] **Step 5: Pass the real viewer into the shell**

In `src/app/[locale]/layout.tsx`, call `getViewer()` and pass the result to `<SiteHeader viewer={viewer} />`. Tighten the `SiteHeader` prop type from Task 4 to `Viewer | null`.

Extend the matcher in `src/proxy.ts` so `/api/auth` stays excluded (it already is), and confirm sign-in redirects land on a locale-prefixed path.

- [ ] **Step 6: Verify all three roles**

Run `pnpm dev`. For each demo button: sign in, confirm the header shows the right nav items, sign out. Then manually set the seeded suspended seller's password and sign in as them — expect the `/suspended` screen, not the dashboard.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add credentials auth with one-click demo logins"
```

---

### Task 12: Asset catalog

**Files:**
- Create: `src/server/queries/assets.ts`, `src/app/[locale]/listings/page.tsx`
- Create: `src/components/domain/asset-card.tsx`, `src/components/domain/filter-sidebar.tsx`, `src/components/domain/smart-search.tsx`, `src/components/domain/pagination.tsx`
- Modify: `messages/en.json`, `messages/ru.json`

**Interfaces:**
- Consumes: `parseAssetFilters`, `PAGE_SIZE`, `toTeaserAsset`, `canViewAsset`, `getViewer`, `parseSearchQuery`.
- Produces: `listAssets(filters: AssetFilters, viewer: MaybeViewer): Promise<{ items: TeaserAsset[]; total: number; facets: CategoryFacet[] }>` from `@/server/queries/assets`, where `CategoryFacet` is `{ category: AssetCategory; count: number }`, declared and exported from the same file.
- Also create: `src/server/actions/search.ts` — the `'use server'` wrapper the smart-search box calls, exposing `parseSearchQueryAction(query: string): Promise<Partial<AssetFilters> | null>`.
- Note: the price bounds in `AssetFilters` are `number` cents, but `askingPriceCents` is a `bigint` column — wrap them as `BigInt(filters.priceMinCents)` inside the Prisma `where` clause.

- [ ] **Step 1: Write the catalog query**

In `src/server/queries/assets.ts`, build a `Prisma.AssetWhereInput` from the filters. It always includes the visibility floor — `status: 'PUBLISHED'` and `sellerProfile: { user: { status: 'ACTIVE' } }` — so a suspended seller's listings vanish without any component knowing about it. Add `category: { in }`, `country: { in }`, `businessStatus: { in }`, and `askingPriceCents: { gte, lte }` only when the corresponding filter is non-empty. For `q`, use `OR` across `teaserTitle`, `teaserDescription`, `publicRef` and `businessType` with `contains` and `mode: 'insensitive'`.

Sort mapping: `newest` → `publishedAt desc`, `popular` → `viewCount desc`, `price_asc`/`price_desc` → `askingPriceCents`. Always append `id: 'asc'` as a tiebreaker so pagination is stable.

Run the page query, the count, and a `groupBy(['category'])` for the sidebar counts in one `prisma.$transaction([...])`. Map every row through `toTeaserAsset` before returning — nothing leaves this module unredacted.

- [ ] **Step 2: Build the page**

`src/app/[locale]/listings/page.tsx` reads `searchParams`, calls `parseAssetFilters`, calls `listAssets`, and renders the sidebar, the smart search box, the result grid and pagination. It is a server component; filters change by navigation, not by client state.

- [ ] **Step 3: Build the filter sidebar**

`filter-sidebar.tsx` is a client component. Every control updates the URL through `useRouter()` from `@/i18n/navigation`, rebuilding the query string with `assetFiltersToSearchParams` and resetting `page` to 1 on any filter change. Category checkboxes show the live counts from the facets. Include a "Clear all" action, visible only when a filter is active.

- [ ] **Step 4: Build the smart search box**

`smart-search.tsx` renders a text input with a plain-search submit. When `isAiEnabled()` is true — passed down as a prop from the server component, since the client cannot read the environment — it also renders an "Ask in your own words" button that calls a Server Action wrapping `parseSearchQuery`. On a non-null result, merge the patch into the current filters and navigate. On null, fall back to setting `q` to the raw text.

Render the resulting filters as removable chips above the results, so the user sees what the AI understood and can correct it. That visibility is the point — the AI proposes, the URL decides.

- [ ] **Step 5: Build the asset card**

`asset-card.tsx` mirrors the reference layout: `publicRef` and a country flag on one line; the teaser title; a row of small uppercase meta labels (category, licence type, regulator, business status, employees, year); the asking price set larger on the right; the "included" chips; and the view count. The whole card links to the detail page.

Derive the flag from the ISO country code with a small `codeToFlag` helper (regional indicator symbols) rather than shipping image assets.

- [ ] **Step 6: Add the message keys**

Add an `assets` namespace to both catalogues covering every label, every enum value (`assets.category.EMI`, `assets.businessStatus.LICENSE_ONLY`, …), the sort options, and the empty state. Verify no literal user-facing string remains in the new components.

- [ ] **Step 7: Verify**

Open `/en/listings`. Confirm: 34 published listings, the suspended seller's listing absent, category counts correct, filters change the URL and survive a reload, `/ru/listings` fully translated, and a hand-edited hostile URL (`?page=-1&sort=nonsense&categories=WOMBAT`) renders defaults instead of an error.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add asset catalog with URL-driven filters and smart search"
```

---

### Task 13: Asset detail and the NDA gate

**Files:**
- Create: `src/app/[locale]/listings/[id]/page.tsx`, `src/components/domain/gated-section.tsx`
- Modify: `src/server/queries/assets.ts`

**Interfaces:**
- Consumes: `canViewAsset`, `canViewFullAsset`, `toAssetDto`, `getViewer`.
- Produces: `getAssetDetail(id: string, viewer: MaybeViewer): Promise<{ asset: AssetDto; grant: GrantState; seller: SellerSummary } | null>`, where `SellerSummary` is `{ id: string; companyName: string | null; country: string; verified: boolean }` declared in the same file. `companyName` is `null` whenever the gate is closed — the seller's identity is confidential until an access request is approved, so it is redacted by the same rule as the asset's own fields.

- [ ] **Step 1: Write the detail query**

`getAssetDetail` loads the asset with its seller and the viewer's own `AccessRequest` (if the viewer is a buyer), maps the request status to a `GrantState` (`null` row → `'NONE'`), builds the `AssetRef`, and returns `null` when `canViewAsset` is false — so an unauthorized viewer gets a 404, not a 403 that confirms the listing exists.

It then calls `toAssetDto(asset, canViewFullAsset(viewer, ref, grant))`. The confidential fields never enter the returned object unless the gate opened.

Increment `viewCount` in the same call when the viewer is neither the owner nor a manager, using `prisma.asset.update({ data: { viewCount: { increment: 1 } } })`.

- [ ] **Step 2: Build the page**

Render the teaser in full: header with `publicRef`, flag, status pill and asking price; the meta grid; the description; the "included" list; and a seller strip showing the company only when the gate is open, and "Verified seller" plus their country when it is not.

- [ ] **Step 3: Build the gated section**

`gated-section.tsx` takes the DTO and the grant state and renders one of four states:

- **Open** (`isFullAsset(dto)`) — the confidential grid: legal name, revenue, EBITDA, client count, data room link, notes.
- **Requestable** — an explanation of what is behind the gate and a "Request access" button opening a short message form (Task 14).
- **Pending** — "Your request is with the seller", with the submission date.
- **Closed** (declined, revoked, or the viewer is anonymous or a seller) — an explanation with a sign-in link for anonymous visitors.

The component receives only what the server chose to send. There is no client-side hiding, and the browser's view-source contains no confidential text in the closed states — verify this explicitly in Step 5.

- [ ] **Step 4: Add the message keys**

Extend both catalogues with the `gate` namespace covering all four states.

- [ ] **Step 5: Verify the gate is real**

Sign in as `buyer@n5deal.demo`. Open the listing they hold an approved grant for — confidential data shows. Open any other published listing — the gate is closed; view the page source and search for that asset's `legalName` from Studio. It must not appear anywhere in the HTML.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add asset detail with a server-enforced NDA gate"
```

---

### Task 14: Access requests

**Files:**
- Create: `src/server/actions/access-requests.ts`
- Modify: `src/components/domain/gated-section.tsx`, `src/app/[locale]/dashboard/page.tsx` (created in Task 18)

**Interfaces:**
- Consumes: `canRequestAccess`, `canDecideAccess`, `canRevokeAccess`, `requireViewer`.
- Produces: Server Actions `requestAccess(assetId, message)`, `decideAccess(requestId, decision)`, `revokeAccess(requestId)`, each returning `{ ok: true } | { ok: false; error: ActionError }`.
- Also create: `src/server/actions/types.ts` exporting `export type ActionError = 'FORBIDDEN' | 'NOT_FOUND' | 'ALREADY_REQUESTED' | 'INVALID'` and the shared `ActionResult` union above. Every Server Action in Tasks 14-20 returns that union.
- Every Server Action takes `locale` as part of its input payload, supplied by the calling component, because `requireViewer(locale)` needs it to redirect in the right language.

- [ ] **Step 1: Write the actions**

Create `src/server/actions/access-requests.ts` beginning with `'use server'`. Each action:

1. Calls `requireViewer(locale)`.
2. Loads the target and builds the `AssetRef`.
3. Calls the matching predicate from `@/lib/authz` and returns `{ ok: false, error: 'FORBIDDEN' }` when it is false. **Never** trust that the UI already checked. `canDecideAccess` and `canRevokeAccess` each take the loaded `GrantState` as their third argument — pass the state you just read, and do not re-derive the transition rule here. Deciding is legal only from `REQUESTED`, revoking only from `APPROVED`.
4. Validates the payload with zod (`message` trimmed, at most 1000 characters).
5. Performs the write.
6. Calls `revalidatePath` for the affected routes.

`requestAccess` creates the row with `status: 'REQUESTED'`; the unique constraint on `(assetId, buyerProfileId)` is the backstop against a double submit, so catch `P2002` and return `{ ok: false, error: 'ALREADY_REQUESTED' }` rather than crashing.

`decideAccess` sets `APPROVED` or `DECLINED`, stamps `decidedAt` and `decidedByUserId`, and — on approval — opens a `Conversation` between the two parties if one does not exist, seeded with the buyer's request message. Approval is the moment the two sides may talk; creating the thread here means the seller's inbox is never empty after they approve someone.

`revokeAccess` sets `REVOKED` and stamps the decider. It does not delete the conversation — the parties already spoke, and erasing that would lose history the manager may need.

- [ ] **Step 2: Wire the buyer side**

In `gated-section.tsx`, the "Request access" button opens a form bound to `requestAccess`, with `useFormStatus` for the pending state and an inline error for the failure cases.

- [ ] **Step 3: Verify the guard from outside the UI**

Sign in as `buyer@n5deal.demo`, then call `decideAccess` on a request belonging to another seller directly from the browser console via the Server Action endpoint. Expect `FORBIDDEN`. This is the check that proves the rule lives on the server; do not skip it.

- [ ] **Step 4: Verify the flow**

As a buyer: request access, see the pending state. As `seller@n5deal.demo`: approve it. Back as the buyer: confidential data now renders and a conversation exists. As the seller: revoke it, and confirm the buyer's view closes again on reload.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add access request lifecycle with server-side guards"
```

---

### Task 15: Listing creation and publication

**Files:**
- Create: `src/app/[locale]/listings/new/page.tsx`, `src/app/[locale]/listings/[id]/edit/page.tsx`
- Create: `src/components/domain/listing-form.tsx`, `src/components/domain/teaser-review-panel.tsx`
- Create: `src/server/actions/assets.ts`, `src/lib/validation/asset.ts`

**Interfaces:**
- Consumes: `canPublishListing`, `canEditAsset`, `reviewTeaser`, `isAiEnabled`.
- Produces: `assetInputSchema` (zod) from `@/lib/validation/asset`; Server Actions `saveDraft(input)`, `submitForReview(assetId)`, `runTeaserReview(assetId)`.

- [ ] **Step 1: Write the validation schema**

`src/lib/validation/asset.ts` exports `assetInputSchema`: teaser title 10–120 characters, description 40–2000, `askingPriceCents` a positive integer, `employees` a non-negative integer, `yearOfIssue` between 1900 and the current year, `included` at most 8 entries, plus every confidential field required. It is pure and unit-testable; add three cases to `tests/unit/validation/asset.test.ts` covering a valid input, a too-short teaser, and a future `yearOfIssue`.

- [ ] **Step 2: Write the actions**

`saveDraft` requires `canPublishListing`, parses through `assetInputSchema`, and creates or updates the asset with `status: 'DRAFT'`. On create it allocates `publicRef` as `N5-` plus the next free number (read the current maximum inside the same transaction).

`submitForReview` requires `canEditAsset`, refuses unless the asset is `DRAFT` or `REJECTED`, and moves it to `PENDING_REVIEW`.

`runTeaserReview` requires `canEditAsset` and returns `reviewTeaser(...)` — or `null` when AI is unavailable.

- [ ] **Step 3: Build the form**

`listing-form.tsx` is a client component in two visually separated sections — **Public teaser** and **Confidential**, the latter marked as released only after an approved NDA request. The separation is the product teaching the seller what the gate does before they hit it.

Fields map one-to-one onto `assetInputSchema`. Money inputs accept euros and convert with `parseEuros` from `@/lib/money`.

- [ ] **Step 4: Build the review panel**

`teaser-review-panel.tsx` renders when the seller presses "Check teaser". Loading state, then either the leaks (each quoting `excerpt` with its explanation) and suggestions, or "No confidentiality issues found". When AI is disabled the button is not rendered at all — no dead control, no error toast.

Every `excerpt` reaching this panel has already been verified by `keepQuotedLeaks` to occur in the teaser, so the panel may highlight it in the text without re-checking. A prompt is not an enforcement mechanism; that filter is, and it is why the panel can present an excerpt as evidence rather than as a claim.

The findings are advisory. The seller may submit anyway; the panel says so plainly.

- [ ] **Step 5: Verify**

As `seller@n5deal.demo`: create a listing whose teaser contains the legal name, run the check, confirm the leak is quoted. Fix the teaser, re-run, confirm it comes back clean. Submit for review, confirm the status becomes `PENDING_REVIEW` and the listing is absent from the public catalog. Then unset `ANTHROPIC_API_KEY`, restart, and confirm the form works with the check button gone.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add listing creation with AI confidentiality review"
```

---

### Task 16: Buyer profile and mandate

**Files:**
- Create: `src/app/[locale]/profile/page.tsx`, `src/components/domain/mandate-form.tsx`
- Create: `src/server/actions/profile.ts`, `src/lib/validation/profile.ts`

**Interfaces:**
- Consumes: `requireViewer`.
- Produces: `buyerProfileSchema`, `mandateSchema` from `@/lib/validation/profile`; Server Actions `saveBuyerProfile(input)`, `saveMandate(input)`.

This is the assignment's "create and maintain their profile" and "describe their investment/acquisition interests". The mandate is not a settings page — it is the input to every match score the buyer will see, so the form says so and previews the effect.

- [ ] **Step 1: Write the schemas**

`mandateSchema`: arrays of the known enum members, country codes matching `/^[A-Z]{2}$/`, `ticketMinCents`/`ticketMaxCents` nullable non-negative integers with a refinement that min ≤ max when both are present, `timelineMonths` between 1 and 60 or null, `notes` at most 1000 characters. Add unit tests in `tests/unit/validation/profile.test.ts` for the inverted-ticket refinement and a bad country code.

- [ ] **Step 2: Write the actions**

Both actions call `requireViewer`, then refuse unless `viewer.buyerProfileId` is non-null — a seller or manager posting to this endpoint gets `FORBIDDEN`. `saveMandate` upserts on `buyerProfileId`, so a buyer who never had a mandate gets one on first save.

- [ ] **Step 3: Build the form**

Multi-select chips for categories, countries, licence types and business statuses; two euro inputs for the ticket band; a timeline slider; a notes field. Above the fields, a live count — "matches 14 of 34 listings today" — computed on the server after each save. Empty selections are labelled "Any", making the no-preference semantics from Task 5 visible rather than mysterious.

- [ ] **Step 4: Verify**

As `buyer@n5deal.demo`: narrow the mandate to a single category, save, confirm the match count drops and the dashboard recommendations change. Reload — the values persist. Try saving `ticketMin` above `ticketMax` and confirm the inline error.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add buyer profile and investment mandate editing"
```

---

### Task 17: Buyer catalog for sellers

**Files:**
- Create: `src/server/queries/buyers.ts`, `src/app/[locale]/buyers/page.tsx`, `src/app/[locale]/buyers/[id]/page.tsx`
- Create: `src/components/domain/buyer-card.tsx`, `src/components/domain/buyer-filter-sidebar.tsx`, `src/components/domain/match-badge.tsx`
- Create: `src/server/actions/ai.ts` — the `'use server'` wrapper the match badge calls, exposing `explainMatchAction(input: ExplainMatchInput): Promise<string | null>`

**Interfaces:**
- Consumes: `parseBuyerFilters`, `scoreMatch`, `canModerate`, `requireViewer`.
- Produces: `listBuyers(filters, viewer, forAssetId?)` and `getBuyerDetail(id, viewer)` from `@/server/queries/buyers`.

This is the seller's half of the marketplace, and the assignment's "browse Buyers / filter/search Buyers".

- [ ] **Step 1: Write the query**

`listBuyers` is restricted to sellers and managers — a buyer calling it gets an empty result, not a directory of their competitors. It always filters to `user: { status: 'ACTIVE' }`.

Filters map onto the mandate: `categories` and `countries` use `hasSome` against the mandate arrays, `buyerTypes` uses `in`, and `ticketMinCents` selects buyers whose `ticketMaxCents` is null or at least that value.

When `forAssetId` is supplied, load that asset (after checking the caller owns it), score every returned buyer with `scoreMatch`, and sort by score descending. Without it, sort by `createdAt` descending.

Sort ties by `specificity` descending before falling back to `createdAt`: a buyer who scored 100 because their mandate constrains all five criteria is a genuinely better lead than one who scored 100 because their mandate constrains nothing, and the seller must not have to guess which is which.

- [ ] **Step 2: Build the match badge**

`match-badge.tsx` renders the band as a coloured pill with the score, and a popover listing the reasons — each translated from its `MatchReasonCode` and `MatchReasonKind`, so it works with no AI at all. When AI is enabled, the popover additionally fetches `explainMatch` through a Server Action and shows the sentence beneath the list.

The deterministic reasons are always present; the AI sentence is a garnish on top of them. That ordering is deliberate and worth stating in the README.

- [ ] **Step 3: Build the pages**

`/buyers` renders the sidebar, an asset selector ("score against…" listing the seller's own published assets), and the buyer grid. Selecting an asset sets `forAsset` in the URL, so a scored view is shareable like any other.

`/buyers/[id]` shows the buyer's profile and full mandate, the match breakdown when arrived at from an asset, and a "Contact buyer" button (Task 19).

- [ ] **Step 4: Verify**

As `seller@n5deal.demo`: open `/en/buyers`, confirm 12 buyers. Select one of your published listings — the order changes and scores appear. Confirm the narrow-mandate buyers score low against a mismatched asset and high against a matching one. Sign in as a buyer and navigate to `/en/buyers` directly — expect an empty state, not a directory.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add buyer catalog with mandate filtering and match scoring"
```

---

### Task 18: Role dashboards

**Files:**
- Create: `src/app/[locale]/dashboard/page.tsx`, `src/components/domain/buyer-dashboard.tsx`, `src/components/domain/seller-dashboard.tsx`
- Modify: `src/server/queries/assets.ts`, `src/server/queries/buyers.ts`

**Interfaces:**
- Consumes: `requireViewer`, `scoreMatch`, `listAssets`, `listBuyers`.
- Produces: `getRecommendedAssets(buyerProfileId, limit)` and `getSellerOverview(sellerProfileId)`.

- [ ] **Step 1: Write the queries**

`getRecommendedAssets` loads the buyer's mandate, loads published assets from active sellers, scores each with `scoreMatch`, drops the `NONE` band, and returns the top `limit` with their `MatchResult`. With 34 published assets, scoring in memory is correct and simple; note in the README that a real deployment would move this to a filtered query plus a background-computed score.

`getSellerOverview` returns the seller's assets grouped by status, their pending access requests with buyer summaries, and their unread message count.

- [ ] **Step 2: Build the dashboards**

`/dashboard` reads the viewer's role and renders the matching component; a manager is redirected to `/admin`.

**Buyer:** mandate summary with an edit link, recommended assets with match badges, access requests grouped by status, unread messages.

When `scoreMatch` reports `specificity === 0` the mandate constrains nothing, every listing ties at 100, and a ranked list would be a lie. In that case do not render recommendations at all — render the "complete your mandate" prompt in their place. At `specificity` between 1 and 4, render the ranking but label it with what it is based on, so a 100 from two criteria is not mistaken for a 100 from five.

**Seller:** listings grouped by status with the `PENDING_REVIEW` and `REJECTED` ones surfaced first (a rejected listing shows its `rejectionReason`), the incoming access request queue with approve/decline inline, and top matched buyers for the most recently published listing.

- [ ] **Step 3: Verify**

As the seeded buyer: recommendations are ordered by score, none are `NONE`, the two pending requests appear. As the seeded seller: the request queue has two entries, approving one moves it and opens a conversation. As the manager: `/dashboard` redirects to `/admin`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add buyer and seller dashboards with match recommendations"
```

---

### Task 19: Messaging

**Files:**
- Create: `src/lib/thread-key.ts`, `src/server/queries/conversations.ts`, `src/server/actions/messages.ts`
- Create: `src/app/[locale]/inbox/page.tsx`, `src/app/[locale]/inbox/[id]/page.tsx`, `src/components/domain/message-composer.tsx`
- Test: `tests/unit/thread-key.test.ts`
- Modify: `prisma/seed.ts` (import `buildThreadKey` in place of the inlined expression)

**Interfaces:**
- Consumes: `canMessage`, `requireViewer`.
- Produces: `buildThreadKey(input): string`; `listConversations(viewer)`, `getConversation(id, viewer)`; Server Actions `startConversation(input)`, `sendMessage(conversationId, body)`, `markRead(conversationId)`.

- [ ] **Step 1: Write the failing test for the thread key**

Create `tests/unit/thread-key.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildThreadKey } from '@/lib/thread-key'

describe('buildThreadKey', () => {
  it('is stable for the same triple', () => {
    const input = { assetId: 'a-1', buyerProfileId: 'b-1', sellerProfileId: 's-1' }
    expect(buildThreadKey(input)).toBe(buildThreadKey(input))
  })

  it('distinguishes conversations about different assets', () => {
    expect(buildThreadKey({ assetId: 'a-1', buyerProfileId: 'b-1', sellerProfileId: 's-1' }))
      .not.toBe(buildThreadKey({ assetId: 'a-2', buyerProfileId: 'b-1', sellerProfileId: 's-1' }))
  })

  it('collapses every asset-less conversation between one pair into one key', () => {
    expect(buildThreadKey({ assetId: null, buyerProfileId: 'b-1', sellerProfileId: 's-1' }))
      .toBe(buildThreadKey({ assetId: null, buyerProfileId: 'b-1', sellerProfileId: 's-1' }))
  })

  it('does not collide an asset-less thread with one about an asset named "none"', () => {
    expect(buildThreadKey({ assetId: null, buyerProfileId: 'b-1', sellerProfileId: 's-1' }))
      .not.toBe(buildThreadKey({ assetId: 'none', buyerProfileId: 'b-1', sellerProfileId: 's-1' }))
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test tests/unit/thread-key.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

Create `src/lib/thread-key.ts`:

```ts
export interface ThreadKeyInput {
  assetId: string | null
  buyerProfileId: string
  sellerProfileId: string
}

/**
 * A deterministic unique key for a conversation.
 *
 * This exists because Postgres treats NULLs as distinct in a unique index: a
 * composite unique on (assetId, buyerProfileId, sellerProfileId) would happily
 * allow unlimited duplicate asset-less threads between the same two parties.
 * Encoding the null as a sentinel and carrying the constraint on one string
 * column closes that hole. The `asset:` prefix keeps a real asset whose id is
 * literally "none" from colliding with the sentinel.
 */
export function buildThreadKey(input: ThreadKeyInput): string {
  const asset = input.assetId === null ? 'noasset' : `asset:${input.assetId}`
  return `${asset}|buyer:${input.buyerProfileId}|seller:${input.sellerProfileId}`
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm test tests/unit/thread-key.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the queries and actions**

`listConversations` returns threads where the viewer is the buyer or the seller, ordered by `lastMessageAt` descending, each with the counterparty, the asset teaser reference and an unread count.

`getConversation` returns `null` unless the viewer is one of the two participants — a manager is not a participant and cannot read private threads. That restraint is deliberate: a manager who can read every conversation is a privacy problem, and moderation does not need it. State it in the README.

`startConversation` checks `canMessage(viewer, { userId, status })` against the counterparty it just loaded — the predicate refuses a suspended counterparty and refuses self-messaging, but deliberately does not require any prior relationship, because cold contact is a required capability. It then builds the key and upserts on `threadKey` so a double click cannot create two threads. `sendMessage` checks participation and `canMessage` against the counterparty's live status, appends the message and bumps `lastMessageAt`. `markRead` stamps `readAt` on the counterparty's unread messages.

- [ ] **Step 6: Build the screens**

`/inbox` lists threads with counterparty, asset reference, snippet, timestamp and an unread dot. `/inbox/[id]` renders the thread with the composer, marking read on load. Wire the "Contact seller" and "Contact buyer" buttons from Tasks 13 and 17 to `startConversation`, then redirect into the thread.

- [ ] **Step 7: Verify**

As the buyer: contact a seller from a listing, send a message. As that seller: the thread appears with an unread dot; reply; the dot clears. Suspend the buyer as the manager, then try to reply as the seller — expect the composer disabled with an explanation. Double-click "Contact seller" and confirm exactly one thread exists in Studio.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add threaded messaging with a collision-safe thread key"
```

---

### Task 20: Platform manager console

**Files:**
- Create: `src/app/[locale]/admin/page.tsx`, `src/server/queries/admin.ts`, `src/server/actions/moderation.ts`
- Create: `src/components/domain/participant-table.tsx`, `src/components/domain/admin-asset-table.tsx`, `src/components/domain/moderation-dialog.tsx`

**Interfaces:**
- Consumes: `canModerate`, `requireViewer`.
- Produces: `listParticipants(filters, viewer)`, `listAllAssets(filters, viewer)`, `listModerationLog(viewer)`; Server Actions `suspendUser(userId, reason)`, `reinstateUser(userId, reason)`, `removeUser(userId, reason)`, `moderateListing(assetId, decision, reason)`.

- [ ] **Step 1: Write the queries**

Every function begins with `if (!canModerate(viewer)) throw new Error('FORBIDDEN')`. `listParticipants` returns buyers and sellers with role, status, verification, listing or request counts, filterable by role, status and a text search over email and display name. `listAllAssets` returns every asset in every status, with the `PENDING_REVIEW` queue available as a filter.

- [ ] **Step 2: Write the moderation actions**

Each action checks `canModerate`, requires a non-empty reason of at least 10 characters, performs the status change and writes a `ModerationLog` row **in the same transaction**. The log write is not optional: an unlogged status change is exactly the audit hole design decision D4 exists to prevent.

`removeUser` sets `status: 'REMOVED'` — a soft delete. Rows are preserved so the counterparty's conversations and access requests remain coherent.

`moderateListing` moves `PENDING_REVIEW` to `PUBLISHED` (stamping `publishedAt`) or to `REJECTED` (storing `rejectionReason`), and can move a `PUBLISHED` listing to `SUSPENDED`.

A manager cannot moderate themselves — guard it explicitly and test it, or a stray click locks the only admin account out of the demo.

- [ ] **Step 3: Build the console**

Three tabs sharing one page, with the active tab in the URL so a filtered admin view is shareable:

- **Participants** — table with role, status, verification, activity counts, per-row actions.
- **Assets** — table with status, seller, category, price and the review queue surfaced first.
- **Moderation log** — reverse-chronological list of actor, action, target, reason, timestamp.

`moderation-dialog.tsx` collects the mandatory reason before any destructive action and states the consequence in plain language ("their 4 listings will be hidden from the catalog immediately").

- [ ] **Step 4: Verify the cascade**

As the manager: approve the pending listing, confirm it appears in the public catalog. Suspend `seller@n5deal.demo` with a reason; open `/en/listings` in a private window and confirm their listings are gone; check the log records it. Reinstate them and confirm the listings return. Attempt to suspend your own manager account — expect a refusal. Finally, sign in as the suspended seller before reinstating and confirm they land on `/suspended` with the reason shown.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add platform manager console with audited moderation"
```

---

### Task 21: Landing page

**Files:**
- Modify: `src/app/[locale]/page.tsx`
- Create: `src/components/domain/hero.tsx`, `src/components/domain/category-strip.tsx`

**Interfaces:**
- Consumes: `listAssets`, `prisma` for aggregates.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Build the page**

Dark hero in the reference's register: the proposition, the aggregate value of published listings and the listing count computed from real data (never hardcoded — a landing page whose numbers disagree with its own catalog reads as a mock), and two calls to action, "Start Buying" and "Start Selling", both routing to `/login`.

Below the hero: the category strip with live counts linking into pre-filtered catalog URLs, then six recently published listings using the same `AssetCard` as the catalog.

- [ ] **Step 2: Verify**

Confirm the counts match the catalog exactly, every category tile lands on a correctly filtered URL, and the page renders in both locales.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add landing page with live marketplace figures"
```

---

### Task 22: End-to-end tests

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/seller.spec.ts`, `tests/e2e/buyer.spec.ts`, `tests/e2e/manager.spec.ts`, `tests/e2e/helpers.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `DEMO_ACCOUNTS`, `DEMO_PASSWORD` from the seed fixtures.
- Produces: `pnpm test:e2e`.

Three flows, one per role, each asserting a state change the unit tests cannot reach.

- [ ] **Step 1: Install and configure**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

`playwright.config.ts`: `testDir: 'tests/e2e'`, `baseURL: 'http://localhost:3000'`, a `webServer` block running `pnpm build && pnpm start`, `reuseExistingServer: !process.env.CI`, and `fullyParallel: false` — the specs share one database and moderation actions are global, so parallel runs would fight.

Add scripts: `"test:e2e": "playwright test"`, `"test:all": "pnpm test && pnpm test:e2e"`.

- [ ] **Step 2: Write the helper**

`tests/e2e/helpers.ts` exports `signInAs(page, role)` which navigates to `/en/login`, clicks the matching demo button, and waits for the header to show the signed-in state. Also export `resetDb()` running `pnpm db:reset && pnpm db:seed` via `execSync`, called from a `globalSetup`.

- [ ] **Step 3: Write the seller flow**

Sign in as the seller → create a listing → submit for review → sign in as the manager → approve it → sign out → assert the listing is visible at `/en/listings` to an anonymous visitor by its `publicRef`.

- [ ] **Step 4: Write the buyer flow**

Sign in as the buyer → open `/en/listings` → apply the EMI category filter → assert the URL contains `categories=EMI` and every visible card shows the EMI badge → open a listing with no grant → assert the confidential block is absent from the page content → request access → sign in as that listing's seller → approve → sign back in as the buyer → assert the confidential block is now present.

- [ ] **Step 5: Write the manager flow**

Note a published listing's `publicRef` as an anonymous visitor → sign in as the manager → suspend its seller with a reason → sign out → assert the `publicRef` no longer appears at `/en/listings` → sign in as the manager → reinstate → assert it is back.

- [ ] **Step 6: Run the suite**

Run: `pnpm test:e2e`
Expected: 3 passing specs. If a spec is flaky on timing, wait on a visible assertion rather than adding a fixed delay — a `waitForTimeout` here hides a real race.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: add end-to-end coverage for the three role flows"
```

---

### Task 23: Documentation and deployment

**Files:**
- Create: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: everything.
- Produces: a deployed URL.

- [ ] **Step 1: Write the README**

Sections, in this order:

1. **What this is** — one paragraph, plus the deployed URL and the three demo logins.
2. **Running it locally** — prerequisites, `pnpm i`, the `.env` variables, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`. State explicitly that `ANTHROPIC_API_KEY` is optional and what changes without it.
3. **Product decisions** — the three roles and their flows; why listings are anonymous teasers with an NDA gate; why the manager approves listings rather than only deleting them.
4. **Key technical decisions** — D1 through D6 from the spec, each in two or three sentences with its reasoning, plus the alternatives that were rejected and why (no separate REST layer, no tRPC, no client-side persistence).
5. **Data model** — the diagram and a note on why moderation is an append-only log.
6. **AI functionality** — the three features, the deterministic-core/LLM-garnish split, and the degradation guarantee.
7. **Testing** — what the unit tests protect and what the three e2e flows cover; `pnpm test:all`.
8. **Assumptions** — section 13 of the spec, verbatim.
9. **AI tools used** — Claude Code for the design document, this implementation plan, and the implementation, with a note on where the plan was overridden by hand.
10. **What I would improve with more time** — section 14 of the spec.

Keep it honest: list what is *not* implemented rather than letting a reader discover it.

- [ ] **Step 2: Deploy**

Push to GitHub, import the repository into Vercel, set `DATABASE_URL`, `AUTH_SECRET` and optionally `ANTHROPIC_API_KEY`, and add `"postinstall": "prisma generate"` to `package.json` so the client is generated on Vercel's build machine. Run the seed once against the production database from a local shell with `DATABASE_URL` pointed at it.

- [ ] **Step 3: Verify the deployment**

From a private window on the deployed URL: browse the catalog anonymously, sign in with each demo button, run the whole core flow end to end, and confirm both locales work. Then open it in a *different browser* and confirm the same data is there — the point of choosing a real database over browser storage.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: add README with setup, decisions and assumptions"
```

---

## Self-Review Notes

Checked against the spec on 2026-09-04:

- **Spec coverage.** Every spec section maps to at least one task. Section 4's six decisions land in Tasks 2, 7, 8, 12 and 20; section 5's model in Task 2; section 6's access matrix in Task 6 (rules) and Tasks 13, 14, 20 (enforcement); section 7 in Task 5; section 8 in Task 9; section 9's screens in Tasks 11–21; section 10 in Task 10; section 11 in Tasks 5–9 and 22; section 12 in Task 23.
- **Favourites** are in the schema (Task 2) and the spec, but no task builds the UI. This is intentional: it is the cheapest thing to drop, and the `/favorites` route listed in the file structure should only be built if Tasks 1–23 finish early. The README must not claim it exists.
- **Type consistency.** `MatchReason`, `Viewer`, `AssetRef`, `GrantState`, `AssetFilters`, `TeaserAsset`/`FullAsset`/`AssetDto` and `buildThreadKey` keep one name and one shape from the task that defines them through every task that consumes them.
- **Cut order** (spec section 3) applies to Tasks 19 and 22 respectively.
