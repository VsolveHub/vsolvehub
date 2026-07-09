"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ServiceIcon } from "@/components/ui/ServiceIcons";
import { ServiceSketchImage } from "@/components/ui/ServiceSketchImage";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import type { IconName } from "@/components/ui/ServiceIcons";

const PREVIEW_LIMIT = 4;

export type CatalogServiceItem = {
  id: string;
  slug: string;
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
  const visibleCategories = categories.filter((c) => c.services.length > 0);
  const [activeSlug, setActiveSlug] = useState(visibleCategories[0]?.slug ?? "");
  const feedRef = useRef<HTMLDivElement>(null);
  const categorySlugs = visibleCategories.map((c) => c.slug).join(",");

  useEffect(() => {
    const sections = categorySlugs
      .split(",")
      .filter(Boolean)
      .map((slug) => document.getElementById(`cat-${slug}`))
      .filter(Boolean) as HTMLElement[];

    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) {
          setActiveSlug(visible[0].target.id.replace("cat-", ""));
        }
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5] }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [categorySlugs]);

  function scrollToCategory(slug: string) {
    setActiveSlug(slug);
    const el = document.getElementById(`cat-${slug}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div className="services-page services-catalog-v2">
      <header className="services-page__hero">
        <h1 className="services-page__title">Our Services</h1>
        <p className="services-page__meta">Browse by category — tap View all for the full list</p>
      </header>

      <div className="services-mobile-cats" aria-label="Jump to category">
        {visibleCategories.map((category, index) => (
          <button
            key={category.id}
            type="button"
            className={`services-mobile-cat${activeSlug === category.slug ? " active" : ""}`}
            onClick={() => scrollToCategory(category.slug)}
          >
            <span className="services-mobile-cat__num">{index + 1}</span>
            {category.name}
          </button>
        ))}
      </div>

      <div className="services-page__body">
        <div className="services-desktop-split">
          <aside className="services-left-sidebar" aria-label="Categories">
            <div className="services-sidebar-sticky">
              <h3 className="services-sidebar-title">Categories</h3>
              <div className="services-sidebar-links">
                {visibleCategories.map((category, index) => (
                  <button
                    key={category.id}
                    type="button"
                    className={`services-sidebar-link${activeSlug === category.slug ? " active" : ""}`}
                    onClick={() => scrollToCategory(category.slug)}
                  >
                    <span className="services-link-num">{index + 1}</span>
                    <span className="services-link-name">{category.name}</span>
                    <FlaticonIcon name="angle-right" size={12} className="services-link-chevron" />
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <div className="services-right-feed" ref={feedRef}>
            {visibleCategories.map((category, catIndex) => {
              const preview = category.services.slice(0, PREVIEW_LIMIT);
              const hasMore = category.totalCount > PREVIEW_LIMIT;

              return (
                <section
                  key={category.id}
                  id={`cat-${category.slug}`}
                  className="catalog-group scroll-margin-top"
                >
                  <div className="catalog-group-header">
                    <h2>
                      <span className="group-icon">
                        <ServiceIcon name={category.headerIcon} size={14} color="var(--color-brand)" />
                      </span>
                      {catIndex + 1}. {category.name.toUpperCase()}
                    </h2>
                    {hasMore ? (
                      <Link href={`/services/${category.slug}`} className="catalog-view-all">
                        View all ({category.totalCount}) →
                      </Link>
                    ) : null}
                  </div>

                  <div className="catalog-photo-grid">
                    {preview.map((service) => (
                      <Link key={service.id} href={service.href} className="catalog-photo-card">
                        <div className="catalog-photo-card__image">
                          <ServiceSketchImage
                            slug={service.slug}
                            subCategorySlug={service.slug}
                            categorySlug={category.slug}
                            serviceName={service.name}
                            icon={service.icon}
                            variant="hero"
                            alt={service.name}
                          />
                        </div>
                        <div className="catalog-photo-card__body">
                          <h3 className="catalog-photo-card__title">{service.name}</h3>
                          <p className="catalog-photo-card__meta">{service.subtitle}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
