import Link from "next/link";
import type { CSSProperties } from "react";
import { getCategoryTileMeta } from "@/lib/catalog/service-card-meta";
import { ServiceSketchImage } from "@/components/ui/ServiceSketchImage";

type Props = {
  href: string;
  name: string;
  priceLabel: string;
  categorySlug: string;
  serviceSlug: string;
  subCategorySlug?: string;
};

export function HomeServiceMiniCard({
  href,
  name,
  priceLabel,
  categorySlug,
  serviceSlug,
  subCategorySlug,
}: Props) {
  const { color } = getCategoryTileMeta(categorySlug);

  return (
    <Link
      href={href}
      className="popular-mini-card hover-lift premium-card"
      style={{ "--cat-color": color } as CSSProperties}
    >
      <span className="popular-mini-card-sketch" aria-hidden>
        <ServiceSketchImage
          slug={serviceSlug}
          subCategorySlug={subCategorySlug}
          categorySlug={categorySlug}
          serviceName={name}
          variant="hero"
          alt={name}
        />
      </span>
      <div className="popular-mini-card-body">
        <h3>{name}</h3>
        <p>{priceLabel}</p>
      </div>
    </Link>
  );
}
