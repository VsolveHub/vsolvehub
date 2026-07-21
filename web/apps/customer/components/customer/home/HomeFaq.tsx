"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HOME_FAQ } from "@/lib/catalog/display-catalog";

export function HomeFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="w-full" aria-labelledby="home-faq-heading">
      <div className="flex items-center justify-between mb-8">
        <h2 id="home-faq-heading" className="text-2xl font-black text-gray-900 tracking-tight">
          Frequently asked questions
        </h2>
        <Link href="/profile/help" className="text-sm font-bold text-[var(--color-brand)] hover:underline">
          View all →
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {HOME_FAQ.map((item, index) => {
          const isOpen = openIndex === index;

          return (
            <div key={item.question} className={`rounded-2xl border ${isOpen ? "border-[var(--color-brand)] bg-[var(--color-brand-light)]/30" : "border-gray-150 bg-white"} overflow-hidden transition-colors`}>
              <button
                type="button"
                className="w-full flex items-center justify-between p-5 text-left font-bold text-gray-900 text-sm focus:outline-none"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                aria-expanded={isOpen}
              >
                <span>{item.question}</span>
                <ChevronIcon open={isOpen} />
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <p className="px-5 pb-5 text-sm text-gray-600 font-medium leading-relaxed">
                      {item.answer}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <motion.svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      animate={{ rotate: open ? 180 : 0 }}
      transition={{ duration: 0.2 }}
      className="text-gray-400 shrink-0"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </motion.svg>
  );
}
