"use client";

import Link from "next/link";
import Image from "next/image";
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
        <Image
          src={property.images[activeImage] ?? property.imageUrl}
          alt={property.title}
          width={600}
          height={400}
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
              <Image src={img} alt="" width={80} height={60} />
            </button>
          ))}
        </div>
      </div>

      <section className="acc-detail-section">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{property.title}</h1>
        <p className="text-gray-500">{property.location}</p>
        <div className="acc-property-meta">
          <span>★ {property.rating.toFixed(1)}</span>
          <span>{property.distanceKm} km away</span>
          <span>{property.isAvailable ? "Available" : "Unavailable"}</span>
        </div>
        <p className="text-lg font-black text-gray-900">{priceLabel}</p>
        <p className="text-sm text-gray-500">
          Deposit: {formatPrice(property.depositPaise)} · {property.roomType}
        </p>
      </section>

      <section className="acc-detail-section rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Amenities</h2>
        <ul className="sd-check-list">
          {property.amenities.map((a) => (
            <li key={a}>
              <span className="sd-icon-yes">✓</span> {a}
            </li>
          ))}
        </ul>
      </section>

      <section className="acc-detail-section rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">House rules</h2>
        <ul className="profile-bullet-list">
          {property.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <section className="acc-detail-section rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Owner</h2>
        <p className="mb-1 text-[15px] font-semibold text-gray-900">{property.owner.name}</p>
        <p className="text-sm text-gray-500">★ {property.owner.rating.toFixed(1)}</p>
      </section>

      <div className="acc-detail-actions">
        <Link
          href={`/accommodation/book/${property.id}?mode=visit`}
          className="inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors disabled:opacity-60 px-4 py-2.5 text-sm border border-gray-200 bg-white text-gray-900 hover:bg-gray-50 w-full"
          style={{ textAlign: "center" }}
        >
          Book visit
        </Link>
        <Link
          href={`/accommodation/book/${property.id}?mode=move_in`}
          className="inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors disabled:opacity-60 px-4 py-2.5 text-sm bg-[var(--color-brand)] text-white hover:bg-blue-900 w-full"
          style={{ textAlign: "center" }}
        >
          Book now
        </Link>
        <a
          href={`tel:${property.owner.phone}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors disabled:opacity-60 px-4 py-2.5 text-sm border border-gray-200 bg-white text-gray-900 hover:bg-gray-50 w-full"
          style={{ textAlign: "center" }}
        >
          Call owner
        </a>
      </div>
    </div>
  );
}
