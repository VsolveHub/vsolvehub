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
};

export function HomeServiceSquareAddCard({
  href,
  name,
  priceLabel,
  categorySlug,
  serviceSlug,
  subCategorySlug,
}: Props) {
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
          <button className="sac-add-btn" onClick={(e) => e.preventDefault()}>
            +
          </button>
        </div>
      </div>
    </Link>
  );
}
