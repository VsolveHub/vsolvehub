// Ported from frontend/apps/partner/features/catalog/queries.ts
import { request, type Schemas } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { useQuery } from "@tanstack/react-query";

export interface OfferableService {
  variantId: string;
  variantCode: string;
  variantName: string;
  serviceName: string;
  categoryName: string;
  requiredSkillCode: string;
}

export interface MainCategory {
  id: string;
  slug: string;
  name: string;
  iconKey: string;
  imageUrl: string;
}

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

export async function getWorkCatalog(): Promise<WorkCatalog> {
  const api = getApiClient();
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
}

export function useWorkCatalog() {
  return useQuery({
    queryKey: ["catalog", "work"],
    queryFn: getWorkCatalog,
    staleTime: 300_000,
  });
}
