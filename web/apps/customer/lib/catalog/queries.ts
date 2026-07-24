import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/client";
import type { Prisma } from "@vsolve/db";

// The service catalog is effectively static (it only changes when admin edits the
// catalog). Cache these reads across requests and tag them "catalog" so a future
// admin mutation can `revalidateTag("catalog")` to bust them. Per-user/dynamic
// reads (bookings, session, search) are intentionally NOT cached here.
const CATALOG_REVALIDATE_SECONDS = 3600;
// Preserve the wrapped function's exact signature (generic over the whole callable)
// so callers keep full type inference through the cache boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function catalogCache<T extends (...args: any[]) => Promise<unknown>>(fn: T, key: string): T {
  return unstable_cache(fn, [key], {
    tags: ["catalog"],
    revalidate: CATALOG_REVALIDATE_SECONDS,
  }) as unknown as T;
}

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
    imageUrl: service.imageUrl,
    category: {
      id: service.category.id,
      name: service.category.name,
      slug: service.category.slug,
      icon: service.category.icon,
      tagline: service.category.tagline,
      imageUrl: service.category.imageUrl,
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

export const getCategories = catalogCache(async () => {
  return prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      subCategories: { orderBy: { sortOrder: "asc" } },
      _count: { select: { services: true } },
    },
  });
}, "categories");

export const getCatalogGrouped = catalogCache(async () => {
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
      imageUrl: sub.imageUrl,
      services: sub.services.map(serializeService),
    })),
    services: cat.services.map(serializeService),
  }));
}, "catalog-grouped");

export const getAllServices = catalogCache(async () => {
  const services = await prisma.service.findMany({
    include: serviceInclude,
    orderBy: { name: "asc" },
  });
  return services.map(serializeService);
}, "all-services");

export const getPopularServices = catalogCache(async (limit = 8) => {
  const services = await prisma.service.findMany({
    include: serviceInclude,
    take: limit,
    orderBy: { name: "asc" },
  });
  return services.map(serializeService);
}, "popular-services");

export const getServiceBySlug = catalogCache(async (categorySlug: string, serviceSlug: string) => {
  const service = await prisma.service.findFirst({
    where: {
      slug: serviceSlug,
      category: { slug: categorySlug },
    },
    include: serviceInclude,
  });
  return service ? serializeService(service) : null;
}, "service-by-slug");

export const getServicesByCategory = catalogCache(async (categorySlug: string) => {
  const services = await prisma.service.findMany({
    where: { category: { slug: categorySlug } },
    include: serviceInclude,
    orderBy: { name: "asc" },
  });
  return services.map(serializeService);
}, "services-by-category");

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

export type ServiceReviewItem = {
  id: string;
  name: string;
  location: string;
  rating: number;
  text: string;
  createdAt: Date;
};

export type ServiceReviews = {
  average: number;
  count: number;
  items: ServiceReviewItem[];
};

/**
 * Real customer reviews for a service, drawn from completed bookings — never
 * placeholder data. `average`/`count` aggregate every rated booking; `items`
 * are the most recent ones that also left written feedback. NOT cached: reviews
 * change as jobs complete and should read fresh.
 */
export async function getServiceReviews(serviceId: string, take = 6): Promise<ServiceReviews> {
  const [agg, rows] = await Promise.all([
    prisma.booking.aggregate({
      where: { serviceId, rating: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    prisma.booking.findMany({
      where: { serviceId, rating: { not: null }, review: { not: null } },
      select: {
        id: true,
        rating: true,
        review: true,
        createdAt: true,
        user: { select: { name: true } },
        address: { select: { area: true, city: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
  ]);

  return {
    average: agg._avg.rating ?? 0,
    count: agg._count.rating ?? 0,
    items: rows
      .filter((r) => (r.review ?? "").trim().length > 0)
      .map((r) => ({
        id: r.id,
        name: r.user?.name?.trim() || "Verified customer",
        location: r.address?.area || r.address?.city || "",
        rating: r.rating ?? 5,
        text: (r.review ?? "").trim(),
        createdAt: r.createdAt,
      })),
  };
}

export const getAppStories = catalogCache(async () => {
  const stories = await prisma.appStory.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return stories.map(s => ({
    ...s,
    slides: JSON.parse(s.slidesJson),
  }));
}, "app-stories");

export const getAppPromos = catalogCache(async () => {
  return prisma.appPromo.findMany({
    orderBy: { sortOrder: "asc" },
  });
}, "app-promos");
