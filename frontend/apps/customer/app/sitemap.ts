import type { MetadataRoute } from "next";

import { getCategories, getCategoryServices } from "@/features/catalog/queries";
import { catalogCategoryHref, isCareerJobsCategory, LISTINGS_HREF, RENTALS_HREF, STAYS_HREF } from "@/lib/routes";
import { SITE_URL } from "@/lib/site";

/**
 * Sitemap for the public catalog.
 *
 * Generated from the API rather than a hand-maintained list, so a service
 * published in Operations is discoverable without a code change — and a service
 * that is withdrawn stops being advertised.
 *
 * Career/Jobs (A10) advertises `/listings`, not area-priced catalogue URLs.
 *
 * If the API is unreachable the sitemap degrades to the static routes instead of
 * failing the request. A 500 here teaches a crawler the sitemap is unreliable;
 * a short sitemap just means less was discovered on that fetch.
 */

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/catalog`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}${LISTINGS_HREF}`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${SITE_URL}${RENTALS_HREF}`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}${STAYS_HREF}`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/join-pro`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/refund-policy`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const categories = await getCategories();

    const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
      url: `${SITE_URL}${catalogCategoryHref(category.slug)}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

    const serviceLists = await Promise.all(
      categories.map(async (category) => {
        // A10 roles are not bookable service detail pages — one listings URL covers them.
        if (isCareerJobsCategory(category.slug)) return [];
        const services = (await getCategoryServices(category.slug)) ?? [];
        return services.map((service) => ({
          url: `${SITE_URL}/catalog/${category.slug}/${service.slug}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.7,
        }));
      }),
    );

    return [...staticRoutes, ...categoryRoutes, ...serviceLists.flat()];
  } catch {
    return staticRoutes;
  }
}
