import "server-only";

import { cache } from "react";
import { request } from "@vsolve/api-client";

import { createPublicApi } from "@/lib/api/public";

/**
 * The work an applicant can offer, read from the public catalog.
 *
 * `GET /api/v1/partner/skills/` publishes skill labels; this still needs
 * variant ids for the application PATCH. It used to fire one configuration
 * request per offerable service (hundreds), which was slow and sometimes
 * exceeded the 30s API client deadline (`ApiNetworkError` on `/apply/work`).
 *
 * Now: two requests — the categories, and `/partner-work-variants/` for every
 * offerable job type at once. Career/Jobs only publishes the hiring-partner row.
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

/**
 * Not trades on /apply/work. Stays and rentals are their own ways to join, picked on /apply (both
 * stays slugs: the older `rooms-pg-hostel` and the current `rooms-pg-hostel-hotels`). Crew and
 * project work is added after approval, under Specialist work.
 */
const NOT_A_TRADE = new Set([
  "rooms-pg-hostel",
  "rooms-pg-hostel-hotels",
  "rental-services",
  "workforce-and-projects",
]);

export function visibleMainCategories(
  categories: readonly {
    id: string;
    slug: string;
    name: string;
    icon_key: string;
    image_url: string;
  }[],
): MainCategory[] {
  return categories.filter((category) => !NOT_A_TRADE.has(category.slug)).map((category) => ({
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

export const getWorkCatalog = cache(async (): Promise<WorkCatalog> => {
  const api = createPublicApi(policy);
  // Two requests, in parallel: the category tiles, and every offerable job type at once.
  const [categories, variants] = await Promise.all([
    request(() => api.GET("/api/v1/categories/")),
    request(() => api.GET("/api/v1/partner-work-variants/")),
  ]);
  const mainCategories = visibleMainCategories(categories);
  const allowedCategoryNames = new Set(mainCategories.map((category) => category.name));

  const services: OfferableService[] = variants
    // Career/Jobs taxonomy has hundreds of A10 role variants. Partner apply
    // only offers the hiring-partner row (required_skill_code === career-jobs).
    .filter(
      (variant) =>
        variant.category_name !== "Career Opportunity or Job Opportunities" ||
        variant.required_skill_code === "career-jobs",
    )
    .map((variant) => ({
      variantId: variant.id,
      variantCode: variant.code,
      variantName: variant.name,
      serviceName: variant.service_name,
      categoryName: variant.category_name,
      requiredSkillCode: variant.required_skill_code,
    }));

  return {
    mainCategories,
    services: services.filter((service) => allowedCategoryNames.has(service.categoryName)),
  };
});
