// Ported from frontend/apps/customer/features/catalog/client-queries.ts
import { useQueries, useQuery } from "@tanstack/react-query";
import { request, unwrap, type Schemas } from "@vsolve/api-client";
import { STATIC_CONTENT, queryKeys } from "@vsolve/query/native";

import { getApiClient } from "@vsolve/mobile-core";

export type Category = Schemas["Category"];
export type ServiceCard = Schemas["ServiceCard"];
export type ServiceDetail = Schemas["ServiceDetail"];

const CATALOG_FRESHNESS = { ...STATIC_CONTENT, staleTime: 300_000 };

export function useCategories(enabled = true) {
  return useQuery({
    queryKey: queryKeys.catalog.categories(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/categories/")),
    enabled,
    ...CATALOG_FRESHNESS,
  });
}

export function useCategoryServices(categorySlug: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.catalog.categoryServices(categorySlug ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/categories/{category_slug}/services/", {
          params: { path: { category_slug: categorySlug ?? "" } },
        }),
      ),
    enabled: enabled && categorySlug !== null && categorySlug.length > 0,
    ...CATALOG_FRESHNESS,
  });
}

export function useCatalogIndex(categories: readonly Category[]) {
  const serviceQueries = useQueries({
    queries: categories.map((category) => ({
      queryKey: queryKeys.catalog.categoryServices(category.slug),
      queryFn: () =>
        request(() =>
          getApiClient().GET("/api/v1/categories/{category_slug}/services/", {
            params: { path: { category_slug: category.slug } },
          }),
        ),
      ...CATALOG_FRESHNESS,
    })),
  });
  const servicesByCategory = new Map<string, ServiceCard[]>();
  categories.forEach((category, index) => {
    servicesByCategory.set(category.slug, serviceQueries[index]?.data ?? []);
  });
  return {
    servicesByCategory,
    isPending: serviceQueries.some((query) => query.isPending),
  };
}

export function useServiceDetail(serviceSlug: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.catalog.service(serviceSlug ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/services/{service_slug}/", {
          params: { path: { service_slug: serviceSlug ?? "" } },
        }),
      ),
    enabled: Boolean(enabled && serviceSlug && serviceSlug.length > 0),
    ...CATALOG_FRESHNESS,
  });
}

import { findCatalogService, type CatalogServiceHint } from "./service-cover";

export function useCatalogServiceIndex() {
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data ?? [];
  const serviceQueries = useQueries({
    queries: categories.map((category) => ({
      queryKey: queryKeys.catalog.categoryServices(category.slug),
      queryFn: () =>
        request(() =>
          getApiClient().GET("/api/v1/categories/{category_slug}/services/", {
            params: { path: { category_slug: category.slug } },
          }),
        ),
      enabled: categoriesQuery.isSuccess,
      ...CATALOG_FRESHNESS,
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
