import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const services = await prisma.service.findMany({
    include: {
      category: true,
      subCategory: true
    }
  });

  console.log("Services list:");
  for (const s of services) {
    console.log(`- Name: ${s.name}, Slug: ${s.slug}, Category: ${s.category?.name} (${s.category?.slug}), SubCategory: ${s.subCategory?.name} (${s.subCategory?.slug})`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
