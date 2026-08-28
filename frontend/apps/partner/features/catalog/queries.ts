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

/** Partner onboarding only surfaces main categories when the catalog publishes fewer than ten. */
const MAX_MAIN_CATEGORIES = 10;

export function visibleMainCategories(
  categories: readonly {
    id: string;
    slug: string;
    name: string;
    icon_key: string;
    image_url: string;
  }[],
): MainCategory[] {
  const ordered = categories.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
    iconKey: category.icon_key,
    imageUrl: category.image_url,
  }));

  if (ordered.length >= MAX_MAIN_CATEGORIES) {
    return ordered.slice(0, MAX_MAIN_CATEGORIES - 1);
  }
  return ordered;
}

export interface WorkCatalog {
  mainCategories: MainCategory[];
  services: OfferableService[];
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

  const details = await Promise.all(
    cards.flatMap(({ category, services }) =>
      services.map(async (service: Schemas["ServiceCard"]) => ({
        categoryName: category.name,
        detail: await request(() =>
          api.GET("/api/v1/services/{service_slug}/configuration/", {
            params: { path: { service_slug: service.slug } },
          }),
        ),
      })),
    ),
  );

  const mainCategories = visibleMainCategories(categories);
  const allowedCategoryNames = new Set(mainCategories.map((category) => category.name));

  const services: OfferableService[] = details.flatMap(({ categoryName, detail }) =>
    detail.variants.map((variant) => ({
      variantId: variant.id,
      variantCode: variant.code,
      variantName: variant.name,
      serviceName: detail.name,
      categoryName,
      requiredSkillCode: variant.required_skill_code,
    })),
  );

  return {
    mainCategories,
    services: services.filter((service) => allowedCategoryNames.has(service.categoryName)),
  };
});
