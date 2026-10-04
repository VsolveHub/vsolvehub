import "server-only";

import { cache } from "react";
import { request, type Schemas } from "@vsolve/api-client";

import { createPublicApi } from "@/lib/api/public";

/**
 * The work an applicant can offer, read from the public catalog.
 *
 * `GET /api/v1/partner/skills/` publishes skill labels; this walk still needs
 * variant ids for the application PATCH. It used to fire one configuration
 * request per offerable service across *every* category in parallel (~325),
 * which routinely exceeded the 30s API client deadline and surfaced as
 * `ApiNetworkError` on `/apply/work`.
 *
 * Now: only visible main categories, configs fetched with a small concurrency
 * cap. Career/Jobs only publishes the hiring-partner apply row.
 */

const CATALOG_REVALIDATE_SECONDS = 300;
/** Keep Django runserver responsive; full parallel stampede was timing out. */
const CONFIG_FETCH_CONCURRENCY = 6;

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

/** Stays and rentals are signup paths, not trades on /apply/work. */
const NOT_A_TRADE = new Set(["rooms-pg-hostel", "rental-services"]);

export function visibleMainCategories(
  categories: readonly {
    id: string;
    slug: string;
    name: string;
    icon_key: string;
    image_url: string;
  }[],
): MainCategory[] {
  const ordered = categories.filter((category) => !NOT_A_TRADE.has(category.slug)).map((category) => ({
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

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]!);
    }
  }
  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

export const getWorkCatalog = cache(async (): Promise<WorkCatalog> => {
  const api = createPublicApi(policy);
  const categories = await request(() => api.GET("/api/v1/categories/"));
  const mainCategories = visibleMainCategories(categories);
  const allowedSlugs = new Set(mainCategories.map((category) => category.slug));

  const cards = await Promise.all(
    categories
      .filter((category) => allowedSlugs.has(category.slug))
      .map(async (category) => ({
        category,
        services: await request(() =>
          api.GET("/api/v1/categories/{category_slug}/services/", {
            params: { path: { category_slug: category.slug } },
          }),
        ),
      })),
  );

  type ConfigJob = { categoryName: string; service: Schemas["ServiceCard"] };
  const jobs: ConfigJob[] = cards.flatMap(({ category, services }) =>
    services.map((service) => ({ categoryName: category.name, service })),
  );

  const details = await mapPool(jobs, CONFIG_FETCH_CONCURRENCY, async ({ categoryName, service }) => ({
    categoryName,
    detail: await request(() =>
      api.GET("/api/v1/services/{service_slug}/configuration/", {
        params: { path: { service_slug: service.slug } },
      }),
    ),
  }));

  const allowedCategoryNames = new Set(mainCategories.map((category) => category.name));

  const services: OfferableService[] = details.flatMap(({ categoryName, detail }) =>
    detail.variants
      // Career/Jobs taxonomy has hundreds of A10 role variants. Partner apply
      // only offers the hiring-partner row (required_skill_code === career-jobs).
      .filter((variant) => {
        if (categoryName !== "Career Opportunity or Job Opportunities") return true;
        return variant.required_skill_code === "career-jobs";
      })
      .map((variant) => ({
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
