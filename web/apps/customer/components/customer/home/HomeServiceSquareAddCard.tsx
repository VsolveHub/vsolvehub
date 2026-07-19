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
  serviceId?: string;
  pricePaise?: number;
  unit?: string | null;
};

export function HomeServiceSquareAddCard({
  href,
  name,
  priceLabel,
  categorySlug,
  serviceSlug,
  subCategorySlug,
  serviceId,
}: Props) {
  const router = useRouter();

  // One service per booking: go straight into the booking flow for this service.
  function handleBook(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    router.push(serviceId ? `/booking?serviceId=${serviceId}` : href);
  }

  return (
    <Link href={href} className="square-add-card">
      <div className="sac-image-wrapper">
        <ServiceSketchImage
          slug={serviceSlug}
          subCategorySlug={subCategorySlug}
          categorySlug={categorySlug}
          serviceName={name}
          variant="hero"
          alt={name}
        />
      </div>
      
      <div className="sac-content">
        <h3 className="sac-title">{name}</h3>
        
        <div className="sac-footer">
          <span className="sac-price">{priceLabel}</span>
          <button className="sac-add-btn" onClick={handleBook} aria-label={`Book ${name}`}>
            +
          </button>
        </div>
      </div>
    </Link>
  );
}
