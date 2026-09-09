import "server-only";

import { cache } from "react";
import { request, type Schemas } from "@vsolve/api-client";

import { createPublicApi } from "@/lib/api/public";

/**
 * The work an applicant can offer, read from the public catalog.
 *
 * There is no endpoint that lists Partner skills. `ServiceVariantConfiguration`
 * does publish `required_skill_code`, so the set of skills is derived from the
 * catalog rather than invented here — every code below is one Django itself
 * attached to a bookable service, and a skill nobody can be booked for is not a
 * skill worth offering.
 *
 * It costs one request per category plus one per service. That is acceptable
 * because it happens during server rendering, behind Next's Data Cache, on a
 * page an applicant visits once. A dedicated `GET /api/v1/partner/skills/` would
 * make it a single call — see proposal 0005.
 */

const CATALOG_REVALIDATE_SECONDS = 300;

const policy = { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["catalog"] };

export interface OfferableService {
  variantId: string;
  variantCode: string;
  variantName: string;
  serviceName: string;
  categoryName: string;
  subcategorySlug: string;
  subcategoryName: string;
  requiredSkillCode: string;
}

/** Top-level catalog category — same rows the customer app shows under Our Services. */
export interface MainCategory {
  id: string;
  slug: string;
  name: string;
  iconKey: string;
  imageUrl: string;
}

export function visibleMainCategories(
  categories: readonly {
    id: string;
    slug: string;
    name: string;
    icon_key: string;
    image_url: string;
  }[],
): MainCategory[] {
  return categories.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
    iconKey: category.icon_key,
    imageUrl: category.image_url,
  }));
}

export interface WorkCatalog {
  mainCategories: MainCategory[];
  services: OfferableService[];
}

function labelFromSubcategorySlug(slug: string): string {
  if (!slug) return "";
  return slug
    .split("-")
    .map((part) => (part.length <= 2 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

const CATALOG_DETAIL_CONCURRENCY = 6;

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export const getWorkCatalog = cache(async (): Promise<WorkCatalog> => {
  const api = createPublicApi(policy);
  const categories = await request(() => api.GET("/api/v1/categories/"));

  const cards = await Promise.all(
    categories.map(async (category) => ({
      category,
      services: await request(() =>
        api.GET("/api/v1/categories/{category_slug}/services/", {
          params: { path: { category_slug: category.slug } },
        }),
      ),
    })),
  );

  const jobs = cards.flatMap(({ category, services }) =>
    services.map((service: Schemas["ServiceCard"]) => ({
      categoryName: category.name,
      subcategorySlug: service.subcategory_slug ?? "",
      slug: service.slug,
    })),
  );

  const details = await mapPool(jobs, CATALOG_DETAIL_CONCURRENCY, async (job) => {
    try {
      const detail = await request(() =>
        api.GET("/api/v1/services/{service_slug}/", {
          params: { path: { service_slug: job.slug } },
        }),
      );
      return {
        categoryName: job.categoryName,
        subcategorySlug: job.subcategorySlug,
        detail,
      };
    } catch {
      return {
        categoryName: job.categoryName,
        subcategorySlug: job.subcategorySlug,
        detail: null,
      };
    }
  });

  const mainCategories = visibleMainCategories(categories);
  const allowedCategoryNames = new Set(mainCategories.map((category) => category.name));

  const services: OfferableService[] = details.flatMap(
    ({ categoryName, subcategorySlug, detail }) => {
      if (!detail) return [];
      const subcategoryName = labelFromSubcategorySlug(subcategorySlug);
      const taskVariants = (detail.variants ?? []).map((variant) => ({
        variantId: variant.id,
        variantCode: variant.code,
        variantName: variant.name,
        serviceName: detail.name,
        categoryName,
        subcategorySlug,
        subcategoryName,
        requiredSkillCode: variant.required_skill_code ?? "",
      }));
      const reqVariants = ((detail as any).requirement_variants ?? []).map((variant: any) => ({
        variantId: variant.id,
        variantCode: variant.code,
        variantName:
          variant.name && variant.name !== "Daily Rental"
            ? `${detail.name} (${variant.name})`
            : detail.name,
        serviceName: detail.name,
        categoryName,
        subcategorySlug,
        subcategoryName,
        requiredSkillCode: variant.required_skill_code ?? "",
      }));
      return [...taskVariants, ...reqVariants];
    },
  );

  return {
    mainCategories,
    services: services.filter((service) => allowedCategoryNames.has(service.categoryName)),
  };
});
