"use client";

import Link from "next/link";
import { ServiceIcon } from "@/components/ui/ServiceIcons";
import type { IconName } from "@/components/ui/ServiceIcons";

const PREVIEW_LIMIT = 3;

export type CatalogServiceItem = {
  id: string;
  name: string;
  href: string;
  icon: IconName;
  color: string;
  subtitle: string;
};

export type CatalogCategoryData = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  headerIcon: IconName;
  totalCount: number;
  services: CatalogServiceItem[];
};

type Props = {
  categories: CatalogCategoryData[];
};

export function ServiceCatalogView({ categories }: Props) {
  return (
    <div className="services-page">
      <header className="services-page__header">
        <h1 className="services-page__title">Our Services</h1>
        <p className="services-page__meta">Browse by category — tap View all for the full list</p>
      </header>

      {categories.map((category, catIndex) => {
        const preview = category.services.slice(0, PREVIEW_LIMIT);
        const hasMore = category.totalCount > PREVIEW_LIMIT;

        if (preview.length === 0) return null;

        return (
          <section key={category.id} className="catalog-group">
            <div className="catalog-group-header">
              <h2>
                <span className="group-icon">
                  <ServiceIcon name={category.headerIcon} size={14} color="var(--color-brand)" />
                </span>
                {catIndex + 1}. {category.name.toUpperCase()}
              </h2>
              {hasMore ? (
                <Link href={`/services/${category.slug}`} className="section-link">
                  View all ({category.totalCount}) →
                </Link>
              ) : null}
            </div>

            <div className="catalog-service-scroll">
              {preview.map((service) => (
                <Link key={service.id} href={service.href} className="catalog-service-card">
                  <span className="catalog-service-icon">
                    <ServiceIcon name={service.icon} size={28} color={service.color} />
                  </span>
                  <span className="catalog-service-name">{service.name}</span>
                  <span className="catalog-service-sub">{service.subtitle}</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
