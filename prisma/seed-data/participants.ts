import type {
  AssetCategory,
  BusinessStatus,
  BuyerType,
  UserStatus,
} from '@/generated/prisma/client'

export const DEMO_PASSWORD = 'demo1234'

/** Reused by the Task 11 login page and the Task 22 e2e suite — do not rename. */
export const DEMO_ACCOUNTS = {
  buyer: 'buyer@n5deal.demo',
  seller: 'seller@n5deal.demo',
  manager: 'manager@n5deal.demo',
} as const

/**
 * Money is integer euro cents everywhere. tsconfig targets ES2017, so a bigint
 * literal (`123n`) does not compile — every bigint is built via `BigInt(...)`.
 */
function cents(euros: number): bigint {
  return BigInt(Math.round(euros * 100))
}

export interface MandateFixture {
  categories: AssetCategory[]
  countries: string[]
  licenceTypes: string[]
  businessStatuses: BusinessStatus[]
  ticketMinCents: bigint | null
  ticketMaxCents: bigint | null
  timelineMonths: number | null
  notes: string
}

export interface SellerFixture {
  userId: string
  sellerProfileId: string
  email: string
  companyName: string
  contactName: string
  country: string
  verified: boolean
  /** Absent means ACTIVE. Exactly one seller carries SUSPENDED. */
  status?: UserStatus
}

export interface BuyerFixture {
  userId: string
  buyerProfileId: string
  email: string
  displayName: string
  buyerType: BuyerType
  country: string
  bio: string
  verified: boolean
  mandate: MandateFixture
}

/**
 * 6 sellers. `seller@n5deal.demo` is first and stays ACTIVE throughout the
 * demo. `QuickLicence Brokers` is the pre-suspended participant the manager
 * screen needs — see the ModerationLog rows created in prisma/seed.ts.
 */
export const SELLERS: SellerFixture[] = [
  {
    userId: 'usr-seller-1',
    sellerProfileId: 'slp-seller-1',
    email: DEMO_ACCOUNTS.seller,
    companyName: 'N5 Bridge Advisors',
    contactName: 'Elena Rossi',
    country: 'MT',
    verified: true,
  },
  {
    userId: 'usr-seller-2',
    sellerProfileId: 'slp-seller-2',
    email: 'contact@harboradvisory.demo',
    companyName: 'Harbor Advisory Partners',
    contactName: 'David Kim',
    country: 'GB',
    verified: true,
  },
  {
    userId: 'usr-seller-3',
    sellerProfileId: 'slp-seller-3',
    email: 'hello@baltictransact.demo',
    companyName: 'Baltic Transact Brokers',
    contactName: 'Rasa Jankauskaite',
    country: 'LT',
    verified: true,
  },
  {
    userId: 'usr-seller-4',
    sellerProfileId: 'slp-seller-4',
    email: 'team@apexdealroom.demo',
    companyName: 'Apex Deal Room',
    contactName: 'Marco Ferreira',
    country: 'CY',
    verified: false,
  },
  {
    userId: 'usr-seller-5',
    sellerProfileId: 'slp-seller-5',
    email: 'contact@vertexcorporate.demo',
    companyName: 'Vertex Corporate Finance',
    contactName: 'Wei Chen',
    country: 'HK',
    verified: true,
  },
  {
    userId: 'usr-seller-6',
    sellerProfileId: 'slp-seller-6',
    email: 'ops@quicklicence.demo',
    companyName: 'QuickLicence Brokers',
    contactName: 'Samuel Osei',
    country: 'AE',
    verified: false,
    status: 'SUSPENDED',
  },
]

/**
 * 12 buyers with deliberately varied mandates:
 *  - `buyer@n5deal.demo` (#1): mid-breadth PE fund — matches several seeded
 *    assets at different bands, so recommendations show a spread of scores.
 *  - #2-#3: very narrow (single category, single country, tight ticket).
 *  - #4-#6: broad (empty arrays everywhere, unbounded ticket).
 *  - #7-#12: in between, each constraining 2-3 of the 5 match criteria.
 */
