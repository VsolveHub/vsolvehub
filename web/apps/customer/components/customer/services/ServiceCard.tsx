import Link from "next/link";
import { formatPriceLabel } from "@/lib/format";
import { SERVICE_SLUG_TO_PROPERTY_TYPE } from "@/lib/accommodation/constants";
import { getVehicleFlowHref } from "@/lib/vehicle/constants";
import { CategoryIcon } from "@/components/ui/CategoryIcon";

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

  return (
    <li className="service-list__item">
      <Link href={href} className="service-list__main">
        <span className="service-list__icon" aria-hidden>
          <CategoryIcon
            slug={service.category.slug}
            icon={service.category.icon}
            size={22}
            color="var(--m3-primary)"
          />
        </span>

        <span className="service-list__content">
          <span className="service-list__title">{service.name}</span>
          <span className="service-list__meta">
            <span className="service-list__chip">{metaLabel}</span>
            {durationLabel ? (
              <span className="service-list__chip service-list__chip--muted">{durationLabel}</span>
            ) : null}
          </span>
        </span>

        <span className="service-list__trail">
          <span className="service-list__price">{formatPriceLabel(service.pricePaise, service.unit)}</span>
          <span className="service-list__chevron" aria-hidden>
            ›
          </span>
        </span>
      </Link>

      <Link href={bookHref} className="service-list__book">
        {bookLabel}
      </Link>
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
