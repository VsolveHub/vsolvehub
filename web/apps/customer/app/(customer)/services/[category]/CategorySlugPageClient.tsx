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

// Dummy image mapping for visuals
const DUMMY_IMAGES: Record<string, string> = {
  "home-cleaning": "/home-cleaning.jpg",
  "sofa-carpet-cleaning": "/sofa-cleaning.jpg",
  "pest-control": "/pest-control.jpg",
  "laundry": "/laundry.jpg",
  "gardening": "/gardening.jpg"
};

const DEFAULT_IMAGE = "/cleaning.jpg";

export function CategorySlugPageClient({
  categorySlug,
  subCategories,
  standaloneServices,
}: Props) {
  return (
    <div className="cat-browse-layout-v3">
      {/* Subcategory selector grid */}
      {subCategories.length > 0 && (
        <section className="cat-subcategory-section-v3">
          <h2 className="cat-section-title-v3">Select Subcategory</h2>
          <div className="cat-subcategory-grid-v3">
            {subCategories.map((sub) => {
              return (
                <Link
                  key={sub.id}
                  href={`/services/${categorySlug}/${sub.slug}`}
                  className="cat-subcategory-card-v3"
                >
                  <div className="cat-card-img-wrapper">
                    {getSubcategoryIcon(sub.slug)}
                  </div>
                  <div className="cat-card-info">
                    <span className="cat-card-name">{sub.name}</span>
                    <span className="cat-card-count">
                      {sub.services.length} services
                    </span>
                  </div>
                  <span className="cat-card-chevron" aria-hidden>
                    ›
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Services that don't belong to a subcategory */}
      {standaloneServices.length > 0 && (
        <section className="cat-services-list-section-v3">
          <h2 className="cat-section-title-v3">
            {subCategories.length > 0 ? "More Services" : "Services"}
          </h2>
          <ul className="service-list">
            {standaloneServices.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </ul>
        </section>
      )}

      {/* FAQ Section */}
      <div className="cat-faq-wrapper">
        <section className="cat-faq-section">
          <h2 className="cat-section-title-v3">Frequently Asked Questions</h2>
          
          <div className="cat-faq-item mt-6">
            <h4 className="cat-faq-q">How do I choose the right cleaning service?</h4>
            <p className="cat-faq-a">
              Assess your needs: deep cleaning for seasonal maintenance or express cleaning for weekly upkeep. All our professionals are rated for transparency.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
