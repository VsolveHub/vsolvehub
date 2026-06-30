import Link from "next/link";
import { ServiceCard } from "@/components/customer/services/ServiceCard";
import type { ServiceCardData } from "@/components/customer/services/ServiceCard";
import { getSubcategoryIcon } from "@/lib/catalog/service-icons";

type SubCategory = {
  id: string;
  name: string;
  slug: string;
  services: ServiceCardData[];
};

type Props = {
  categorySlug: string;
  categoryName: string;
  subCategories: SubCategory[];
  standaloneServices: ServiceCardData[];
};

export function CategorySlugPageClient({
  categorySlug,
  subCategories,
  standaloneServices,
}: Props) {
  return (
    <div className="category-browse-layout">
      {/* Subcategory selector grid — each card opens its own services page */}
      {subCategories.length > 0 && (
        <section className="subcategory-section">
          <h2 className="section-title">Select Subcategory</h2>
          <div className="subcategory-grid">
            {subCategories.map((sub) => (
              <Link
                key={sub.id}
                href={`/services/${categorySlug}/${sub.slug}`}
                className="subcategory-card"
                id={`subcat-pill-${sub.slug}`}
              >
                <span className="subcategory-card-icon">
                  {getSubcategoryIcon(sub.slug)}
                </span>
                <div className="subcategory-card-info">
                  <span className="subcategory-card-name">{sub.name}</span>
                  <span className="subcategory-card-count">
                    {sub.services.length} services
                  </span>
                </div>
                <span className="subcategory-card-chevron" aria-hidden>
                  ›
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Services that don't belong to a subcategory — bookable directly */}
      {standaloneServices.length > 0 && (
        <section className="services-list-section">
          <h2 className="section-title">
            {subCategories.length > 0 ? "More Services" : "Services"}
          </h2>
          <ul className="service-list">
            {standaloneServices.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
