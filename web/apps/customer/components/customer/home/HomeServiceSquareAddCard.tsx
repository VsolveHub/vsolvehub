"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
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
      <motion.div whileHover={{ y: -4 }} className="flex flex-col bg-white rounded-2xl border border-gray-150 overflow-hidden shadow-sm transition-shadow hover:shadow-md h-full">
        <div className="relative h-24 w-full bg-gray-50 overflow-hidden">
          <motion.div className="w-full h-full transition-transform duration-500 group-hover:scale-105">
            {imageUrl ? (
              <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              (() => {
                const fallbacks = [
                  "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=400&auto=format&fit=crop",
                  "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=400&auto=format&fit=crop",
                  "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=400&auto=format&fit=crop",
                  "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=400&auto=format&fit=crop",
                  "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?q=80&w=400&auto=format&fit=crop",
                  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=400&auto=format&fit=crop",
                  "https://images.unsplash.com/photo-1618220179428-22790b46a0eb?q=80&w=400&auto=format&fit=crop",
                  "https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=400&auto=format&fit=crop",
                  "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=400&auto=format&fit=crop",
                  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=400&auto=format&fit=crop"
                ];
                let nameSeed = 0;
                for (let i = 0; i < name.length; i++) {
                  nameSeed += name.charCodeAt(i);
                }
                const fallbackUrl = fallbacks[nameSeed % fallbacks.length];
                return <img src={fallbackUrl} alt={name} className="w-full h-full object-cover" />;
              })()
            )}
          </motion.div>
        </div>
        
        <div className="p-3 flex flex-col flex-1">
          <h3 className="text-xs font-bold text-gray-900 leading-tight mb-2 line-clamp-2 group-hover:text-[var(--color-brand)] transition-colors">{name}</h3>
          
          <div className="mt-auto pt-2 border-t border-gray-50 flex items-center justify-between">
            <span className="text-sm font-black text-gray-900">{priceLabel}</span>
            <motion.button 
              whileHover={{ scale: 1.1 }} 
              whileTap={{ scale: 0.9 }} 
              className="w-7 h-7 flex items-center justify-center bg-[var(--color-brand-light)] text-[var(--color-brand)] rounded-full font-bold text-lg hover:bg-[var(--color-brand)] hover:text-white transition-colors" 
              onClick={handleBook} 
              aria-label={`Book ${name}`}
            >
              +
            </motion.button>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
