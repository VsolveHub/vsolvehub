"use client";

import Link from "next/link";
import { ServiceSketchImage } from "@/components/ui/ServiceSketchImage";

type Props = {
  href: string;
  name: string;
  priceLabel: string;
  categorySlug: string;
  serviceSlug: string;
  subCategorySlug?: string;
  badge?: string;
};

export function HomeServiceVerticalCard({
  href,
  name,
  priceLabel,
  categorySlug,
  serviceSlug,
  subCategorySlug,
  badge,
}: Props) {
  // Use deterministic dummy ratings so SSR matches Client to prevent hydration errors
  const seed = name.length;
  const dummyRating = (4.5 + (seed % 6) * 0.08).toFixed(2);
  const dummyBookings = 10 + (seed * 3 % 40);
  // Extract number from priceLabel (e.g. "₹599")
  const numericPrice = priceLabel.replace(/[^0-9]/g, '');
  const oldPrice = numericPrice ? `₹${Math.floor(parseInt(numericPrice) * 1.3)}` : '';

  return (
    <Link href={href} className="vertical-service-card">
      <div className="vsc-image-wrapper">
        {badge && <span className="vsc-badge">{badge}</span>}
        <ServiceSketchImage
          slug={serviceSlug}
          subCategorySlug={subCategorySlug}
          categorySlug={categorySlug}
          serviceName={name}
          variant="hero"
          alt={name}
        />
      </div>
      
      <div className="vsc-content">
        <h3 className="vsc-title">{name}</h3>
        
        <div className="vsc-rating-row">
          <span className="vsc-star">★</span>
          <span className="vsc-rating">{dummyRating}</span>
          <span className="vsc-bookings">({dummyBookings}k+ bookings)</span>
        </div>
        
        <div className="vsc-footer">
          <div className="vsc-price-col">
            <span className="vsc-price">{priceLabel}</span>
            {oldPrice && <span className="vsc-old-price">{oldPrice}</span>}
          </div>
          <button className="vsc-add-btn" onClick={(e) => e.preventDefault()}>Add</button>
        </div>
      </div>
    </Link>
  );
}