export const BUYERS: BuyerFixture[] = [
  {
    userId: 'usr-buyer-1',
    buyerProfileId: 'byp-buyer-1',
    email: DEMO_ACCOUNTS.buyer,
    displayName: 'Meridian Growth Partners',
    buyerType: 'PE_FUND',
    country: 'GB',
    bio: 'Lower-mid-market PE fund acquiring licensed European payments and e-money infrastructure.',
    verified: true,
    mandate: {
      categories: ['PAYMENT', 'EMI'],
      countries: ['MT', 'GB', 'LT', 'CY'],
      licenceTypes: ['PI', 'EMI'],
      businessStatuses: ['ACTIVE'],
      ticketMinCents: cents(1_000_000),
      ticketMaxCents: cents(6_000_000),
      timelineMonths: 6,
      notes:
        'Deploying into licensed EU/UK payments and e-money infrastructure; prefers operating businesses with completed regulatory migrations.',
    },
  },
  {
    userId: 'usr-buyer-2',
    buyerProfileId: 'byp-buyer-2',
    email: 'anna.petrova@narrowfund.demo',
    displayName: 'Petrova Family Office',
    buyerType: 'FAMILY_OFFICE',
    country: 'CH',
    bio: 'Single-family office making one concentrated bet on a licensed Asian crypto venue.',
    verified: true,
    mandate: {
      categories: ['CRYPTO'],
      countries: ['SG'],
      licenceTypes: ['CASP'],
      businessStatuses: ['ACTIVE'],
      ticketMinCents: cents(2_000_000),
      ticketMaxCents: cents(3_000_000),
      timelineMonths: 3,
      notes:
        'Only interested in a licensed Singapore CASP with an active client base; no interest in a dormant licence.',
    },
  },
  {
    userId: 'usr-buyer-3',
    buyerProfileId: 'byp-buyer-3',
    email: 'james.oduya@vaultbank.demo',
    displayName: 'VaultBank Strategic Holdings',
    buyerType: 'STRATEGIC',
    country: 'GB',
    bio: 'Challenger bank group seeking a single licence-only Maltese banking shell for a greenfield build-out.',
    verified: true,
    mandate: {
      categories: ['BANK'],
      countries: ['MT'],
      licenceTypes: ['Banking'],
      businessStatuses: ['LICENSE_ONLY'],
      ticketMinCents: cents(15_000_000),
      ticketMaxCents: cents(20_000_000),
      timelineMonths: 12,
      notes:
        'Seeking a licence-only Maltese banking shell; not interested in an existing loan book or client base.',
    },
  },
  {
    userId: 'usr-buyer-4',
    buyerProfileId: 'byp-buyer-4',
    email: 'operations@panoptic.demo',
    displayName: 'Panoptic Capital',
    buyerType: 'PE_FUND',
    country: 'US',
    bio: 'Sector-agnostic fund evaluating the full spectrum of licensed fintech opportunities across all major jurisdictions.',
    verified: true,
    mandate: {
      categories: [],
      countries: [],
      licenceTypes: [],
      businessStatuses: [],
      ticketMinCents: null,
      ticketMaxCents: null,
      timelineMonths: 18,
      notes: 'No fixed category, geography or business-status preference; evaluating opportunistically.',
    },
  },
  {
    userId: 'usr-buyer-5',
    buyerProfileId: 'byp-buyer-5',
    email: 'invest@openhorizon.demo',
    displayName: 'Open Horizon Partners',
    buyerType: 'PE_FUND',
    country: 'IE',
    bio: 'Generalist growth fund with a broad mandate across regulated financial infrastructure.',
    verified: false,
    mandate: {
      categories: [],
      countries: [],
      licenceTypes: [],
      businessStatuses: [],
      ticketMinCents: null,
      ticketMaxCents: null,
      timelineMonths: 9,
      notes: 'Open to any category, jurisdiction, or business status at the right multiple.',
    },
  },
  {
    userId: 'usr-buyer-6',
    buyerProfileId: 'byp-buyer-6',
    email: 'deals@novumstrategics.demo',
    displayName: 'Novum Strategics',
    buyerType: 'STRATEGIC',
    country: 'NL',
    bio: 'Corporate development team scanning the market for bolt-on regulatory capability.',
    verified: true,
    mandate: {
      categories: [],
      countries: [],
      licenceTypes: [],
      businessStatuses: [],
      ticketMinCents: null,
      ticketMaxCents: null,
      timelineMonths: 6,
      notes: 'Actively scanning the market with no fixed category or geography preference.',
    },
  },
  {
    userId: 'usr-buyer-7',
    buyerProfileId: 'byp-buyer-7',
    email: 'ingrid@balticpay.demo',
    displayName: 'Baltic Pay Ventures',
    buyerType: 'PE_FUND',
    country: 'LT',
    bio: 'Regional fund consolidating licensed payment institutions across the Baltics and Poland.',
    verified: true,
    mandate: {
      categories: ['PAYMENT', 'FINTECH'],
      countries: ['LT', 'EE', 'PL'],
      licenceTypes: ['PI', 'API'],
      businessStatuses: ['ACTIVE'],
      ticketMinCents: cents(500_000),
      ticketMaxCents: cents(2_500_000),
      timelineMonths: 9,
      notes: 'Consolidation play across the Baltic and Polish payments corridor.',
    },
  },
  {
    userId: 'usr-buyer-8',
    buyerProfileId: 'byp-buyer-8',
    email: 'marco.conti@alpineholdings.demo',
    displayName: 'Alpine Holdings',
    buyerType: 'FAMILY_OFFICE',
    country: 'CH',
    bio: 'Family office diversifying into Alpine and Benelux banking and e-money licences.',
    verified: true,
    mandate: {
      categories: ['EMI', 'BANK'],
      countries: ['CH', 'LU'],
      licenceTypes: ['EMI', 'Banking'],
      businessStatuses: ['ACTIVE', 'LICENSE_ONLY'],
      ticketMinCents: cents(5_000_000),
      ticketMaxCents: cents(15_000_000),
      timelineMonths: 12,
      notes: 'Comfortable with either an operating business or a clean licence-only shell.',
    },
  },
  {
    userId: 'usr-buyer-9',
    buyerProfileId: 'byp-buyer-9',
    email: 'sara.khalil@gulfnext.demo',
    displayName: 'GulfNext Capital',
    buyerType: 'STRATEGIC',
    country: 'AE',
    bio: 'Gulf-based payments group expanding into Asia and the Middle East via acquisition.',
    verified: true,
    mandate: {
      categories: ['PAYMENT'],
      countries: ['AE', 'HK', 'SG'],
      licenceTypes: ['PI', 'MSO'],
      businessStatuses: ['ACTIVE'],
      ticketMinCents: cents(1_000_000),
      ticketMaxCents: cents(4_000_000),
      timelineMonths: 6,
      notes: 'Expanding processing capacity across the GCC and Southeast Asia corridor.',
    },
  },
  {
    userId: 'usr-buyer-10',
    buyerProfileId: 'byp-buyer-10',
    email: 'tomasz@centraleuropefund.demo',
    displayName: 'Central Europe Growth Fund',
    buyerType: 'PE_FUND',
    country: 'PL',
    bio: 'Growth-stage fund backing fintech and payments platforms across Central Europe.',
    verified: false,
    mandate: {
      categories: ['FINTECH', 'PAYMENT'],
      countries: ['PL', 'LT', 'EE'],
      licenceTypes: [],
      businessStatuses: ['ACTIVE'],
      ticketMinCents: cents(300_000),
      ticketMaxCents: cents(1_800_000),
      timelineMonths: 4,
      notes: 'No licence-type preference; focused on Central European growth-stage platforms.',
    },
  },
  {
    userId: 'usr-buyer-11',
    buyerProfileId: 'byp-buyer-11',
    email: 'olivia@northseacap.demo',
    displayName: 'North Sea Capital',
    buyerType: 'INDIVIDUAL',
    country: 'GB',
    bio: 'Independent investor building a small portfolio of licensed crypto and fintech businesses.',
    verified: false,
    mandate: {
      categories: ['CRYPTO', 'FINTECH'],
      countries: [],
      licenceTypes: ['CASP'],
      businessStatuses: [],
      ticketMinCents: cents(2_000_000),
      ticketMaxCents: cents(8_000_000),
      timelineMonths: 8,
      notes: 'No jurisdiction or business-status preference; category and licence type matter most.',
    },
  },
  {
    userId: 'usr-buyer-12',
    buyerProfileId: 'byp-buyer-12',
    email: 'ravi.mehta@zenithpartners.demo',
    displayName: 'Zenith Partners',
    buyerType: 'PE_FUND',
    country: 'SG',
    bio: 'Asia-focused fund seeking an established, operating licence in a familiar jurisdiction.',
    verified: true,
    mandate: {
      categories: [],
      countries: ['SG', 'HK', 'AE'],
      licenceTypes: [],
      businessStatuses: ['ACTIVE'],
      ticketMinCents: cents(1_500_000),
      ticketMaxCents: cents(6_000_000),
      timelineMonths: 5,
      notes: 'No category or licence-type preference; jurisdiction and an operating business matter most.',
    },
  },
]

export const MANAGER = {
  userId: 'usr-manager-1',
  email: DEMO_ACCOUNTS.manager,
}
