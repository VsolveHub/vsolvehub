import "server-only";

import { cache } from "react";
import {
  ApiRequestError,
  request,
  type Schemas,
} from "@vsolve/api-client";

import { CACHE_TAGS, CATALOG_REVALIDATE_SECONDS } from "@/lib/api/config";
import { createPublicApi } from "@/lib/api/public";

/**
 * Catalog reads for server rendering.
 *
 * Every type here comes from the published contract. Nothing in this file
 * describes a response shape — if a field is missing, the fix is a contract
 * proposal, not a local interface.
 *
 * `cache()` deduplicates within a single render pass, so a layout and a page
 * asking for the same category produce one request. Next's Data Cache handles
 * reuse *across* requests via the revalidate/tag policy.
 */

export type Category = Schemas["Category"];
export type ServiceCard = Schemas["ServiceCard"];
export type ServiceDetail = Schemas["ServiceDetail"];
export type ServiceVariantConfiguration = Schemas["ServiceVariantConfiguration"];

const catalogPolicy = (tags: string[]) => ({
  revalidate: CATALOG_REVALIDATE_SECONDS,
  tags: [CACHE_TAGS.catalog, ...tags],
});

/**
 * Distinguishes "this does not exist" from "the catalog is unreachable".
 *
 * A 404 means show `notFound()`. Anything else means the API is down, and the
 * page must say so honestly rather than rendering an empty catalog that implies
 * Vsolve Hub offers no services.
 */
function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

export const getCategories = cache(async (): Promise<Category[]> => {
  const api = createPublicApi(catalogPolicy([]));
  return request(() => api.GET("/api/v1/categories/"));
});

export const getCategoryServices = cache(
  async (categorySlug: string): Promise<ServiceCard[] | null> => {
    const api = createPublicApi(catalogPolicy([CACHE_TAGS.category(categorySlug)]));
    try {
      return await request(() =>
        api.GET("/api/v1/categories/{category_slug}/services/", {
          params: { path: { category_slug: categorySlug } },
        }),
      );
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  },
);

export const getService = cache(async (serviceSlug: string): Promise<ServiceDetail | null> => {
  const api = createPublicApi(catalogPolicy([CACHE_TAGS.service(serviceSlug)]));
  try {
    return await request(() =>
      api.GET("/api/v1/services/{service_slug}/", {
        params: { path: { service_slug: serviceSlug } },
      }),
    );
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
});

/**
 * Booking configuration for the workspace.
 *
 * Currently returns the same `ServiceDetail` shape as the detail endpoint;
 * Codex keeps it separate so the booking workspace can cache it independently
 * of the marketing page. Kept as its own function for that reason — the two
 * have different revalidation needs even while the payload matches.
 */
export const getServiceConfiguration = cache(
  async (serviceSlug: string): Promise<ServiceDetail | null> => {
    const api = createPublicApi(catalogPolicy([CACHE_TAGS.service(serviceSlug)]));
    try {
      return await request(() =>
        api.GET("/api/v1/services/{service_slug}/configuration/", {
          params: { path: { service_slug: serviceSlug } },
        }),
      );
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  },
);

/** Finds a category by slug from the already-cached list, avoiding a second call. */
export const getCategory = cache(async (slug: string): Promise<Category | null> => {
  const categories = await getCategories();
  return categories.find((category) => category.slug === slug) ?? null;
});
