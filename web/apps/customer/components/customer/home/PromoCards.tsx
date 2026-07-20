"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";


export function PromoCard({ card }: { card: any }) {
  const badge = card.badge;
  const image = card.imageUrl;
  const subtitle = card.subtitle;

  return (
    <Link href={card.href} className="block relative w-full h-[240px] shrink-0 rounded-[28px] overflow-hidden shadow-md group">
      <motion.div whileHover={{ scale: 1.02 }} className="w-full h-full relative">
        <Image
          src={image || "/ac_illustration.jpg"}
          alt={card.title}
          fill
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A1629]/90 via-[#0A1629]/60 to-transparent" />
        
        {badge && (
          <span className={`absolute top-4 left-4 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full text-white backdrop-blur-md shadow-sm ${badge.color === 'pink' ? 'bg-pink-500/80' : 'bg-blue-500/80'}`}>
            {badge.text}
          </span>
        )}

        <div className="absolute inset-0 p-6 text-white flex flex-col justify-center w-[75%] gap-2">
          <h3 className="text-xl sm:text-2xl font-black leading-tight tracking-tight">{card.title}</h3>
          <p className="text-xs sm:text-sm text-white/80 font-medium line-clamp-2">{subtitle || "Premium services at your home"}</p>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} type="button" className="mt-4 w-max text-[13px] font-black bg-yellow-400 text-gray-900 px-6 py-2.5 rounded-xl shadow-md cursor-pointer hover:bg-yellow-300 transition-colors">
            Book now
          </motion.button>
        </div>
      </motion.div>
    </Link>
  );
}

export function PromoCards({ promos }: { promos: any[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {promos.map((card) => (
        <PromoCard key={card.id} card={card} />
      ))}
    </div>
  );
}
