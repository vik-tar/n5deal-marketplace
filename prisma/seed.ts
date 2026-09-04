import { hash } from 'bcryptjs'
import { prisma } from '@/server/db'
import { buildThreadKey } from '@/lib/thread-key'
import { ASSETS } from './seed-data/assets'
import { BUYERS, DEMO_ACCOUNTS, DEMO_PASSWORD, MANAGER, SELLERS } from './seed-data/participants'

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000)
}

function findBuyer(email: string) {
  const buyer = BUYERS.find((b) => b.email === email)
  if (!buyer) throw new Error(`Seed data error: no buyer fixture for ${email}`)
  return buyer
}

function findSeller(email: string) {
  const seller = SELLERS.find((s) => s.email === email)
  if (!seller) throw new Error(`Seed data error: no seller fixture for ${email}`)
  return seller
}

interface MessageSeed {
  senderUserId: string
  body: string
  createdAt: Date
  readAt: Date | null
}

async function createConversation(params: {
  assetId: string | null
  buyerProfileId: string
  sellerProfileId: string
  messages: MessageSeed[]
}): Promise<void> {
  const { assetId, buyerProfileId, sellerProfileId, messages } = params
  const createdAt = messages[0]?.createdAt
  const lastMessageAt = messages[messages.length - 1]?.createdAt
  if (!createdAt || !lastMessageAt) {
    throw new Error('Seed data error: a conversation needs at least one message')
  }
  await prisma.conversation.create({
    data: {
      threadKey: buildThreadKey({ assetId, buyerProfileId, sellerProfileId }),
      assetId,
      buyerProfileId,
      sellerProfileId,
      createdAt,
      lastMessageAt,
      messages: { create: messages },
    },
  })
}

