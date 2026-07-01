// Production reference seed — the minimum data onboarding needs.
// NO demo partners, NO customer marketplace. Trades self-seed on first pick
// (see chooseService), so we only need cities (required in onboarding) + skills.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const cities = [
  { slug: "hyderabad", name: "Hyderabad" },
  { slug: "warangal", name: "Warangal" },
  { slug: "karimnagar", name: "Karimnagar" },
  { slug: "nizamabad", name: "Nizamabad" },
  { slug: "khammam", name: "Khammam" },
];

const skills = [
  { slug: "wiring", name: "Wiring & Fitting" },
  { slug: "appliance-install", name: "Appliance Installation" },
  { slug: "leak-repair", name: "Leak Repair" },
  { slug: "ac-service", name: "AC Service & Repair" },
  { slug: "ro-service", name: "RO Service & Repair" },
  { slug: "carpentry", name: "Carpentry" },
  { slug: "facial", name: "Facial & Skin Care" },
  { slug: "hair-styling", name: "Hair Styling" },
  { slug: "makeup", name: "Makeup" },
  { slug: "deep-cleaning", name: "Deep Cleaning" },
  { slug: "pest-control", name: "Pest Control" },
  { slug: "pet-grooming", name: "Pet Grooming" },
];

async function main() {
  for (const c of cities) {
    await prisma.city.upsert({ where: { slug: c.slug }, update: { name: c.name }, create: c });
  }
  for (const s of skills) {
    await prisma.skill.upsert({ where: { slug: s.slug }, update: { name: s.name }, create: s });
  }
  console.log(`Reference seed complete — ${cities.length} cities, ${skills.length} skills. No demo data.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
