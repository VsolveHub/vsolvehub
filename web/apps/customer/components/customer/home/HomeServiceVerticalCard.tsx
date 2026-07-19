"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ServiceSketchImage } from "@/components/ui/ServiceSketchImage";

type Props = {
  href: string;
  name: string;
  priceLabel: string;
  categorySlug: string;
  serviceSlug: string;
  subCategorySlug?: string;
  badge?: string;
  serviceId?: string;
  pricePaise?: number;
  unit?: string | null;
};

export function HomeServiceVerticalCard({
  href,
  name,
  priceLabel,
  categorySlug,
  serviceSlug,
  subCategorySlug,
  badge,
  serviceId,
}: Props) {
  const router = useRouter();

  // One service per booking: jump straight into the booking flow for this
  // service (the card itself still links to the service detail page).
  function handleBook(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    router.push(serviceId ? `/booking?serviceId=${serviceId}` : href);
  }
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
          <button className="vsc-add-btn" onClick={handleBook}>
            Book
          </button>
        </div>
      </div>
    </Link>
  );
}
