"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { serviceImageSrc } from "@/lib/catalog/service-sketch-illustrations";

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
  imageUrl?: string | null;
};

export function HomeServiceSquareAddCard({
  href,
  name,
  priceLabel,
  categorySlug,
  serviceSlug,
  subCategorySlug,
  serviceId,
  imageUrl,
}: Props) {
  const router = useRouter();

  function handleBook(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    router.push(serviceId ? `/booking?serviceId=${serviceId}` : href);
  }

  return (
    <Link href={href} className="block group">
      <div className="flex flex-col bg-white rounded-2xl border border-gray-150 overflow-hidden shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md h-full">
        <div className="relative h-24 w-full bg-gray-50 overflow-hidden">
          <div className="w-full h-full transition-transform duration-500 group-hover:scale-105">
            <Image
              src={serviceImageSrc({ imageUrl, slug: serviceSlug, subCategorySlug, categorySlug, serviceName: name })}
              alt={name}
              fill
              sizes="(max-width: 768px) 33vw, 12vw"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
        
        <div className="p-3 flex flex-col flex-1">
          <h3 className="text-xs font-bold text-gray-900 leading-tight mb-2 line-clamp-2 group-hover:text-[var(--color-brand)] transition-colors">{name}</h3>
          
          <div className="mt-auto pt-2 border-t border-gray-50 flex items-center justify-between">
            <span className="text-sm font-black text-gray-900">{priceLabel}</span>
            <button 
              type="button"
              className="w-7 h-7 flex items-center justify-center bg-[var(--color-brand-light)] text-[var(--color-brand)] rounded-full font-bold text-lg hover:bg-[var(--color-brand)] hover:text-white transition-all duration-200 hover:scale-110 active:scale-90" 
              onClick={handleBook} 
              aria-label={`Book ${name}`}
            >
              +
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}
