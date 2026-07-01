import { PrismaClient, ProviderType, PartnerStatus, DocStatus } from "@prisma/client";
import { seedCustomerMarketplace } from "./seed-customer";
import { seedCrews } from "./seed-crew";
import { SERVICE_CATALOG as CUSTOMER_SERVICE_CATALOG } from "./seed-lib/service-catalog";

const prisma = new PrismaClient();

const services = [
  { slug: "electrician", name: "Electrician", archetype: ProviderType.CAPTAIN, tagline: "Fix wiring, install appliances, and more" },
  { slug: "plumber", name: "Plumber", archetype: ProviderType.CAPTAIN, tagline: "Resolve leaks, install fixtures, and pipe repairs" },
  { slug: "carpenter", name: "Carpenter", archetype: ProviderType.CAPTAIN, tagline: "Repair doors, locks, hinges and assemble furniture" },
  { slug: "ac-technician", name: "AC Technician", archetype: ProviderType.CAPTAIN, tagline: "Service, deep-clean, install and refill AC units" },
  { slug: "ro-technician", name: "RO Technician", archetype: ProviderType.CAPTAIN, tagline: "Service, install and replace RO purifier filters" },
  { slug: "facial-and-cleanup", name: "Facial & Cleanup", archetype: ProviderType.CAPTAIN, tagline: "At-home facial, cleanup and skin-care services" },
  { slug: "waxing-and-threading", name: "Waxing & Threading", archetype: ProviderType.CAPTAIN, tagline: "Waxing, threading and grooming appointments at home" },
  { slug: "hair-services", name: "Hair Services", archetype: ProviderType.CAPTAIN, tagline: "Hair cut, styling, spa and colour services" },
  { slug: "manicure-and-pedicure", name: "Manicure & Pedicure", archetype: ProviderType.CAPTAIN, tagline: "Hand, foot and nail-care services at home" },
  { slug: "makeup", name: "Makeup", archetype: ProviderType.CAPTAIN, tagline: "Party, bridal and occasion makeup services" },
  { slug: "home-cleaning", name: "Home Cleaning", archetype: ProviderType.CAPTAIN, tagline: "Basic, deep, kitchen and bathroom cleaning jobs" },
  { slug: "sofa-carpet-cleaning", name: "Sofa & Carpet Cleaning", archetype: ProviderType.CAPTAIN, tagline: "Deep cleaning for sofas, carpets and mattresses" },
  { slug: "pest-control", name: "Pest Control", archetype: ProviderType.CAPTAIN, tagline: "Pest, cockroach, termite and bed-bug treatments" },
  { slug: "laundry", name: "Laundry", archetype: ProviderType.CAPTAIN, tagline: "Wash, fold, dry-cleaning and ironing services" },
  { slug: "gardening", name: "Gardening", archetype: ProviderType.CAPTAIN, tagline: "Garden cleaning, lawn mowing and plant care" },
  { slug: "pet-grooming", name: "Pet Grooming", archetype: ProviderType.CAPTAIN, tagline: "Dog, cat, bath, spa and nail-care services" },
  { slug: "veterinary", name: "Veterinary", archetype: ProviderType.CAPTAIN, tagline: "At-home check-ups, vaccination and deworming" },
  { slug: "pet-walking-boarding", name: "Pet Walking & Boarding", archetype: ProviderType.CAPTAIN, tagline: "Dog walking, pet daycare and boarding services" },
  { slug: "driver", name: "Driver", archetype: ProviderType.DRIVER, tagline: "Provide reliable transportation" },
];

const cities = [
  { slug: "warangal", name: "Warangal" },
  { slug: "karimnagar", name: "Karimnagar" },
  { slug: "hyderabad", name: "Hyderabad" },
];

const skills = CUSTOMER_SERVICE_CATALOG.flatMap((category) =>
  category.subCategories.flatMap((subCategory) =>
    subCategory.services.map((service) => ({ slug: service.slug, name: service.name })),
  ),
);

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
  const switchRepair = await prisma.skill.findUnique({ where: { slug: "switch-socket-repair" } });
  const fanInstall = await prisma.skill.findUnique({ where: { slug: "fan-installation" } });

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
      // Dispatch-ready: online and geo-located near the demo customer address
      // (Gachibowli) so push-dispatch can find and offer jobs to this partner.
      isOnline: true,
      lat: 17.4401,
      lng: 78.3489,
      acceptanceRate: 94,
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
    await prisma.payoutDetail.deleteMany({ where: { partnerId: partner.id } });

    if (partner.status === PartnerStatus.ACTIVE && partner.providerType === ProviderType.CAPTAIN) {
      if (switchRepair) await prisma.partnerSkill.create({ data: { partnerId: partner.id, skillId: switchRepair.id } });
      if (fanInstall) await prisma.partnerSkill.create({ data: { partnerId: partner.id, skillId: fanInstall.id } });
      // A saved payout method so the withdraw flow is testable for the demo captain.
      await prisma.payoutDetail.create({
        data: { partnerId: partner.id, upiId: "raju@upi", accountLast4: "4321" },
      });
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

  // First admin portal login — allowlisted so magic-link sign-in is testable immediately.
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "dasari.soumith3088@gmail.com";
  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, role: "ADMIN" },
  });
  console.log(`Seeded admin user (${adminEmail}, role ADMIN).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
