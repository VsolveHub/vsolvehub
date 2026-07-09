"use client";

import Link from "next/link";
import { formatPriceLabel } from "@/lib/format";
import { SERVICE_SLUG_TO_PROPERTY_TYPE } from "@/lib/accommodation/constants";
import { getVehicleFlowHref } from "@/lib/vehicle/constants";
import { ServiceIcon } from "@/components/ui/ServiceIcons";
import { getServiceCardMeta } from "@/lib/catalog/service-card-meta";

function formatDurationChip(duration: number, unit?: string): string | null {
  if (duration <= 0) return null;
  if (unit === "day") return "Full day";
  if (unit === "night") return "Per night";
  return `${Math.round(duration / 60)} hrs`;
}

export type ServiceCardData = {
  id: string;
  name: string;
  slug: string;
  description: string;
  pricePaise: number;
  unit?: string;
  duration?: number;
  category: { slug: string; name: string; icon: string };
  subCategory?: { name: string; slug: string } | null;
};

function getAccommodationHref(service: ServiceCardData) {
  const subSlug = service.subCategory?.slug ?? service.slug;
  const type = SERVICE_SLUG_TO_PROPERTY_TYPE[subSlug] ?? SERVICE_SLUG_TO_PROPERTY_TYPE[service.slug];
  return type ? `/accommodation?type=${type}` : "/accommodation";
}

function getBookHref(service: ServiceCardData) {
  if (service.category.slug === "accommodation-services") {
    return getAccommodationHref(service);
  }
  const subSlug = service.subCategory?.slug ?? service.slug;
  const vehicleHref = getVehicleFlowHref(service.slug, subSlug);
  if (vehicleHref) return vehicleHref;
  return `/booking?serviceId=${service.id}`;
}

function getBookLabel(service: ServiceCardData) {
  if (service.category.slug === "accommodation-services") return "Browse";
  return "Book now";
}

export function ServiceCard({ service }: { service: ServiceCardData }) {
  const href = `/services/${service.category.slug}/${service.slug}`;
  const bookHref = getBookHref(service);
  const bookLabel = getBookLabel(service);
  const metaLabel = service.subCategory?.name ?? service.category.name;
  const durationLabel = formatDurationChip(service.duration ?? 0, service.unit);
  
  // Resolve subcategory-specific illustration icon
  const subSlug = service.subCategory?.slug ?? service.slug;
  const cardMeta = getServiceCardMeta(subSlug, service.category.slug, service.name);
  
  // Simulated star rating based on ID hash for consistency
  const rating = (4.5 + (service.id.charCodeAt(service.id.length - 1) % 5) * 0.1).toFixed(1);

  return (
    <li className="service-card-item">
      <div className="service-card-wrapper">
        <Link href={href} className="service-card-body">
          <div className="service-card-left">
            <span className="service-card-icon-container" aria-hidden>
              <ServiceIcon
                name={cardMeta.icon}
                size={56}
                color={cardMeta.color}
                slug={service.slug}
                subCategorySlug={subSlug}
                categorySlug={service.category.slug}
                serviceName={service.name}
                alt={service.name}
              />
            </span>
            <div className="service-card-details">
              <div className="flex-align gap-xs">
                <span className="service-card-badge-verified">✓ Verified Pro</span>
                <span className="service-card-rating">★ {rating}</span>
              </div>
              <h3 className="service-card-title">{service.name}</h3>
              <p className="service-card-desc">{service.description.slice(0, 75)}...</p>
              <div className="service-card-meta-chips">
                <span className="service-card-chip">{metaLabel}</span>
                {durationLabel ? (
                  <span className="service-card-chip service-card-chip--muted">{durationLabel}</span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="service-card-right">
            <span className="service-card-price">{formatPriceLabel(service.pricePaise, service.unit)}</span>
          </div>
        </Link>

        <div className="service-card-actions">
          <label className="service-card-compare-label" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" className="service-card-compare-checkbox" />
            <span>Add to Compare</span>
          </label>
          <Link href={bookHref} className="service-card-book-btn">
            {bookLabel}
          </Link>
        </div>
      </div>
    </li>
  );
}

export function ServiceCardList({ services }: { services: ServiceCardData[] }) {
  if (!services.length) {
    return (
      <div className="m3-empty-state">
        <p>No services found.</p>
        <Link href="/services" className="m3-btn m3-btn--tonal">
          Browse all services
        </Link>
      </div>
    );
  }

  return (
    <ul className="service-list">
      {services.map((service) => (
        <ServiceCard key={service.id} service={service} />
      ))}
    </ul>
  );
}
