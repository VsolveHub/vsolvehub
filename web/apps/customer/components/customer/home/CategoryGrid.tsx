import Link from "next/link";
import type { CSSProperties } from "react";
import { getCategoryTileMeta } from "@/lib/catalog/service-card-meta";
import { CategoryIcon } from "@/components/ui/CategoryIcon";

type Category = {
  slug: string;
  name: string;
  icon: string;
};

/**
 * Primary category access for the home page — a tap target per category with a
 * per-category accent so the grid reads as a colour-coded map, not a wall of
 * identical tiles.
 */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-6 lg:grid-cols-8">
      {categories.map((cat) => {
        const { color } = getCategoryTileMeta(cat.slug);

        return (
          <Link
            key={cat.slug}
            href={`/services/${cat.slug}`}
            style={{ "--cat-color": color } as CSSProperties}
            className="group flex flex-col items-center gap-2.5 rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm transition-all hover:-translate-y-1 hover:border-[color:var(--cat-color)] hover:shadow-md"
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl transition-colors"
              style={{ backgroundColor: `${color}14` }}
              aria-hidden
            >
              <CategoryIcon slug={cat.slug} name={cat.name} size={30} />
            </span>
            <span className="text-[11px] font-bold leading-tight text-gray-700 group-hover:text-gray-900 sm:text-xs">
              {cat.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
