import type { AssetCategory, AssetStatus, BusinessStatus } from '@/generated/prisma/client'
import { SELLERS } from './participants'

/**
 * Money is integer euro cents everywhere. tsconfig targets ES2017, so a bigint
 * literal (`123n`) does not compile — every bigint is built via `BigInt(...)`.
 */
function cents(euros: number): bigint {
  return BigInt(Math.round(euros * 100))
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}

/**
 * Shaped as the Asset create input minus `sellerProfileId`: `sellerEmail`
 * stands in for it here and prisma/seed.ts resolves it to the real
 * sellerProfileId once sellers exist.
 */
export interface AssetFixture {
  id: string
  sellerEmail: string
  publicRef: string
  status: AssetStatus
  category: AssetCategory
  licenceType: string
  businessType: string
  country: string
  regulator: string
  businessStatus: BusinessStatus
  askingPriceCents: bigint
  employees: number
  yearOfIssue: number
  included: string[]
  teaserTitle: string
  teaserDescription: string
  legalName: string
  revenueCents: bigint
  ebitdaCents: bigint
  clientCount: number
  dataRoomUrl: string | null
  confidentialNotes: string
  publishedAt: Date | null
  rejectionReason: string | null
  viewCount: number
}

interface Jurisdiction {
  country: string
  regulator: string
  countryName: string
  suffix: string
  region: string
}

/** 15 jurisdictions with real regulator names, spanning the EU/EEA, UK, GCC, Asia, US and Switzerland. */
const JURISDICTIONS: Jurisdiction[] = [
  { country: 'MT', regulator: 'MFSA', countryName: 'Malta', suffix: 'Ltd', region: 'the EU/EEA' },
  { country: 'GB', regulator: 'FCA', countryName: 'the United Kingdom', suffix: 'Ltd', region: 'the UK' },
  { country: 'LT', regulator: 'Bank of Lithuania', countryName: 'Lithuania', suffix: 'UAB', region: 'the EU/EEA' },
  { country: 'CY', regulator: 'CySEC', countryName: 'Cyprus', suffix: 'Ltd', region: 'the EU/EEA' },
  { country: 'HK', regulator: 'C&ED', countryName: 'Hong Kong', suffix: 'Limited', region: 'Greater China' },
  { country: 'SG', regulator: 'MAS', countryName: 'Singapore', suffix: 'Pte. Ltd.', region: 'Southeast Asia' },
  { country: 'AE', regulator: 'DFSA', countryName: 'the UAE', suffix: 'Ltd', region: 'the GCC' },
  { country: 'EE', regulator: 'FSA', countryName: 'Estonia', suffix: 'OU', region: 'the EU/EEA' },
  { country: 'US', regulator: 'FinCEN', countryName: 'the United States', suffix: 'LLC', region: 'North America' },
  { country: 'CH', regulator: 'FINMA', countryName: 'Switzerland', suffix: 'AG', region: 'Switzerland' },
  { country: 'IE', regulator: 'Central Bank of Ireland', countryName: 'Ireland', suffix: 'Ltd', region: 'the EU/EEA' },
  { country: 'LU', regulator: 'CSSF', countryName: 'Luxembourg', suffix: 'S.a r.l.', region: 'the EU/EEA' },
  { country: 'NL', regulator: 'DNB', countryName: 'the Netherlands', suffix: 'B.V.', region: 'the EU/EEA' },
  { country: 'PL', regulator: 'KNF', countryName: 'Poland', suffix: 'Sp. z o.o.', region: 'the EU/EEA' },
  { country: 'PT', regulator: 'Banco de Portugal', countryName: 'Portugal', suffix: 'Lda', region: 'the EU/EEA' },
]

/** Period-8 cycle so PAYMENT is the most common category, mirroring the reference product. */
const CATEGORY_PATTERN: AssetCategory[] = ['PAYMENT', 'FINTECH', 'PAYMENT', 'EMI', 'PAYMENT', 'BANK', 'PAYMENT', 'CRYPTO']

interface CategoryInfo {
  label: string
  businessTypes: string[]
  /**
   * Drawn from the fixed licence-type universe: EMI, SEMI, MSO, PI, API,
   * CASP, Banking. Deliberately NOT padded for variety's sake: BANK and
   * CRYPTO each have exactly one domain-plausible option (a bank sold with
   * an MSO licence, or a crypto venue with a Banking licence, would read as
   * generated nonsense to anyone who knows the industry). PAYMENT gets a
   * fourth option, EMI, because that overlap is real: most e-wallet and
   * prepaid-card payment institutions are in fact licensed as EMIs.
   */
  licenceOptions: string[]
  /** Always included; describes the core regulatory asset. */
  includedCore: string
  /** Extra items rotated 3-at-a-time (see rotatedIncluded) so two listings
   * of the same category don't read as byte-identical. */
  includedExtras: string[]
}

