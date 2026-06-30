"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPrice } from "@/lib/format";
import type { PropertyDetail } from "@/lib/accommodation/types";

type Props = {
  property: PropertyDetail;
};

export function PropertyDetailView({ property }: Props) {
  const [activeImage, setActiveImage] = useState(0);
  const priceLabel =
    property.priceUnit === "night"
      ? `${formatPrice(property.pricePaise)}/night`
      : `${formatPrice(property.pricePaise)}/month`;

  return (
    <div className="acc-detail">
      <div className="acc-detail-topbar">
        <Link href="/accommodation" className="sd-close-btn" aria-label="Back">
          ←
        </Link>
      </div>

      <div className="acc-gallery">
        <img
          src={property.images[activeImage] ?? property.imageUrl}
          alt={property.title}
          className="acc-gallery-main"
        />
        <div className="acc-gallery-thumbs">
          {property.images.map((img, i) => (
            <button
              key={img}
              type="button"
              className={`acc-gallery-thumb ${i === activeImage ? "active" : ""}`}
              onClick={() => setActiveImage(i)}
            >
              <img src={img} alt="" />
            </button>
          ))}
        </div>
      </div>

      <section className="acc-detail-section">
        <h1 className="page-title">{property.title}</h1>
        <p className="text-muted">{property.location}</p>
        <div className="acc-property-meta">
          <span>★ {property.rating.toFixed(1)}</span>
          <span>{property.distanceKm} km away</span>
          <span>{property.isAvailable ? "Available" : "Unavailable"}</span>
        </div>
        <p className="detail-price">{priceLabel}</p>
        <p className="text-sm text-muted">
          Deposit: {formatPrice(property.depositPaise)} · {property.roomType}
        </p>
      </section>

      <section className="acc-detail-section card stack">
        <h2 className="section-title">Amenities</h2>
        <ul className="sd-check-list">
          {property.amenities.map((a) => (
            <li key={a}>
              <span className="sd-icon-yes">✓</span> {a}
            </li>
          ))}
        </ul>
      </section>

      <section className="acc-detail-section card stack">
        <h2 className="section-title">House rules</h2>
        <ul className="profile-bullet-list">
          {property.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <section className="acc-detail-section card stack">
        <h2 className="section-title">Owner</h2>
        <p className="card-title">{property.owner.name}</p>
        <p className="text-sm text-muted">★ {property.owner.rating.toFixed(1)}</p>
      </section>

      <div className="acc-detail-actions">
        <Link
          href={`/accommodation/book/${property.id}?mode=visit`}
          className="btn btn-secondary btn-block"
          style={{ textAlign: "center" }}
        >
          Book visit
        </Link>
        <Link
          href={`/accommodation/book/${property.id}?mode=move_in`}
          className="btn btn-primary btn-block"
          style={{ textAlign: "center" }}
        >
          Book now
        </Link>
        <a
          href={`tel:${property.owner.phone}`}
          className="btn btn-secondary btn-block"
          style={{ textAlign: "center" }}
        >
          Call owner
        </a>
      </div>
    </div>
  );
}
