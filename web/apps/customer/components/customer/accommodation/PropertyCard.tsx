"use client";

import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { PropertyListItem } from "@/lib/accommodation/types";

export function PropertyCard({ property }: { property: PropertyListItem }) {
  const priceLabel =
    property.priceUnit === "night"
      ? `${formatPrice(property.pricePaise)}/night`
      : `${formatPrice(property.pricePaise)}/mo`;

  return (
    <Link href={`/accommodation/property/${property.id}`} className="card acc-property-card">
      <div className="acc-property-image-wrap">
        {property.imageUrl ? (
          <img src={property.imageUrl} alt={property.title} className="acc-property-image" />
        ) : (
          <div className="acc-property-image acc-property-image-placeholder">🏨</div>
        )}
        {!property.isAvailable && <span className="acc-badge-unavailable">Unavailable</span>}
      </div>
      <div className="acc-property-body">
        <h3 className="card-title">{property.title}</h3>
        <p className="text-sm text-muted">{property.location}</p>
        <div className="acc-property-meta">
          <span>★ {property.rating.toFixed(1)}</span>
          <span>{property.distanceKm} km</span>
          <span>{property.roomType}</span>
        </div>
        <p className="detail-price acc-property-price">{priceLabel}</p>
      </div>
    </Link>
  );
}
