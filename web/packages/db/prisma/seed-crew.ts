import { PrismaClient, ProviderType, PartnerStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";

type MemberSpec = { role: string; count: number; dayRatePaise: number; skillLevel?: string };

const CREWS: {
  phone: string;
  leadName: string;
  crewName: string;
  tradeSlug: string;
  rating: number;
  reviewCount: number;
  equipment: string[];
  members: MemberSpec[];
}[] = [
  // ── Electrical crews (lead logins the demo uses) ──
  {
    phone: "+919000000011",
    leadName: "Raju",
    crewName: "Raju Electricals",
    tradeSlug: "electrician",
    rating: 4.9,
    reviewCount: 128,
    equipment: ["Cable tester", "Drilling machine", "Safety gear"],
    // Premium rate card.
    members: [
      { role: "supervisor", count: 1, dayRatePaise: 200000, skillLevel: "lead" },
      { role: "electrician", count: 3, dayRatePaise: 160000 },
      { role: "wireman", count: 3, dayRatePaise: 140000 },
      { role: "helper", count: 4, dayRatePaise: 90000, skillLevel: "helper" },
    ],
  },
  {
    phone: "+919000000012",
    leadName: "Sai",
    crewName: "Sai Power Works",
    tradeSlug: "electrician",
    rating: 4.8,
    reviewCount: 96,
    equipment: ["Multimeter", "Conduit bender", "Safety gear"],
    // Value rate card — cheaper, so quotes differ.
    members: [
      { role: "supervisor", count: 1, dayRatePaise: 170000, skillLevel: "lead" },
      { role: "electrician", count: 2, dayRatePaise: 140000 },
      { role: "wireman", count: 2, dayRatePaise: 120000 },
      { role: "helper", count: 3, dayRatePaise: 75000, skillLevel: "helper" },
    ],
  },
  // ── Construction crews ──
  {
    phone: "+919000000013",
    leadName: "Raju Contractor",
    crewName: "Raju Construction Crew",
    tradeSlug: "construction",
    rating: 4.9,
    reviewCount: 132,
    equipment: ["Concrete mixer", "Scaffolding", "Safety gear"],
    members: [
      { role: "supervisor", count: 1, dayRatePaise: 180000, skillLevel: "lead" },
      { role: "mason", count: 3, dayRatePaise: 120000 },
      { role: "helper", count: 4, dayRatePaise: 80000, skillLevel: "helper" },
      { role: "bar-bender", count: 2, dayRatePaise: 110000 },
      { role: "carpenter", count: 1, dayRatePaise: 130000 },
    ],
  },
  {
    phone: "+919000000014",
    leadName: "Sai Reddy",
    crewName: "Sai Civil Works",
    tradeSlug: "construction",
    rating: 4.8,
    reviewCount: 96,
    equipment: ["Vibrator", "Cutting machine", "Safety gear"],
    members: [
      { role: "mason", count: 2, dayRatePaise: 120000 },
      { role: "helper", count: 3, dayRatePaise: 80000, skillLevel: "helper" },
      { role: "bar-bender", count: 2, dayRatePaise: 110000 },
      { role: "carpenter", count: 1, dayRatePaise: 130000 },
    ],
  },
];

export async function seedCrews(prisma: PrismaClient) {
  const hyderabad = await prisma.city.findUnique({ where: { slug: "hyderabad" } });

  for (const c of CREWS) {
    const lead = await prisma.partner.upsert({
      where: { phone: c.phone },
      update: {
        fullName: c.leadName,
        status: PartnerStatus.ACTIVE,
        providerType: ProviderType.CAPTAIN,
        phoneVerified: true,
        onboardingStep: 99,
      },
      create: {
        phone: c.phone,
        fullName: c.leadName,
        status: PartnerStatus.ACTIVE,
        providerType: ProviderType.CAPTAIN,
        cityId: hyderabad?.id,
        phoneVerified: true,
        onboardingStep: 99,
      },
    });

    const crew = await prisma.crew.upsert({
      where: { leadPartnerId: lead.id },
      update: {
        name: c.crewName,
        tradeSlug: c.tradeSlug,
        rating: c.rating,
        reviewCount: c.reviewCount,
        status: "ACTIVE",
        equipment: JSON.stringify(c.equipment),
      },
      create: {
        leadPartnerId: lead.id,
        name: c.crewName,
        tradeSlug: c.tradeSlug,
        city: "Hyderabad",
        rating: c.rating,
        reviewCount: c.reviewCount,
        status: "ACTIVE",
        equipment: JSON.stringify(c.equipment),
      },
    });

    // Re-seedable: rebuild the roster each run.
    await prisma.crewMember.deleteMany({ where: { crewId: crew.id } });
    const rows = c.members.flatMap((m) =>
      Array.from({ length: m.count }, (_, i) => ({
        crewId: crew.id,
        name: `${m.role.charAt(0).toUpperCase() + m.role.slice(1).replace(/-/g, " ")} ${i + 1}`,
        role: m.role,
        skillLevel: m.skillLevel ?? "skilled",
        dayRatePaise: m.dayRatePaise,
        inviteToken: randomBytes(18).toString("base64url"),
        status: "ACTIVE" as const,
        joinedAt: new Date(),
      })),
    );
    await prisma.crewMember.createMany({ data: rows });

    // Publish a per-role rate card (drives "Receive Quotes" pricing).
    await prisma.crewRoleRate.deleteMany({ where: { crewId: crew.id } });
    const seen = new Set<string>();
    const rateRows = c.members
      .filter((m) => !seen.has(m.role) && seen.add(m.role))
      .map((m) => ({ crewId: crew.id, role: m.role, dayRatePaise: m.dayRatePaise }));
    await prisma.crewRoleRate.createMany({ data: rateRows });
  }

  console.log(`Seeded ${CREWS.length} active crews (electrical + construction) with rate cards.`);
}
