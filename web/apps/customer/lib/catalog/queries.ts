import { prisma } from "@/lib/db/client";
import type { Prisma } from "@vsolve/db";

const serviceInclude = {
  category: true,
  subCategory: true,
} satisfies Prisma.ServiceInclude;

export { serviceInclude };

export type ServiceWithRelations = Prisma.ServiceGetPayload<{
  include: typeof serviceInclude;
}>;

export function parseTags(tags: string): string[] {
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function serializeService(service: ServiceWithRelations) {
  return {
    id: service.id,
    name: service.name,
    slug: service.slug,
    description: service.description,
    pricePaise: service.pricePaise,
    duration: service.duration,
    archetype: service.archetype,
    unit: service.unit,
    tags: parseTags(service.tags),
    category: {
      id: service.category.id,
      name: service.category.name,
      slug: service.category.slug,
      icon: service.category.icon,
      tagline: service.category.tagline,
    },
    subCategory: service.subCategory
      ? {
          id: service.subCategory.id,
          name: service.subCategory.name,
          slug: service.subCategory.slug,
        }
      : null,
  };
}

export async function getCategories() {
  return prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      subCategories: { orderBy: { sortOrder: "asc" } },
      _count: { select: { services: true } },
    },
  });
}

export async function getCatalogGrouped() {
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      subCategories: {
        orderBy: { sortOrder: "asc" },
        include: {
          services: {
            include: serviceInclude,
            orderBy: { name: "asc" },
          },
        },
      },
      services: {
        where: { subCategoryId: null },
        include: serviceInclude,
        orderBy: { name: "asc" },
      },
    },
  });

  return categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    tagline: cat.tagline,
    icon: cat.icon,
    subCategories: cat.subCategories.map((sub) => ({
      id: sub.id,
      name: sub.name,
      slug: sub.slug,
      services: sub.services.map(serializeService),
    })),
    services: cat.services.map(serializeService),
  }));
}

export async function getAllServices() {
  const services = await prisma.service.findMany({
    include: serviceInclude,
    orderBy: { name: "asc" },
  });
  return services.map(serializeService);
}

export async function getPopularServices(limit = 8) {
  const services = await prisma.service.findMany({
    include: serviceInclude,
    take: limit,
    orderBy: { name: "asc" },
  });
  return services.map(serializeService);
}

export async function getServiceBySlug(categorySlug: string, serviceSlug: string) {
  const service = await prisma.service.findFirst({
    where: {
      slug: serviceSlug,
      category: { slug: categorySlug },
    },
    include: serviceInclude,
  });
  return service ? serializeService(service) : null;
}

export async function getServicesByCategory(categorySlug: string) {
  const services = await prisma.service.findMany({
    where: { category: { slug: categorySlug } },
    include: serviceInclude,
    orderBy: { name: "asc" },
  });
  return services.map(serializeService);
}

export async function searchServices(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return getAllServices();

  const services = await prisma.service.findMany({
    include: serviceInclude,
    where: {
      OR: [
        { name: { contains: q } },
        { description: { contains: q } },
        { tags: { contains: q } },
        { category: { name: { contains: q } } },
        { subCategory: { name: { contains: q } } },
      ],
    },
    orderBy: { name: "asc" },
  });

  return services.map(serializeService);
}

export async function getServicesByIds(ids: string[]) {
  if (!ids.length) return [];
  const services = await prisma.service.findMany({
    where: { id: { in: ids } },
    include: serviceInclude,
  });
  const order = new Map(ids.map((id, i) => [id, i]));
  return services
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map(serializeService);
}