const CATEGORY_INFO: Record<AssetCategory, CategoryInfo> = {
  BANK: {
    label: 'bank',
    businessTypes: ['Digital-first challenger bank', 'Retail banking franchise', 'Correspondent banking platform'],
    licenceOptions: ['Banking'],
    includedCore: 'Full banking licence',
    includedExtras: [
      'Core banking platform',
      'Correspondent banking relationships',
      'Compliance & AML function',
      'Retail deposit book (anonymised)',
      'Core banking staff transfer',
    ],
  },
  FINTECH: {
    label: 'fintech platform',
    businessTypes: [
      'Open banking aggregator',
      'Lending-as-a-service platform',
      'Regtech compliance platform',
      'SME finance platform',
    ],
    licenceOptions: ['API', 'PI', 'MSO'],
    includedCore: 'Regulatory permissions',
    includedExtras: [
      'Proprietary platform codebase',
      'Core banking API integrations',
      'Compliance framework',
      'Open banking consent infrastructure',
      'Existing partner-bank agreements',
    ],
  },
  PAYMENT: {
    label: 'payment institution',
    businessTypes: [
      'Card acquiring & processing business',
      'Merchant payment gateway',
      'Cross-border payout platform',
      'PSP with card scheme membership',
    ],
    licenceOptions: ['PI', 'API', 'MSO', 'EMI'],
    includedCore: 'Payment institution licence',
    includedExtras: [
      'Card scheme membership',
      'Processing infrastructure',
      'Merchant portfolio (anonymised)',
      'Acquiring bank relationships',
      'Fraud & chargeback tooling',
      'PCI-DSS certified infrastructure',
    ],
  },
  EMI: {
    label: 'e-money institution',
    businessTypes: ['E-money issuing platform', 'Prepaid card programme manager', 'Digital wallet provider'],
    licenceOptions: ['EMI', 'SEMI'],
    includedCore: 'E-money licence',
    includedExtras: [
      'IBAN issuance capability',
      'Card programme agreements',
      'Safeguarding infrastructure',
      'Prepaid card BIN sponsorship',
      'Digital wallet app & backend',
    ],
  },
  CRYPTO: {
    label: 'crypto-asset business',
    businessTypes: ['Crypto exchange', 'Custody & wallet provider', 'Crypto-to-fiat on/off-ramp'],
    licenceOptions: ['CASP'],
    includedCore: 'CASP registration',
    includedExtras: [
      'Custody infrastructure',
      'Exchange matching engine',
      'AML / travel-rule tooling',
      'Cold-storage key management',
      'Liquidity provider relationships',
    ],
  },
}

/**
 * Picks a rotating window of 3 extras (plus the always-present core item),
 * keyed by the listing's occurrence within its own category, so consecutive
 * listings of the same category don't share an identical included list.
 */
function rotatedIncluded(info: CategoryInfo, occurrence: number): string[] {
  const windowSize = 3
  const start = occurrence % info.includedExtras.length
  const extras = Array.from(
    { length: windowSize },
    (_, k) => info.includedExtras[(start + k) % info.includedExtras.length],
  )
  return [info.includedCore, ...extras]
}

// 20 and 11 items respectively: gcd(20, 11) = 1, so (i % 20, i % 11) is a
// unique pair for every i in 0..39 and every legal name below is distinct.
const NAME_PREFIXES = [
  'Meridian', 'Solstice', 'Cobalt', 'Lumen', 'Northbridge', 'Anchor', 'Vantage', 'Silverline',
  'Harbor', 'Crestwood', 'Bluepeak', 'Ironwood', 'Solace', 'Nimbus', 'Fairwind', 'Keystone',
  'Aurora', 'Beacon', 'Trellis', 'Vertex',
]
const NAME_WORDS = [
  'Payments', 'Capital', 'Finance', 'Digital', 'Markets', 'Holdings', 'Ventures', 'Technologies',
  'Group', 'Partners', 'Solutions',
]

const REVENUE_MULTIPLIERS = [0.3, 0.22, 0.18, 0.25, 0.15, 0.35, 0.2, 0.28]
const EBITDA_MARGINS = [0.18, 0.25, 0.12, 0.3, 0.2, 0.15, 0.35, 0.22]

