"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { HomeTestimonial } from "@/lib/catalog/queries";

export function HomeTestimonials({ testimonials }: { testimonials: HomeTestimonial[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (testimonials.length <= 1) return;
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [testimonials.length]);

  // No real reviews yet — show nothing rather than invented quotes.
  if (testimonials.length === 0) return null;

  const testimonial = testimonials[active];
  const rating = Math.min(5, Math.max(1, testimonial.rating));

  return (
    <div className="w-full" aria-labelledby="home-reviews-heading">
      <h2 id="home-reviews-heading" className="text-2xl font-black text-gray-900 tracking-tight mb-8 text-center">
        What customers say
      </h2>

      <div className="relative w-full max-w-2xl mx-auto min-h-[220px]">
        <AnimatePresence mode="wait">
          <motion.blockquote
            key={testimonial.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center text-center bg-white rounded-3xl p-8 shadow-sm border border-gray-100 absolute inset-0"
          >
            <div className="text-[var(--color-brand-accent)] text-lg mb-4" aria-label={`${rating} out of 5 stars`}>
              {"★".repeat(rating)}
              {"☆".repeat(5 - rating)}
            </div>
            <p className="text-lg font-medium text-gray-700 italic leading-relaxed mb-6">&ldquo;{testimonial.quote}&rdquo;</p>
            <footer className="flex items-center justify-center gap-4 mt-auto">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-light)] text-sm font-black text-[var(--color-brand)] shadow-sm"
                aria-hidden
              >
                {testimonial.author.charAt(0).toUpperCase()}
              </span>
              <div className="flex flex-col text-left">
                <strong className="text-sm font-black text-gray-900">{testimonial.author}</strong>
                {testimonial.city && <span className="text-xs font-semibold text-gray-500">{testimonial.city}</span>}
              </div>
            </footer>
          </motion.blockquote>
        </AnimatePresence>
      </div>

      {testimonials.length > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {testimonials.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={`h-2 rounded-full transition-all ${i === active ? "w-6 bg-[var(--color-brand)]" : "w-2 bg-gray-300"}`}
              onClick={() => setActive(i)}
              aria-label={`Show review from ${t.author}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
