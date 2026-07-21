"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HOME_TESTIMONIALS } from "@/lib/catalog/display-catalog";

export function HomeTestimonials() {
  const [active, setActive] = useState(0);
  const testimonial = HOME_TESTIMONIALS[active];

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % HOME_TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full" aria-labelledby="home-reviews-heading">
      <h2 id="home-reviews-heading" className="text-2xl font-black text-gray-900 tracking-tight mb-8 text-center">
        What customers say
      </h2>
      
      <div className="relative w-full max-w-2xl mx-auto min-h-[220px]">
        <AnimatePresence mode="wait">
          <motion.blockquote
            key={testimonial.author}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center text-center bg-white rounded-3xl p-8 shadow-sm border border-gray-100 absolute inset-0"
          >
            <div className="text-[var(--color-brand-accent)] text-lg mb-4" aria-hidden>
              {"★".repeat(testimonial.rating)}
              {"☆".repeat(5 - testimonial.rating)}
            </div>
            <p className="text-lg font-medium text-gray-700 italic leading-relaxed mb-6">&ldquo;{testimonial.quote}&rdquo;</p>
            <footer className="flex items-center justify-center gap-4 mt-auto">
              {testimonial.avatar && (
                <img src={testimonial.avatar} alt={testimonial.author} className="w-10 h-10 rounded-full object-cover shadow-sm" />
              )}
              <div className="flex flex-col text-left">
                <strong className="text-sm font-black text-gray-900">{testimonial.author}</strong>
                <span className="text-xs font-semibold text-gray-500">{testimonial.city}</span>
              </div>
            </footer>
          </motion.blockquote>
        </AnimatePresence>
      </div>

      <div className="flex justify-center gap-2 mt-8">
        {HOME_TESTIMONIALS.map((t, i) => (
          <button
            key={t.author}
            type="button"
            className={`h-2 rounded-full transition-all ${i === active ? "w-6 bg-[var(--color-brand)]" : "w-2 bg-gray-300"}`}
            onClick={() => setActive(i)}
            aria-label={`Show review from ${t.author}`}
          />
        ))}
      </div>
    </div>
  );
}
