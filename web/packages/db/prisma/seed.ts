import { PrismaClient, ProviderType, PartnerStatus, DocStatus } from "@prisma/client";
import { seedCustomerMarketplace } from "./seed-customer";
import { seedCrews } from "./seed-crew";

const prisma = new PrismaClient();

const services = [
  { slug: "electrician", name: "Electrician", archetype: ProviderType.CAPTAIN, tagline: "Fix wiring, install appliances, and more" },
  { slug: "plumber", name: "Plumber", archetype: ProviderType.CAPTAIN, tagline: "Resolve leaks, install fixtures, and pipe repairs" },
  { slug: "driver", name: "Driver", archetype: ProviderType.DRIVER, tagline: "Provide reliable transportation" },
  { slug: "cleaning", name: "Home Cleaner", archetype: ProviderType.CLEANER, tagline: "Offer deep cleaning and regular maintenance" },
];

const cities = [
  { slug: "warangal", name: "Warangal" },
  { slug: "karimnagar", name: "Karimnagar" },
  { slug: "hyderabad", name: "Hyderabad" },
];

const skills = [
  { slug: "wiring", name: "Wiring & Fitting" },
  { slug: "appliance-install", name: "Appliance Installation" },
  { slug: "leak-repair", name: "Leak Repair" },
  { slug: "deep-cleaning", name: "Deep Cleaning" },
];

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600 * 1000);
}