const CONFIDENTIAL_NOTES = [
  'Seller open to a phased handover with transitional support for up to 3 months.',
  'Management team willing to stay on for a 6-month transition if required.',
  'Priced firm; seller will consider staged consideration structures for the right buyer.',
  'Seller is a fund with a defined exit timeline and is motivated to move quickly.',
  'Data room fully populated; NDA-gated documents available within 24 hours of approval.',
]

/** 40 ascending values from EUR 150,000 to EUR 25,000,000. */
const PRICE_LADDER_EUR = [
  150_000, 170_000, 190_000, 220_000, 250_000, 290_000, 330_000, 380_000, 430_000, 490_000,
  550_000, 625_000, 725_000, 825_000, 950_000, 1_075_000, 1_225_000, 1_400_000, 1_600_000, 1_825_000,
  2_050_000, 2_350_000, 2_700_000, 3_050_000, 3_500_000, 4_000_000, 4_550_000, 5_200_000, 5_900_000, 6_750_000,
  7_700_000, 8_750_000, 10_000_000, 11_400_000, 13_000_000, 14_800_000, 16_900_000, 19_200_000, 21_900_000, 25_000_000,
]

const ACTIVE_SELLER_EMAILS = SELLERS.filter((s) => s.status !== 'SUSPENDED').map((s) => s.email)
const SUSPENDED_SELLER_EMAIL = SELLERS.find((s) => s.status === 'SUSPENDED')?.email
if (!SUSPENDED_SELLER_EMAIL) {
  throw new Error('Seed fixture error: SELLERS must contain exactly one SUSPENDED seller.')
}
if (ACTIVE_SELLER_EMAILS.length < 5) {
  throw new Error('Seed fixture error: SELLERS must contain at least 5 active sellers.')
}

/**
 * Round-robins the 34 ordinary published listings across the 5 active
 * sellers, then places the 6 special-status listings: the suspended
 * seller's sole (published-but-invisible) listing, one sold, one draft, one
 * rejected, and two pending review — one of which carries the deliberate
 * teaser leak.
 */
function sellerEmailFor(i: number): string {
  switch (i) {
    case 34:
      return SUSPENDED_SELLER_EMAIL as string
    case 35:
      return ACTIVE_SELLER_EMAILS[0] // SOLD -> seller@n5deal.demo
    case 36:
      return ACTIVE_SELLER_EMAILS[1] // DRAFT
    case 37:
      return ACTIVE_SELLER_EMAILS[2] // REJECTED
    case 38:
      return ACTIVE_SELLER_EMAILS[3] // PENDING_REVIEW (plain)
    case 39:
      return ACTIVE_SELLER_EMAILS[0] // PENDING_REVIEW (teaser leak) -> seller@n5deal.demo
    default:
      return ACTIVE_SELLER_EMAILS[i % 5]
  }
}

/**
 * How many listings of this same category came before index i — the n-th
 * PAYMENT listing, the n-th CRYPTO listing, etc. This must be a per-category
 * count, not the shared block index: CATEGORY_PATTERN has period 8 and
 * PAYMENT appears 4 times per block (it is the brief's most-common
 * category), so a block-index would hand all 4 of a block's PAYMENT
 * listings the same licence type, business type and included list.
 */
const CATEGORY_OCCURRENCE: number[] = (() => {
  const seenSoFar = new Map<AssetCategory, number>()
  return Array.from({ length: 40 }, (_, i) => {
    const category = CATEGORY_PATTERN[i % CATEGORY_PATTERN.length]
    const occurrence = seenSoFar.get(category) ?? 0
    seenSoFar.set(category, occurrence + 1)
    return occurrence
  })
})()

function statusFor(i: number): AssetStatus {
  switch (i) {
    case 35:
      return 'SOLD'
    case 36:
      return 'DRAFT'
    case 37:
      return 'REJECTED'
    case 38:
    case 39:
      return 'PENDING_REVIEW'
    default:
      return 'PUBLISHED' // includes i === 34, the suspended seller's listing
  }
}

