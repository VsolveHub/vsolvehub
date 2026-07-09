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
import { ServiceSketchImage } from "@/components/ui/ServiceSketchImage";
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
  subCategory?: { name: string; slug?: string } | null;
};

type Props = {
  service: Service;
  detail: ServiceDetailContent;
  shareUrl: string;
  isSaved: boolean;
  showSave: boolean;
};

const DUMMY_REVIEWS = [
  { id: 1, name: "Rahul Verma", location: "Hyderabad", time: "2 days ago", text: "The technician arrived on time and used the foam jet technology as described. My AC cooling has improved significantly. Very professional service.", initial: "R" },
  { id: 2, name: "Priya S.", location: "Hyderabad", time: "5 days ago", text: "Good value for money. The cleaning was very thorough. They even cleaned the mess around the AC after the service.", initial: "P" },
  { id: 3, name: "Kiran Kumar", location: "Hyderabad", time: "1 week ago", text: "The Foam-jet technique is way better than normal service. No mess at all since they use a specialized cleaning jacket.", initial: "K" }
];

const DUMMY_RELATED = [
  { id: 1, name: "AC repair", rating: "4.73", time: "Instant", price: 29900, image: "/ac_repair.jpg" },
  { id: 2, name: "AC installation", rating: "4.69", time: "Instant", price: 109900, image: "/ac_installation.jpg" },
  { id: 3, name: "Foam-jet service (2 ACs)", rating: "4.76", time: "Instant", price: 109800, image: "/ac_foam.jpg" },
  { id: 4, name: "AC uninstallation", rating: "4.80", time: "Instant", price: 69900, image: "/ac_uninstall.jpg" }
];

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
    <div className="service-detail animate-fade-in desktop-wide-layout sd-desktop-container mt-6">
      <div className="sd-desktop-layout-v3">
        
        {/* LEFT COLUMN: Booking Hub */}
        <div className="sd-left-hub">
          
          <div className="sd-hero-image-wrapper">
            <span className="sd-hero-badge">⭐ Best Seller</span>
            <div className="sd-hero-image-inner">
              <ServiceSketchImage
                slug={service.slug}
                subCategorySlug={service.subCategory?.slug}
                categorySlug={service.category.slug}
                serviceName={service.name}
                variant="hero"
                alt={service.name}
              />
            </div>
          </div>

          <div className="sd-breadcrumbs-v3 mt-4">
            <Link href={`/services/${service.category.slug}`}>{service.category.name}</Link>
            <span>›</span>
            <span className="current">{service.name}</span>
          </div>

          <h1 className="sd-hero-title-v3">{service.name}</h1>
          
          <div className="sd-rating-row-hero-v3">
            <span className="sd-badge-rating">★ {detail.rating.toFixed(2)}</span>
            <span className="sd-review-count-hero">({detail.reviewCountLabel} reviews bookings)</span>
          </div>

          <div className="sd-pricing-card-v3">
            <div className="sd-pricing-row">
              <div className="price-stack">
                <div className="price-main">
                  <span className="sd-price-large">{formatPrice(service.pricePaise)}</span>
                  {detail.originalPricePaise && (
                    <span className="sd-price-old-large">{formatPrice(detail.originalPricePaise)}</span>
                  )}
                </div>
                <div className="price-offer">
                  33% OFF • Limited Time Offer
                </div>
              </div>
              <Link href={bookHref} className="btn btn-black sd-book-btn-v3">
                {primaryBookLabel}
              </Link>
            </div>
            
            <div className="sd-booking-perks-v3">
              <div className="perk-item">
                <FlaticonIcon name="shield-check" size={16} color="#6366f1" />
                <span>UC Cover: 30 days warranty included</span>
              </div>
              {durationLabel && (
                <div className="perk-item">
                  <FlaticonIcon name="clock" size={16} color="#6366f1" />
                  <span>Duration: {durationLabel}</span>
                </div>
              )}
            </div>
          </div>
          
        </div>

        {/* RIGHT COLUMN: Details & Reviews */}
        <div className="sd-right-details">
          
          <section className="sd-section">
            <h2 className="sd-section-title-v3">What's included in this service</h2>
            
            <div className="sd-included-card-v3 mt-6">
              <div className="sd-accordion-item-v3 open">
                <h3 className="sd-accordion-header-v3">
                  Service inclusions
                  <FlaticonIcon name="angle-small-down" size={20} />
                </h3>
                <ul className="sd-check-list-v3">
                  {detail.covered.map((item) => (
                    <li key={item}>
                      <span className="check-circle">✓</span>
                      {item}
                    </li>
                  ))}
                  <li><span className="check-circle">✓</span> Custom scope for {service.name}</li>
                  <li><span className="check-circle">✓</span> Consultation to define deliverables</li>
                  <li><span className="check-circle">✓</span> Matched professional or vendor</li>
                </ul>
              </div>

              {detail.notCovered.length > 0 && (
                <div className="sd-accordion-item-v3">
                  <h3 className="sd-accordion-header-v3">
                    What is excluded
                    <FlaticonIcon name="angle-small-down" size={20} />
                  </h3>
                </div>
              )}
            </div>
          </section>

          <section className="sd-section mt-12">
            <h2 className="sd-section-title-v3">User reviews and ratings</h2>
            <div className="sd-reviews-header-v3">
              <span className="sd-rating-big">★ {detail.rating.toFixed(2)}/5</span>
              <span className="sd-review-count">based on {detail.reviewCountLabel} reviews</span>
              <Link href="#" className="view-all-link">View all reviews</Link>
            </div>
            
            <div className="sd-reviews-grid-v3">
              {DUMMY_REVIEWS.map(rev => (
                <div key={rev.id} className="sd-review-card-v3">
                  <div className="sd-review-card-header">
                    <div className="sd-review-avatar">{rev.initial}</div>
                    <div className="sd-review-meta">
                      <strong>{rev.name}</strong>
                      <span>{rev.location} • {rev.time}</span>
                    </div>
                    <div className="sd-review-stars">★★★★★</div>
                  </div>
                  <p className="sd-review-text">"{rev.text}"</p>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>

      {/* BOTTOM SECTION: Related Services */}
      <div className="sd-related-services-v3">
        <h2 className="sd-section-title-v3">Related services</h2>
        <div className="sd-related-grid">
          {DUMMY_RELATED.map(rel => (
            <div key={rel.id} className="sd-related-card">
              <div className="sd-related-img-box">
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
                  <FlaticonIcon name="air-conditioner" size={48} color="#6366f1" />
                </div>
              </div>
              <div className="sd-related-info">
                <h3>{rel.name}</h3>
                <span className="sd-related-rating">★ {rel.rating} • {rel.time}</span>
                <div className="sd-related-action">
                  <strong>{formatPrice(rel.price)}</strong>
                  <button className="sd-related-add-btn">Add</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile Footer Sticky Action */}
      <div className="sd-footer-actions desktop-hidden">
        <Link href={bookHref} className="btn btn-black sd-book-btn">
          {service.archetype === "E" ? "View openings" : primaryBookLabel}
        </Link>
        {showSave && <SaveServiceButton serviceId={service.id} initialSaved={isSaved} />}
      </div>
    </div>
  );
}