async function main() {
  for (const s of services) await prisma.trade.upsert({ where: { slug: s.slug }, update: s, create: s });
  for (const c of cities) await prisma.city.upsert({ where: { slug: c.slug }, update: c, create: c });
  for (const sk of skills) await prisma.skill.upsert({ where: { slug: sk.slug }, update: sk, create: sk });

  const electrician = await prisma.trade.findUnique({ where: { slug: "electrician" } });
  const plumber = await prisma.trade.findUnique({ where: { slug: "plumber" } });
  const driverSvc = await prisma.trade.findUnique({ where: { slug: "driver" } });
  const warangal = await prisma.city.findUnique({ where: { slug: "warangal" } });
  const hyderabad = await prisma.city.findUnique({ where: { slug: "hyderabad" } });
  const wiring = await prisma.skill.findUnique({ where: { slug: "wiring" } });
  const appliance = await prisma.skill.findUnique({ where: { slug: "appliance-install" } });

  // Demo partners covering every dashboard state. Re-seedable (relations reset).
  const demos = [
    {
      phone: "+919000000001",
      fullName: "Raju K.",
      providerType: ProviderType.CAPTAIN,
      status: PartnerStatus.ACTIVE,
      tradeId: electrician?.id,
      cityId: warangal?.id,
      rating: 4.9,
      jobsCompleted: 128,
      onlineHours: 312,
      aadhaarLast4: "1234",
      onboardingStep: 99,
    },
    {
      phone: "+919000000002",
      fullName: "Sita M.",
      providerType: ProviderType.CAPTAIN,
      status: PartnerStatus.PENDING,
      tradeId: plumber?.id,
      cityId: hyderabad?.id,
      onboardingStep: 99,
    },
    {
      phone: "+919000000003",
      fullName: "Anil R.",
      providerType: ProviderType.CAPTAIN,
      status: PartnerStatus.ACTION_REQUIRED,
      tradeId: electrician?.id,
      cityId: warangal?.id,
      onboardingStep: 99,
    },
    {
      phone: "+919000000004",
      fullName: "Vijay D.",
      providerType: ProviderType.DRIVER,
      status: PartnerStatus.ACTIVE,
      tradeId: driverSvc?.id,
      cityId: hyderabad?.id,
      rating: 4.7,
      jobsCompleted: 540,
      onlineHours: 880,
      aadhaarLast4: "9087",
      onboardingStep: 99,
    },
  ];

  for (const d of demos) {
    const partner = await prisma.partner.upsert({
      where: { phone: d.phone },
      update: { ...d, phoneVerified: true },
      create: { ...d, phoneVerified: true },
    });

    // Reset relations for idempotency.
    await prisma.earningRecord.deleteMany({ where: { partnerId: partner.id } });
    await prisma.document.deleteMany({ where: { partnerId: partner.id } });
    await prisma.trip.deleteMany({ where: { partnerId: partner.id } });
    await prisma.partnerSkill.deleteMany({ where: { partnerId: partner.id } });
    await prisma.vehicle.deleteMany({ where: { partnerId: partner.id } });

    if (partner.status === PartnerStatus.ACTIVE && partner.providerType === ProviderType.CAPTAIN) {
      if (wiring) await prisma.partnerSkill.create({ data: { partnerId: partner.id, skillId: wiring.id } });
      if (appliance) await prisma.partnerSkill.create({ data: { partnerId: partner.id, skillId: appliance.id } });
      await prisma.earningRecord.createMany({
        data: [
          { partnerId: partner.id, ref: "VSH-1234", amount: 450, createdAt: hoursAgo(2) },
          { partnerId: partner.id, ref: "VSH-1231", amount: 850, createdAt: hoursAgo(5) },
          { partnerId: partner.id, ref: "VSH-1228", amount: 320, createdAt: hoursAgo(28) },
          { partnerId: partner.id, ref: "VSH-1225", amount: 1200, createdAt: hoursAgo(30) },
          { partnerId: partner.id, ref: "VSH-1219", amount: 600, createdAt: hoursAgo(74) },
        ],
      });
      await prisma.document.createMany({
        data: [
          { partnerId: partner.id, type: "SELFIE", url: "/placeholder.svg", status: DocStatus.APPROVED },
          { partnerId: partner.id, type: "AADHAAR", url: "/placeholder.svg", status: DocStatus.APPROVED },
          { partnerId: partner.id, type: "TRADE_CERTIFICATE", url: "/placeholder.svg", status: DocStatus.APPROVED },
          { partnerId: partner.id, type: "BANK_PASSBOOK", url: "/placeholder.svg", status: DocStatus.APPROVED },
        ],
      });
    }

    if (partner.status === PartnerStatus.ACTION_REQUIRED) {
      await prisma.document.createMany({
        data: [
          { partnerId: partner.id, type: "SELFIE", url: "/placeholder.svg", status: DocStatus.APPROVED },
          { partnerId: partner.id, type: "AADHAAR", url: "/placeholder.svg", status: DocStatus.APPROVED },
          {
            partnerId: partner.id,
            type: "TRADE_CERTIFICATE",
            url: "/placeholder.svg",
            status: DocStatus.REJECTED,
            reason: "Image is blurry — please re-upload a clear copy.",
          },
        ],
      });
    }

    if (partner.status === PartnerStatus.PENDING) {
      await prisma.document.createMany({
        data: [
          { partnerId: partner.id, type: "SELFIE", url: "/placeholder.svg", status: DocStatus.PENDING },
          { partnerId: partner.id, type: "AADHAAR", url: "/placeholder.svg", status: DocStatus.PENDING },
        ],
      });
    }

    if (partner.providerType === ProviderType.DRIVER && partner.status === PartnerStatus.ACTIVE) {
      await prisma.vehicle.create({
        data: { partnerId: partner.id, type: "AUTO", make: "Bajaj", model: "RE", regNumber: "TS09 AB 1234", rcUrl: "/placeholder.svg" },
      });
      await prisma.document.createMany({
        data: [
          { partnerId: partner.id, type: "AADHAAR", url: "/placeholder.svg", status: DocStatus.APPROVED },
          { partnerId: partner.id, type: "DRIVING_LICENCE", url: "/placeholder.svg", status: DocStatus.APPROVED },
          { partnerId: partner.id, type: "RC", url: "/placeholder.svg", status: DocStatus.APPROVED },
        ],
      });
      await prisma.earningRecord.createMany({
        data: [
          { partnerId: partner.id, ref: "VSH-2210", amount: 180, createdAt: hoursAgo(1) },
          { partnerId: partner.id, ref: "VSH-2205", amount: 240, createdAt: hoursAgo(4) },
          { partnerId: partner.id, ref: "VSH-2201", amount: 95, createdAt: hoursAgo(26) },
        ],
      });
      await prisma.trip.createMany({
        data: [
          { partnerId: partner.id, ref: "VSH-2210", fromArea: "Hanamkonda", toArea: "Kazipet", fare: 180, createdAt: hoursAgo(1) },
          { partnerId: partner.id, ref: "VSH-2205", fromArea: "Warangal Fort", toArea: "Hanamkonda", fare: 240, createdAt: hoursAgo(4) },
          { partnerId: partner.id, ref: "VSH-2201", fromArea: "Kazipet", toArea: "Station", fare: 95, createdAt: hoursAgo(26) },
        ],
      });
    }
  }

  console.log("Seeded trades, cities, skills, and demo partners (active/pending/action-required/driver).");
  await seedCustomerMarketplace(prisma);
  await seedCrews(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