function buildAsset(i: number): AssetFixture {
  const publicRef = `N5-${701 + i}`
  const id = `asset-${701 + i}`
  const category = CATEGORY_PATTERN[i % CATEGORY_PATTERN.length]
  const info = CATEGORY_INFO[category]
  const jurisdiction = JURISDICTIONS[i % JURISDICTIONS.length]
  const businessStatus: BusinessStatus = i % 3 === 2 ? 'LICENSE_ONLY' : 'ACTIVE'
  const occurrence = CATEGORY_OCCURRENCE[i]
  const licenceType = info.licenceOptions[occurrence % info.licenceOptions.length]
  const businessType = info.businessTypes[occurrence % info.businessTypes.length]
  const included = rotatedIncluded(info, occurrence)
  // Permutation of 0..39 (gcd(7, 40) = 1) so price is decorrelated from status/seller assignment.
  const priceEur = PRICE_LADDER_EUR[(i * 7 + 11) % PRICE_LADDER_EUR.length]
  const yearOfIssue = 2011 + (i % 13)
  const legalName = `${NAME_PREFIXES[i % NAME_PREFIXES.length]} ${NAME_WORDS[i % NAME_WORDS.length]} ${jurisdiction.suffix}`

  let employees: number
  let clientCount: number
  let revenueEur: number
  let ebitdaEur: number
  if (businessStatus === 'ACTIVE') {
    employees = Math.round(6 + Math.sqrt(priceEur / 1000) * 1.15)
    clientCount = Math.round(40 + Math.sqrt(priceEur / 1000) * 28)
    revenueEur = Math.round(priceEur * REVENUE_MULTIPLIERS[i % REVENUE_MULTIPLIERS.length])
    ebitdaEur = Math.round(revenueEur * EBITDA_MARGINS[(i + 3) % EBITDA_MARGINS.length])
  } else {
    // A licence-only shell has no trading business: a skeleton compliance
    // team, no clients, no revenue, and a small negative EBITDA from the
    // cost of keeping the licence in good standing.
    employees = 2 + (i % 5)
    clientCount = 0
    revenueEur = 0
    ebitdaEur = -(8_000 + (i % 6) * 6_000)
  }

  const statusPhrase =
    businessStatus === 'ACTIVE'
      ? `An operating ${info.label} with a live client base`
      : `A dormant, licence-only ${info.label} with no active trading`

  const teaserTitle = `${businessType} - ${licenceType} licence, ${jurisdiction.countryName}`
  let teaserDescription =
    `${statusPhrase}, holding a ${jurisdiction.regulator}-issued ${licenceType} licence since ${yearOfIssue}. ` +
    `Team of ${employees} across compliance, operations and technology. ` +
    `Included in the sale: ${included.join(', ')}. ` +
    `Positioned to serve clients across ${jurisdiction.region}.`

  const status = statusFor(i)
  const publishedAt = status === 'PUBLISHED' || status === 'SOLD' ? daysAgo(200 - i * 3) : null
  const dataRoomUrl =
    status === 'PUBLISHED' || status === 'SOLD' ? `https://dataroom.n5deal.demo/${publicRef.toLowerCase()}` : null

  let rejectionReason: string | null = null
  if (i === 37) {
    rejectionReason =
      'Asking price is inconsistent with the stated revenue multiple for this licence category; please provide updated financials or revise the price before resubmission.'
  }

  // The one deliberate exception: this pending listing leaks its own legal
  // name verbatim, giving the AI teaser review something true to find.
  if (i === 39) {
    teaserDescription += ` Formerly marketed under the ${legalName} brand prior to a 2022 rebrand, the business retains all original regulatory permissions.`
  }

  return {
    id,
    sellerEmail: sellerEmailFor(i),
    publicRef,
    status,
    category,
    licenceType,
    businessType,
    country: jurisdiction.country,
    regulator: jurisdiction.regulator,
    businessStatus,
    askingPriceCents: cents(priceEur),
    employees,
    yearOfIssue,
    included,
    teaserTitle,
    teaserDescription,
    legalName,
    revenueCents: cents(revenueEur),
    ebitdaCents: cents(ebitdaEur),
    clientCount,
    dataRoomUrl,
    confidentialNotes: CONFIDENTIAL_NOTES[i % CONFIDENTIAL_NOTES.length],
    publishedAt,
    rejectionReason,
    viewCount: 5 + ((i * 37 + 13) % 396),
  }
}

/**
 * 40 listings: 34 ordinary PUBLISHED + 1 PUBLISHED belonging to the
 * suspended seller (invisible in the catalog on first load) + 1 SOLD + 1
 * DRAFT + 1 REJECTED (with a reason) + 2 PENDING_REVIEW (one leaking its
 * legal name in the teaser).
 */
export const ASSETS: AssetFixture[] = Array.from({ length: 40 }, (_, i) => buildAsset(i))