async function main(): Promise<void> {
  console.log('Seeding N5Deal demo data...')

  // 1. Delete in reverse dependency order so the seed is re-runnable.
  await prisma.message.deleteMany()
  await prisma.conversation.deleteMany()
  await prisma.favorite.deleteMany()
  await prisma.accessRequest.deleteMany()
  await prisma.moderationLog.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.mandate.deleteMany()
  await prisma.buyerProfile.deleteMany()
  await prisma.sellerProfile.deleteMany()
  await prisma.user.deleteMany()

  // 2. Hash the shared demo password once and reuse it for every account.
  const passwordHash = await hash(DEMO_PASSWORD, 10)

  // 3. Users + profiles + mandates.
  for (const seller of SELLERS) {
    await prisma.user.create({
      data: {
        id: seller.userId,
        email: seller.email,
        passwordHash,
        role: 'SELLER',
        status: seller.status ?? 'ACTIVE',
        sellerProfile: {
          create: {
            id: seller.sellerProfileId,
            companyName: seller.companyName,
            contactName: seller.contactName,
            country: seller.country,
            verified: seller.verified,
          },
        },
      },
    })
  }

  for (const buyer of BUYERS) {
    await prisma.user.create({
      data: {
        id: buyer.userId,
        email: buyer.email,
        passwordHash,
        role: 'BUYER',
        status: 'ACTIVE',
        buyerProfile: {
          create: {
            id: buyer.buyerProfileId,
            displayName: buyer.displayName,
            buyerType: buyer.buyerType,
            country: buyer.country,
            bio: buyer.bio,
            verified: buyer.verified,
            mandate: {
              create: {
                categories: buyer.mandate.categories,
                countries: buyer.mandate.countries,
                licenceTypes: buyer.mandate.licenceTypes,
                businessStatuses: buyer.mandate.businessStatuses,
                ticketMinCents: buyer.mandate.ticketMinCents,
                ticketMaxCents: buyer.mandate.ticketMaxCents,
                timelineMonths: buyer.mandate.timelineMonths,
                notes: buyer.mandate.notes,
              },
            },
          },
        },
      },
    })
  }

  await prisma.user.create({
    data: {
      id: MANAGER.userId,
      email: MANAGER.email,
      passwordHash,
      role: 'MANAGER',
      status: 'ACTIVE',
    },
  })

  // 4. Assets, round-robin across the active sellers (see sellerEmailFor in
  // seed-data/assets.ts), with the suspended seller owning exactly one.
  const sellerProfileIdByEmail = new Map(SELLERS.map((s) => [s.email, s.sellerProfileId]))
  for (const asset of ASSETS) {
    const sellerProfileId = sellerProfileIdByEmail.get(asset.sellerEmail)
    if (!sellerProfileId) {
      throw new Error(`Seed data error: no seller found for email ${asset.sellerEmail}`)
    }
    await prisma.asset.create({
      data: {
        id: asset.id,
        sellerProfileId,
        publicRef: asset.publicRef,
        status: asset.status,
        category: asset.category,
        licenceType: asset.licenceType,
        businessType: asset.businessType,
        country: asset.country,
        regulator: asset.regulator,
        businessStatus: asset.businessStatus,
        askingPriceCents: asset.askingPriceCents,
        employees: asset.employees,
        yearOfIssue: asset.yearOfIssue,
        included: asset.included,
        teaserTitle: asset.teaserTitle,
        teaserDescription: asset.teaserDescription,
        legalName: asset.legalName,
        revenueCents: asset.revenueCents,
        ebitdaCents: asset.ebitdaCents,
        clientCount: asset.clientCount,
        dataRoomUrl: asset.dataRoomUrl,
        confidentialNotes: asset.confidentialNotes,
        publishedAt: asset.publishedAt,
        rejectionReason: asset.rejectionReason,
        viewCount: asset.viewCount,
      },
    })
  }

  // 5. Access requests covering every status.
  await prisma.accessRequest.createMany({
    data: [
      // 3 APPROVED, one of them for buyer@n5deal.demo.
      {
        assetId: 'asset-702',
        buyerProfileId: findBuyer(DEMO_ACCOUNTS.buyer).buyerProfileId,
        status: 'APPROVED',
        message: 'Interested in the safeguarding and IBAN issuance setup — could we get access to the data room?',
        requestedAt: hoursAgo(96),
        decidedAt: hoursAgo(72),
        decidedByUserId: findSeller('contact@harboradvisory.demo').userId,
      },
      {
        assetId: 'asset-703',
        buyerProfileId: findBuyer('ingrid@balticpay.demo').buyerProfileId,
        status: 'APPROVED',
        message: 'Fits our Baltic consolidation thesis well; requesting access ahead of an indicative offer.',
        requestedAt: hoursAgo(120),
        decidedAt: hoursAgo(100),
        decidedByUserId: findSeller('hello@baltictransact.demo').userId,
      },
      {
        assetId: 'asset-710',
        buyerProfileId: findBuyer('sara.khalil@gulfnext.demo').buyerProfileId,
        status: 'APPROVED',
        message: 'Reviewing as part of our GCC/APAC processing expansion.',
        requestedAt: hoursAgo(150),
        decidedAt: hoursAgo(130),
        decidedByUserId: findSeller('contact@vertexcorporate.demo').userId,
      },
      // 2 REQUESTED against seller@n5deal.demo's listings.
      {
        assetId: 'asset-701',
        buyerProfileId: findBuyer('anna.petrova@narrowfund.demo').buyerProfileId,
        status: 'REQUESTED',
        message: 'Would like to review before committing our ticket elsewhere.',
        requestedAt: hoursAgo(20),
      },
      {
        assetId: 'asset-706',
        buyerProfileId: findBuyer('james.oduya@vaultbank.demo').buyerProfileId,
        status: 'REQUESTED',
        message: 'Keen to move quickly if the licence transfer timeline works for us.',
        requestedAt: hoursAgo(10),
      },
      // 1 DECLINED.
      {
        assetId: 'asset-704',
        buyerProfileId: findBuyer('operations@panoptic.demo').buyerProfileId,
        status: 'DECLINED',
        message: 'Broad interest — happy to discuss even without a specific thesis yet.',
        requestedAt: hoursAgo(200),
        decidedAt: hoursAgo(190),
        decidedByUserId: findSeller('team@apexdealroom.demo').userId,
      },
      // 1 REVOKED.
      {
        assetId: 'asset-705',
        buyerProfileId: findBuyer('invest@openhorizon.demo').buyerProfileId,
        status: 'REVOKED',
        message: 'Reviewing as part of a broader sweep of the market.',
        requestedAt: hoursAgo(400),
        decidedAt: hoursAgo(30),
        decidedByUserId: findSeller('contact@vertexcorporate.demo').userId,
      },
    ],
  })

  // 6. 4 conversations: two with an unread message addressed to
  // buyer@n5deal.demo, two addressed to seller@n5deal.demo.
  const demoBuyer = findBuyer(DEMO_ACCOUNTS.buyer)
  const demoSeller = findSeller(DEMO_ACCOUNTS.seller)
  const harborSeller = findSeller('contact@harboradvisory.demo')
  const vertexSeller = findSeller('contact@vertexcorporate.demo')
  const narrowCryptoBuyer = findBuyer('anna.petrova@narrowfund.demo')
  const narrowBankBuyer = findBuyer('james.oduya@vaultbank.demo')

  await createConversation({
    assetId: 'asset-702',
    buyerProfileId: demoBuyer.buyerProfileId,
    sellerProfileId: harborSeller.sellerProfileId,
    messages: [
      {
        senderUserId: demoBuyer.userId,
        body: 'Thanks for approving access — could you share more detail on the safeguarding arrangements?',
        createdAt: hoursAgo(70),
        readAt: hoursAgo(69),
      },
      {
        senderUserId: harborSeller.userId,
        body: 'Good question — the safeguarding trust holds 100% of e-money float with a tier-one custodian bank; happy to arrange a call this week.',
        createdAt: hoursAgo(50),
        readAt: null, // unread by buyer@n5deal.demo
      },
    ],
  })

  await createConversation({
    assetId: null,
    buyerProfileId: demoBuyer.buyerProfileId,
    sellerProfileId: vertexSeller.sellerProfileId,
    messages: [
      {
        senderUserId: vertexSeller.userId,
        body: 'Hi — based on your mandate we have a Hong Kong-licensed payment institution that may interest you ahead of it going live on the marketplace. Keen to discuss?',
        createdAt: hoursAgo(30),
        readAt: null, // unread by buyer@n5deal.demo
      },
    ],
  })

  await createConversation({
    assetId: 'asset-701',
    buyerProfileId: narrowCryptoBuyer.buyerProfileId,
    sellerProfileId: demoSeller.sellerProfileId,
    messages: [
      {
        senderUserId: narrowCryptoBuyer.userId,
        body: 'Hi, I have requested access to N5-701 — is there any flexibility on ticket size if the deal structure works?',
        createdAt: hoursAgo(19),
        readAt: null, // unread by seller@n5deal.demo
      },
    ],
  })

  await createConversation({
    assetId: 'asset-706',
    buyerProfileId: narrowBankBuyer.buyerProfileId,
    sellerProfileId: demoSeller.sellerProfileId,
    messages: [
      {
        senderUserId: narrowBankBuyer.userId,
        body: 'Following up on my access request for N5-706 — keen to move quickly if the licence transfer timeline works.',
        createdAt: hoursAgo(9),
        readAt: null, // unread by seller@n5deal.demo
      },
    ],
  })

  // 7. Moderation log rows explaining the pre-suspended seller.
  const suspendedSeller = SELLERS.find((s) => s.status === 'SUSPENDED')
  if (!suspendedSeller) throw new Error('Seed data error: no suspended seller fixture')

  await prisma.moderationLog.createMany({
    data: [
      {
        actorUserId: MANAGER.userId,
        action: 'REJECT_LISTING',
        targetType: 'ASSET',
        targetId: 'asset-735',
        reason:
          'Initial submission rejected: teaser named an exact merchant transaction volume; seller was asked to anonymise before resubmission.',
        createdAt: hoursAgo(500),
      },
      {
        actorUserId: MANAGER.userId,
        action: 'SUSPEND',
        targetType: 'USER',
        targetId: suspendedSeller.userId,
        reason:
          'Account suspended: seller missed the NDA-response SLA on three consecutive requests and misrepresented a licence renewal status to a buyer.',
        createdAt: hoursAgo(48),
      },
    ],
  })

  // 8. Summary.
  const [
    userCount,
    buyerProfileCount,
    sellerProfileCount,
    mandateCount,
    assetCount,
    accessRequestCount,
    conversationCount,
    messageCount,
    moderationLogCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.buyerProfile.count(),
    prisma.sellerProfile.count(),
    prisma.mandate.count(),
    prisma.asset.count(),
    prisma.accessRequest.count(),
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.moderationLog.count(),
  ])

  console.log('Seed complete:')
  console.log(`  users:          ${userCount}`)
  console.log(`  buyerProfiles:  ${buyerProfileCount}`)
  console.log(`  sellerProfiles: ${sellerProfileCount}`)
  console.log(`  mandates:       ${mandateCount}`)
  console.log(`  assets:         ${assetCount}`)
  console.log(`  accessRequests: ${accessRequestCount}`)
  console.log(`  conversations:  ${conversationCount}`)
  console.log(`  messages:       ${messageCount}`)
  console.log(`  moderationLogs: ${moderationLogCount}`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
