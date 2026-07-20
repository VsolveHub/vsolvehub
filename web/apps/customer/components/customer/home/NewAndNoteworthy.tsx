"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

export function NewAndNoteworthy({ services }: { services: any[] }) {
  return (
    <div className="flex overflow-x-auto gap-4 pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory hide-scrollbar">
        {services.map((item, index) => {
          // Provide some realistic fallbacks if DB image is null
          const fallbacks = [
            "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=400&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=400&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=400&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=400&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?q=80&w=400&auto=format&fit=crop"
          ];
          const imgSrc = item.imageUrl && item.imageUrl.trim() !== "" ? item.imageUrl : fallbacks[index % fallbacks.length];

          return (
            <Link key={item.id} href={`/services/${item.category?.slug}/${item.slug}`} className="group min-w-[140px] max-w-[140px] sm:min-w-[160px] sm:max-w-[160px] snap-start shrink-0">
              <motion.div whileHover={{ y: -5 }} className="flex flex-col gap-3">
                <div className="w-full aspect-square rounded-[24px] overflow-hidden bg-gray-100 relative shadow-sm">
                  <Image 
                    src={imgSrc} 
                    alt={item.name} 
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105" 
                  />
                </div>
                <div className="flex flex-col gap-1 px-1">
                  <h3 className="text-[15px] font-black text-gray-900 leading-snug group-hover:text-[var(--color-brand)] transition-colors">{item.name}</h3>
                  <p className="text-[11px] text-gray-500 font-medium leading-tight line-clamp-2">{item.description}</p>
                </div>
              </motion.div>
            </Link>
          );
        })}
    </div>
  );
}
