import Link from "next/link";
import type { CSSProperties } from "react";
import { CategoryIcon } from "@/components/ui/CategoryIcon";

type Category = {
  slug: string;
  name: string;
  icon: string;
};

/**
 * Primary category access for the home page — large, airy tiles with a
 * lavender icon container and name below. Matches the premium card design.
 */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
      {categories.map((cat) => (
        <Link
          key={cat.slug}
          href={`/services/${cat.slug}`}
          className="group flex flex-col items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-8 text-center shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
        >
          <span
            className="flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-50 transition-colors group-hover:bg-indigo-100"
            aria-hidden
          >
            <CategoryIcon slug={cat.slug} name={cat.name} size={40} />
          </span>
          <span className="text-sm font-semibold leading-snug text-gray-800 group-hover:text-gray-900">
            {cat.name}
          </span>
        </Link>
      ))}
    </div>
  );
}
