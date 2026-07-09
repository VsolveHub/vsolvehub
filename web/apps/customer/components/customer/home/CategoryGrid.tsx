import Link from "next/link";
import type { CSSProperties } from "react";
import { getCategoryTileMeta } from "@/lib/catalog/service-card-meta";
import { CategoryIcon } from "@/components/ui/CategoryIcon";

type Category = {
  slug: string;
  name: string;
  icon: string;
};

export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <div className="category-grid">
      {categories.map((cat) => {
        const { color } = getCategoryTileMeta(cat.slug);

        return (
          <Link
            key={cat.slug}
            href={`/services/${cat.slug}`}
            className="category-tile hover-lift glass-panel"
            style={{ "--cat-color": color, borderRadius: "16px" } as CSSProperties}
          >
            <span className="category-icon-wrap" aria-hidden>
              <CategoryIcon slug={cat.slug} name={cat.name} size={40} />
            </span>
            <span className="category-name">{cat.name}</span>
          </Link>
        );
      })}
    </div>
  );
}
