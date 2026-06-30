import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { ServiceDetailContent } from "@/lib/catalog/service-detail-content";
import { SERVICE_SLUG_TO_PROPERTY_TYPE } from "@/lib/accommodation/constants";
import { getVehicleFlowHref } from "@/lib/vehicle/constants";
import { ServiceDetailFaq } from "./ServiceDetailFaq";
import { ServiceDetailReviews } from "./ServiceDetailReviews";
import { ServiceShareButton } from "./ServiceShareButton";
import { SaveServiceButton } from "./SaveServiceButton";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

type Service = {
  id: string;
  name: string;
  slug: string;
  description: string;
  pricePaise: number;
  duration: number;
  archetype: string;
  unit: string;
  category: { slug: string; name: string; icon: string };
  subCategory?: { name: string } | null;
};

type Props = {
  service: Service;
  detail: ServiceDetailContent;
  shareUrl: string;
  isSaved: boolean;
  showSave: boolean;
};

export function ServiceDetailView({ service, detail, shareUrl, isSaved, showSave }: Props) {
  const durationLabel =
    service.duration > 0
      ? service.unit === "day"
        ? "Full day"
        : service.unit === "night"
          ? "Per night"
          : `${Math.round(service.duration / 60)} hrs`
      : null;

  const bookLabel = service.archetype === "E" ? "Apply" : "Add";
  const isAccommodation = service.category.slug === "accommodation-services";
  const accType = SERVICE_SLUG_TO_PROPERTY_TYPE[service.slug];
  const accommodationHref = accType ? `/accommodation?type=${accType}` : "/accommodation";
  const vehicleHref = getVehicleFlowHref(service.slug);
  const bookHref = isAccommodation
    ? accommodationHref
    : vehicleHref ?? `/booking?serviceId=${service.id}`;
  const primaryBookLabel = isAccommodation
    ? "Browse stays"
    : vehicleHref
      ? "Start booking"
      : "Book now";

  return (
    <div className="service-detail">
      <div className="sd-topbar">
        <Link href="/services" className="sd-close-btn" aria-label="Close">
          <FlaticonIcon name="cross" size={18} />
        </Link>
      </div>

      <section className="sd-hero">
        <div className="sd-hero-row">
          <div>
            <p className="sd-category">
              <CategoryIcon slug={service.category.slug} icon={service.category.icon} size={16} />{" "}
              {service.category.name}
            </p>
            <h1 className="sd-title">{service.name}</h1>
            <div className="sd-rating-row">
              <span className="sd-rating">★ {detail.rating.toFixed(2)}</span>
              <span className="sd-review-count">({detail.reviewCountLabel})</span>
            </div>
            <div className="sd-price-row">
              {service.pricePaise > 0 ? (
                <>
                  <span className="sd-price">{formatPrice(service.pricePaise)}</span>
                  {detail.originalPricePaise && (
                    <span className="sd-price-old">{formatPrice(detail.originalPricePaise)}</span>
                  )}
                </>
              ) : (
                <span className="sd-price">Free to browse</span>
              )}
              {durationLabel && <span className="sd-duration">• {durationLabel}</span>}
            </div>
            {detail.unitPriceLabel && (
              <p className="sd-unit-price">
                <span className="sd-unit-icon">🏷️</span> {detail.unitPriceLabel}
              </p>
            )}
          </div>
          <Link href={bookHref} className="sd-add-btn">
            {isAccommodation ? "Browse" : bookLabel}
          </Link>
        </div>
      </section>

      <section className="sd-section">
        <h2 className="sd-section-title">What is covered</h2>
        <ul className="sd-check-list">
          {detail.covered.map((item) => (
            <li key={item}>
              <span className="sd-icon-yes" aria-hidden>✓</span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="sd-section">
        <h2 className="sd-section-title">What is not covered</h2>
        <ul className="sd-check-list">
          {detail.notCovered.map((item) => (
            <li key={item}>
              <span className="sd-icon-no" aria-hidden>✕</span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="sd-section">
        <h2 className="sd-section-title">Our process</h2>
        <ol className="sd-process-list">
          {detail.process.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="sd-section sd-trust">
        <h2 className="sd-section-title">{detail.professionalTitle}</h2>
        <div className="sd-trust-grid">
          <ul className="sd-trust-list">
            {detail.trustSignals.map((signal) => (
              <li key={signal.text}>
                <span aria-hidden>
                  <FlaticonIcon name={signal.icon} size={18} color="var(--color-brand)" />
                </span>
                {signal.text}
              </li>
            ))}
          </ul>
          <div className="sd-pro-photo" aria-hidden>
            <FlaticonIcon name="hard-hat" size={40} color="var(--color-brand)" />
          </div>
        </div>
      </section>

      <section className="sd-section">
        <h2 className="sd-section-title">Our equipments</h2>
        <div className="sd-equipment-grid">
          {detail.equipment.map((item) => (
            <div key={item.name} className="sd-equipment-card">
              <span className="sd-equipment-icon">
                <FlaticonIcon name={item.icon} size={24} color="var(--color-brand)" />
              </span>
              <span className="sd-equipment-name">{item.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="sd-section">
        <h2 className="sd-section-title">What we will need from you</h2>
        <div className="sd-requirements-row">
          {detail.requirements.map((item) => (
            <div key={item.name} className="sd-requirement-card">
              <span className="sd-req-icon">
                <FlaticonIcon name={item.icon} size={22} color="var(--color-brand)" />
              </span>
              <span>{item.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="sd-section sd-protection">
        <div>
          <h2 className="sd-section-title">Damage protection</h2>
          <p className="sd-protection-text">{detail.damageProtection}</p>
        </div>
        <span className="sd-shield" aria-hidden>
          <FlaticonIcon name="shield-check" size={32} color="var(--color-brand)" />
        </span>
      </section>

      <section className="sd-section">
        <h2 className="sd-section-title">Frequently asked questions</h2>
        <ServiceDetailFaq items={detail.faqs} />
      </section>

      <section className="sd-section">
        <div className="sd-ratings-header">
          <div>
            <span className="sd-rating-big">★ {detail.rating.toFixed(2)}</span>
            <span className="sd-review-count">{detail.reviewCountLabel}</span>
          </div>
        </div>
        <div className="sd-rating-bars">
          {detail.ratingDistribution.map((row) => (
            <div key={row.stars} className="sd-rating-bar-row">
              <span className="sd-bar-label">★ {row.stars}</span>
              <div className="sd-bar-track">
                <div className="sd-bar-fill" style={{ width: `${row.percent}%` }} />
              </div>
              <span className="sd-bar-count">{row.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="sd-section">
        <div className="sd-reviews-header">
          <h2 className="sd-section-title">All reviews</h2>
          <span className="sd-filter-link">Filter</span>
        </div>
        <div className="sd-filter-chips">
          <span className="sd-chip">Most detailed</span>
          <span className="sd-chip">In my area</span>
          <span className="sd-chip">Frequent users</span>
        </div>
        <ServiceDetailReviews reviews={detail.reviews} />
      </section>

      <ServiceShareButton title={service.name} url={shareUrl} />

      <div className="sd-footer-actions">
        <Link href={bookHref} className="btn btn-primary sd-book-btn">
          {service.archetype === "E" ? "View openings" : primaryBookLabel}
        </Link>
        {showSave && <SaveServiceButton serviceId={service.id} initialSaved={isSaved} />}
      </div>
    </div>
  );
}
