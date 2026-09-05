"use client";

import { useQueries, useQuery, type QueryClient } from "@tanstack/react-query";
import { request, type Schemas } from "@vsolve/api-client";
import {
  STATIC_CONTENT,
  fetchCachedQuery,
  queryKeys,
  type CachedQueryDefinition,
} from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

import { findCatalogService, type CatalogServiceHint } from "./service-cover";

/**
 * Client-side catalog reads through TanStack Query.
 *
 * Server Components use `features/catalog/queries.ts` with Next's Data Cache.
 * Any browser-only catalog fetch — quick-add, typeahead, client navigation —
 * must go through here so the answer is keyed, tiered and deduplicated like
 * every other API read in the app.
 */

export type Category = Schemas["Category"];
export type ServiceCard = Schemas["ServiceCard"];
export type ServiceDetail = Schemas["ServiceDetail"];

function categoriesQuery(): CachedQueryDefinition<Category[]> {
  return {
    queryKey: queryKeys.catalog.categories(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/categories/")),
    ...STATIC_CONTENT,
  };
}

function categoryServicesQuery(categorySlug: string): CachedQueryDefinition<ServiceCard[]> {
  return {
    queryKey: queryKeys.catalog.categoryServices(categorySlug),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/categories/{category_slug}/services/", {
          params: { path: { category_slug: categorySlug } },
        }),
      ),
    ...STATIC_CONTENT,
  };
}

function serviceDetailQuery(serviceSlug: string): CachedQueryDefinition<ServiceDetail> {
  return {
    queryKey: queryKeys.catalog.service(serviceSlug),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/services/{service_slug}/", {
          params: { path: { service_slug: serviceSlug } },
        }),
      ),
    ...STATIC_CONTENT,
  };
}

export function useCategories(enabled = true) {
  return useQuery({ ...categoriesQuery(), enabled });
}

export function useCategoryServices(categorySlug: string | null, enabled = true) {
  return useQuery({
    ...categoryServicesQuery(categorySlug ?? ""),
    enabled: enabled && categorySlug !== null && categorySlug.length > 0,
  });
}

export function useServiceDetail(serviceSlug: string | null, enabled = true) {
  return useQuery({
    ...serviceDetailQuery(serviceSlug ?? ""),
    enabled: enabled && serviceSlug !== null && serviceSlug.length > 0,
  });
}

/**
 * Every published `ServiceCard`, keyed the same way the category listing is.
 *
 * Booking, request and engagement rows look up `cover.url` from this index so a
 * catalogue image change on the service page is the image the bookings page
 * shows. The per-category reads are the listing endpoint — not a second media
 * map, and not `GET /services/` which has no cover.
 */
export function useCatalogServiceIndex() {
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data ?? [];
  const serviceQueries = useQueries({
    queries: categories.map((category) => ({
      ...categoryServicesQuery(category.slug),
      enabled: categoriesQuery.isSuccess,
    })),
  });

  const services: ServiceCard[] = [];
  for (const query of serviceQueries) {
    if (query.data) services.push(...query.data);
  }

  return {
    services,
    find: (hint: CatalogServiceHint) => findCatalogService(services, hint),
    isPending:
      categoriesQuery.isPending ||
      (categoriesQuery.isSuccess && serviceQueries.some((query) => query.isPending)),
  };
}

export function fetchCategories(queryClient: QueryClient) {
  return fetchCachedQuery(queryClient, categoriesQuery());
}

export function fetchCategoryServices(queryClient: QueryClient, categorySlug: string) {
  return fetchCachedQuery(queryClient, categoryServicesQuery(categorySlug));
}

export function fetchServiceDetail(queryClient: QueryClient, serviceSlug: string) {
  return fetchCachedQuery(queryClient, serviceDetailQuery(serviceSlug));
}
