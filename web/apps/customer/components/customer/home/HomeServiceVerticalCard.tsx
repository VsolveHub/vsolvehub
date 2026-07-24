"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

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
  imageUrl?: string | null;
};

const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1618220179428-22790b46a0eb?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=400&auto=format&fit=crop",
];

function fallbackFor(name: string) {
  let seed = 0;
  for (let i = 0; i < name.length; i++) seed += name.charCodeAt(i);
  return FALLBACK_IMAGES[seed % FALLBACK_IMAGES.length];
}

export function HomeServiceVerticalCard({
  href,
  name,
  priceLabel,
  badge,
  serviceId,
  imageUrl,
}: Props) {
  const router = useRouter();
  const imgSrc = imageUrl && imageUrl.trim() !== "" ? imageUrl : fallbackFor(name);

  function handleBook(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    router.push(serviceId ? `/booking?serviceId=${serviceId}` : href);
  }

  return (
    <Link href={href} className="group block h-full">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[24px] border border-gray-150 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[var(--color-brand)]/5">
        <div className="relative h-[150px] w-full overflow-hidden bg-gray-50">
          {badge && (
            <span className="absolute left-3 top-3 z-10 rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-gray-900 shadow-sm">
              {badge}
            </span>
          )}
          <Image
            src={imgSrc}
            alt={name}
            fill
            sizes="(max-width: 768px) 50vw, 20vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>

        <div className="relative z-10 flex flex-1 flex-col p-4">
          <h3 className="mb-2 line-clamp-2 text-sm font-bold leading-snug text-gray-900 transition-colors group-hover:text-[var(--color-brand)]">
            {name}
          </h3>

          <div className="mb-4 mt-auto flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-success)]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
              <path
                fillRule="evenodd"
                d="M10 1.5 3 4.5v4.9c0 4.3 2.98 7.9 7 8.6 4.02-.7 7-4.3 7-8.6V4.5L10 1.5Zm3.36 6.14-4 4a.75.75 0 0 1-1.06 0l-2-2a.75.75 0 1 1 1.06-1.06l1.47 1.47 3.47-3.47a.75.75 0 1 1 1.06 1.06Z"
                clipRule="evenodd"
              />
            </svg>
            Verified pros
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-gray-50 pt-3">
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Starts at
              </span>
              <span className="text-sm font-black text-gray-900">{priceLabel}</span>
            </div>
            <button
              type="button"
              className="rounded-xl bg-[var(--color-brand)] px-5 py-2 text-xs font-black text-white shadow-md transition-all duration-200 hover:bg-blue-900 hover:scale-105 active:scale-95"
              onClick={handleBook}
            >
              Book
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}
