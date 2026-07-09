import { getCatalogGrouped } from "@/lib/catalog/queries";
import {
  CATEGORY_HEADER_ICONS,
  getServiceCardMeta,
} from "@/lib/catalog/service-card-meta";
import { ServiceCatalogView } from "./ServiceCatalogView";
import type { CatalogCategoryData, CatalogServiceItem } from "./ServiceCatalogView";

export async function ServiceCatalogDb() {
  const catalog = await getCatalogGrouped();

  const categories: CatalogCategoryData[] = catalog.map((category) => {
    // Browse by subcategory (e.g. Electrician, Plumbing) — not individual services.
    const subItems: CatalogServiceItem[] = category.subCategories.map((sub) => {
      const meta = getServiceCardMeta(sub.slug, category.slug, sub.name);
      const count = sub.services.length;
      return {
        id: sub.id,
        slug: sub.slug,
        name: sub.name,
        href: `/services/${category.slug}/${sub.slug}`,
        icon: meta.icon,
        color: meta.color,
        subtitle: `${count} ${count === 1 ? "service" : "services"} available`,
      };
    });

    // Fallback for categories that have no subcategories: list their services.
    const fallbackItems: CatalogServiceItem[] = category.services
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((service) => {
        const meta = getServiceCardMeta(service.slug, category.slug, service.name);
        return {
          id: service.id,
          slug: service.slug,
          name: service.name,
          href: `/services/${category.slug}/${service.slug}`,
          icon: meta.icon,
          color: meta.color,
          subtitle: meta.subtitle,
        };
      });

    const items = subItems.length > 0 ? subItems : fallbackItems;

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      icon: category.icon,
      headerIcon: CATEGORY_HEADER_ICONS[category.slug] ?? "grid-menu",
      totalCount: items.length,
      services: items,
    };
  });

  return <ServiceCatalogView categories={categories} />;
}
