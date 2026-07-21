"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { HERO_SLIDES } from "@/lib/catalog/display-catalog";
import { ServiceIcon } from "@/components/ui/ServiceIcons";
import { HeaderSearchIcon } from "@/components/ui/AppIcons";

type Category = { slug: string; name: string; icon: string };

export function HeroBanner({ categories = [] }: { categories?: Category[] }) {
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const slide = HERO_SLIDES[active];

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/services?q=${encodeURIComponent(q)}` : "/services");
  }

  return (
    <section className="relative w-full rounded-[32px] overflow-hidden bg-gradient-to-br from-[#081021] to-[#1e3a8a] text-white shadow-2xl mt-4">
      {/* Mobile & Tablet layout */}
      <div className="md:hidden flex flex-col p-6 h-[400px] relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col z-10"
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-brand-accent)] mb-2">Trusted pros · Same-day booking</p>
            <h2 className="text-3xl font-black leading-tight">
              {slide.title}
              <br />
              <span className="text-[var(--color-brand-accent)]">{slide.highlight}</span>
            </h2>
          </motion.div>
        </AnimatePresence>

        <div className="absolute bottom-10 right-6 opacity-30 pointer-events-none">
          <div className="w-32 h-32 rounded-full border border-white/20 flex items-center justify-center animate-[spin_10s_linear_infinite]">
            {slide.icons.map((icon, i) => (
              <span key={i} className="absolute w-8 h-8 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md" style={{ transform: `rotate(${i * (360 / slide.icons.length)}deg) translateY(-64px) rotate(-${i * (360 / slide.icons.length)}deg)` }}>
                <ServiceIcon name={icon} size={16} color="#ffffff" />
              </span>
            ))}
          </div>
        </div>

        <div className="absolute bottom-4 left-6 flex items-center gap-2 z-10">
          {HERO_SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`w-2 h-2 rounded-full transition-all ${i === active ? "bg-[var(--color-brand-accent)] w-6" : "bg-white/30"}`}
              onClick={() => setActive(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Desktop split layout */}
      <div className="hidden md:flex items-stretch min-h-[500px]">
        <div className="flex-[1.2] p-10 lg:p-14 xl:p-16 flex flex-col justify-center z-10 bg-[#0A1629]">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase mb-6 w-max border border-white/10">
            <span className="text-[var(--color-brand-accent)]">★</span> PREMIUM HOME SERVICES
          </motion.div>
          
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-5xl lg:text-[64px] font-black leading-[1.1] mb-6">
            Your Home,<br />
            <span className="text-[var(--color-brand-accent)]">Elevated.</span>
          </motion.h1>
          
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-[15px] lg:text-[17px] text-white/80 max-w-lg leading-relaxed mb-10">
            Experience professional excellence at your doorstep. From smart home installations to premium cleaning, we handle it all.
          </motion.p>
          
          <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex items-center gap-3 bg-white p-2 rounded-2xl max-w-xl shadow-xl w-full" onSubmit={handleSearch}>
            <span className="pl-4 text-gray-400"><HeaderSearchIcon /></span>
            <input 
              type="search" 
              placeholder='Search for "Smart Lock" or "Deep Clean"' 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-gray-900 placeholder-gray-500 text-sm font-semibold"
            />
            <button type="submit" className="bg-[#1D3557] text-white px-8 py-3.5 rounded-xl text-sm font-bold shadow-md hover:bg-opacity-90 transition-all">Search</button>
          </motion.form>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-10 flex items-center gap-6">
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="text-white/60">Trending:</span>
              <Link href="/services/smart-locks" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full transition-colors flex items-center gap-2 text-white/90">
                <span className="opacity-80">🔒</span> Smart Locks
              </Link>
              <Link href="/services/plumber" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full transition-colors flex items-center gap-2 text-white/90">
                <span className="opacity-80">🔧</span> Plumbers
              </Link>
              <Link href="/services/cleaning" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full transition-colors flex items-center gap-2 text-white/90">
                <span className="opacity-80">🧹</span> Cleaning
              </Link>
            </div>
          </motion.div>
        </div>

        <div className="flex-1 relative overflow-hidden bg-[#0A1629]">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.id}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0"
            >
              <img src="https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=800&auto=format&fit=crop" alt="Service" className="w-full h-full object-cover object-center" />
            </motion.div>
          </AnimatePresence>
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#0A1629] to-transparent z-10" />
        </div>
      </div>
    </section>
  );
}
