"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export function HomeBottomCta() {
  return (
    <div className="w-full bg-[var(--color-brand)] text-white rounded-[32px] p-8 sm:p-12 text-center shadow-2xl relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
      <div className="relative z-10">
        <h2 className="text-3xl sm:text-4xl font-black leading-tight mb-4 tracking-tight">Ready to get started?</h2>
        <p className="text-base sm:text-lg text-white/80 font-medium mb-8 max-w-lg mx-auto">
          Browse 850+ doorstep services across Hyderabad &amp; Telangana.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/services" className="w-full sm:w-auto px-8 py-4 bg-white text-gray-900 rounded-2xl text-sm font-black shadow-lg hover:opacity-90 transition-opacity">
            Explore services
          </Link>
          <Link href="/booking/otp?redirect=/profile/bookings" className="w-full sm:w-auto px-8 py-4 bg-white/10 text-white border border-white/20 rounded-2xl text-sm font-black hover:bg-white/20 transition-colors">
            Track a booking
          </Link>
        </div>
      </div>
    </div>
  );
}
