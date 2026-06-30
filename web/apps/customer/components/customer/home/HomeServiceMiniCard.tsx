import Link from "next/link";
import type { CSSProperties } from "react";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { getCategoryTileMeta } from "@/lib/catalog/service-card-meta";

type Props = {
  href: string;
  name: string;
  priceLabel: string;
  categorySlug: string;
  categoryIcon: string;
};

export function HomeServiceMiniCard({
  href,
  name,
  priceLabel,
  categorySlug,
  categoryIcon,
}: Props) {
  const { color } = getCategoryTileMeta(categorySlug);

  return (
    <Link
      href={href}
      className="popular-mini-card"
      style={{ "--cat-color": color } as CSSProperties}
    >
      <span className="popular-mini-card-icon" aria-hidden>
        <CategoryIcon slug={categorySlug} icon={categoryIcon} size={22} color={color} />
      </span>
      <div className="popular-mini-card-body">
        <h3>{name}</h3>
        <p>{priceLabel}</p>
      </div>
    </Link>
  );
}
