"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { ServiceDetailContent } from "@/lib/catalog/service-detail-content";
import { SERVICE_SLUG_TO_PROPERTY_TYPE } from "@/lib/accommodation/constants";
import { getVehicleFlowHref } from "@/lib/vehicle/constants";
import { ServiceShareButton } from "./ServiceShareButton";
import { SaveServiceButton } from "./SaveServiceButton";
import { ServiceSketchImage } from "@/components/ui/ServiceSketchImage";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { motion, AnimatePresence } from "framer-motion";

type Service = {
  id: string;
  name: string;
  slug: string;
  description: string;
  pricePaise: number;
  duration: number;
  archetype: string;
  unit: string;
  category: { slug: string; name: string; icon: string };
  subCategory?: { name: string; slug?: string } | null;
};

type Props = {
  service: Service;
  detail: ServiceDetailContent;
  shareUrl: string;
  isSaved: boolean;
  showSave: boolean;
};

const DUMMY_REVIEWS = [
  { id: 1, name: "Rahul Verma", location: "Hyderabad", time: "2 days ago", text: "The technician arrived on time and used the foam jet technology as described. My AC cooling has improved significantly. Very professional service.", initial: "R" },
  { id: 2, name: "Priya S.", location: "Hyderabad", time: "5 days ago", text: "Good value for money. The cleaning was very thorough. They even cleaned the mess around the AC after the service.", initial: "P" },
  { id: 3, name: "Kiran Kumar", location: "Hyderabad", time: "1 week ago", text: "The Foam-jet technique is way better than normal service. No mess at all since they use a specialized cleaning jacket.", initial: "K" }
];

const DUMMY_RELATED = [
  { id: 1, name: "AC repair", rating: "4.73", time: "Instant", price: 29900, image: "/ac_repair.jpg" },
  { id: 2, name: "AC installation", rating: "4.69", time: "Instant", price: 109900, image: "/ac_installation.jpg" },
  { id: 3, name: "Foam-jet service (2 ACs)", rating: "4.76", time: "Instant", price: 109800, image: "/ac_foam.jpg" },
  { id: 4, name: "AC uninstallation", rating: "4.80", time: "Instant", price: 69900, image: "/ac_uninstall.jpg" }
];

export function ServiceDetailView({ service, detail, shareUrl, isSaved, showSave }: Props) {
  const [inclusionsOpen, setInclusionsOpen] = useState(true);
  const [exclusionsOpen, setExclusionsOpen] = useState(false);

  const durationLabel =
    service.duration > 0
      ? service.unit === "day"
        ? "Full day"
        : service.unit === "night"
          ? "Per night"
          : `${Math.round(service.duration / 60)} hrs`
      : null;

  const isAccommodation = service.category.slug === "accommodation-services";
  const accType = SERVICE_SLUG_TO_PROPERTY_TYPE[service.slug];
  const accommodationHref = accType ? `/accommodation?type=${accType}` : "/accommodation";
  const vehicleHref = getVehicleFlowHref(service.slug);
  const bookHref = isAccommodation
    ? accommodationHref
    : vehicleHref ?? `/booking?serviceId=${service.id}`;
  const primaryBookLabel = isAccommodation
    ? "Browse stays"
    : vehicleHref
      ? "Start booking"
      : "Book now";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      
      {/* Breadcrumbs */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="mb-6">
        <div className="text-xs font-bold tracking-wider text-slate-400 uppercase flex items-center space-x-2">
          <Link href={`/services/${service.category.slug}`} className="hover:text-[#ea580c] transition-colors">
            {service.category.name}
          </Link>
          <span className="text-slate-300 font-normal">›</span>
          <span className="text-[#ea580c] font-black">{service.name}</span>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        
        {/* LEFT COLUMN: Unified Hero & Booking Sidebar Card (lg:col-span-5) */}
        <div className="lg:col-span-5 lg:sticky lg:top-24">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.04)] space-y-0"
          >
            {/* Visual Image Header */}
            <div className="relative aspect-[4/3] w-full bg-slate-50 border-b border-slate-100 group overflow-hidden">
              <span className="absolute top-3.5 left-3.5 z-10 bg-[#ea580c] text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-xs flex items-center gap-1">
                ⭐ Best Seller
              </span>
              <div className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500 flex items-center justify-center">
                <ServiceSketchImage
                  slug={service.slug}
                  subCategorySlug={service.subCategory?.slug}
                  categorySlug={service.category.slug}
                  serviceName={service.name}
                  variant="hero"
                  alt={service.name}
                />
              </div>
            </div>

            {/* Pricing & Booking Details Body */}
            <div className="p-5 sm:p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider block">Starts at</span>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-2xl sm:text-3xl font-black text-[#0b1c30]">
                      {formatPrice(service.pricePaise)}
                    </span>
                    {detail.originalPricePaise && (
                      <span className="text-sm font-bold text-slate-400 line-through">
                        {formatPrice(detail.originalPricePaise)}
                      </span>
                    )}
                  </div>
                  <span className="inline-block bg-[#fff7ed] border border-[#ffedd5] text-[#ea580c] text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    33% OFF • Limited Offer
                  </span>
                </div>

                {/* Saved & Share controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {showSave && (
                    <SaveServiceButton serviceId={service.id} initialSaved={isSaved} />
                  )}
                  <ServiceShareButton url={shareUrl} title={service.name} variant="button" />
                </div>
              </div>

              {/* Main Booking Action CTA */}
              <div>
                <Link href={bookHref} className="block w-full">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    type="button"
                    className="w-full py-3.5 bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#c2410c] hover:to-[#ea580c] text-white text-center rounded-xl font-extrabold text-sm shadow-md shadow-orange-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>{primaryBookLabel}</span>
                    <span>→</span>
                  </motion.button>
                </Link>
              </div>

              {/* Service Perks & Coverage */}
              <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs text-slate-600 font-medium">
                <div className="flex items-center gap-2.5">
                  <span className="text-[#ea580c] bg-[#fff7ed] p-1.5 rounded-lg shrink-0">
                    <FlaticonIcon name="shield-check" size={15} />
                  </span>
                  <span className="font-bold text-[#0b1c30]">VSolve Cover: 30 days warranty included</span>
                </div>
                {durationLabel && (
                  <div className="flex items-center gap-2.5">
                    <span className="text-[#ea580c] bg-[#fff7ed] p-1.5 rounded-lg shrink-0">
                      <FlaticonIcon name="clock" size={15} />
                    </span>
                    <span className="font-bold text-[#0b1c30]">Estimated Duration: {durationLabel}</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        {/* RIGHT COLUMN: Service Details, Inclusions & Reviews (lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* Main Info Header */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#0b1c30] tracking-tight leading-tight">
              {service.name}
            </h1>
            
            <div className="flex flex-wrap items-center gap-3">
              <span className="bg-[#fff7ed] text-[#ea580c] text-xs font-black px-3 py-1 rounded-full flex items-center gap-1 border border-[#ffedd5]">
                <span>★</span>
                <span>{detail.rating.toFixed(2)}</span>
              </span>
              <span className="text-xs font-bold text-slate-500">
                ({detail.reviewCountLabel} verified reviews & bookings)
              </span>
            </div>
            
            <p className="text-sm sm:text-base font-medium text-slate-600 leading-relaxed pt-1">
              {service.description}
            </p>
          </motion.div>

          {/* What's Included Accordions */}
          <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-4">
            <h2 className="text-lg sm:text-xl font-black text-[#0b1c30] tracking-tight">
              What's included in this service
            </h2>
            
            <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs bg-white divide-y divide-slate-100">
              
              {/* Inclusions Accordion */}
              <div>
                <button 
                  onClick={() => setInclusionsOpen(!inclusionsOpen)}
                  className={`w-full px-5 py-4 flex items-center justify-between text-left font-bold text-[#0b1c30] transition-colors cursor-pointer ${inclusionsOpen ? "bg-slate-50/60" : "hover:bg-slate-50"}`}
                >
                  <span className="text-sm font-bold">Service Inclusions</span>
                  <motion.span animate={{ rotate: inclusionsOpen ? 180 : 0 }} className="text-slate-400">
                    <FlaticonIcon name="angle-small-down" size={18} />
                  </motion.span>
                </button>
                
                <AnimatePresence>
                  {inclusionsOpen && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="px-5 pb-5 pt-2">
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {detail.covered.map((item) => (
                            <li key={item} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 font-semibold">
                              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-black shrink-0 mt-0.5 text-[9px]">✓</span>
                              <span>{item}</span>
                            </li>
                          ))}
                          <li className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 font-semibold">
                            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-black shrink-0 mt-0.5 text-[9px]">✓</span>
                            <span>Custom scope for {service.name}</span>
                          </li>
                          <li className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 font-semibold">
                            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-black shrink-0 mt-0.5 text-[9px]">✓</span>
                            <span>Consultation to define deliverables</span>
                          </li>
                          <li className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 font-semibold">
                            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-black shrink-0 mt-0.5 text-[9px]">✓</span>
                            <span>Matched professional or vendor</span>
                          </li>
                        </ul>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Exclusions Accordion */}
              {detail.notCovered.length > 0 && (
                <div>
                  <button 
                    onClick={() => setExclusionsOpen(!exclusionsOpen)}
                    className={`w-full px-5 py-4 flex items-center justify-between text-left font-bold text-[#0b1c30] transition-colors cursor-pointer ${exclusionsOpen ? "bg-slate-50/60" : "hover:bg-slate-50"}`}
                  >
                    <span className="text-sm font-bold">What is excluded</span>
                    <motion.span animate={{ rotate: exclusionsOpen ? 180 : 0 }} className="text-slate-400">
                      <FlaticonIcon name="angle-small-down" size={18} />
                    </motion.span>
                  </button>
                  
                  <AnimatePresence>
                    {exclusionsOpen && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="px-5 pb-5 pt-2">
                          <ul className="space-y-3">
                            {detail.notCovered.map((item) => (
                              <li key={item} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 font-semibold">
                                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-rose-100 text-rose-600 font-black shrink-0 mt-0.5 text-[9px]">✗</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              
            </div>
          </motion.section>

          {/* User Reviews Section */}
          <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-5">
            <div className="flex items-baseline justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg sm:text-xl font-black text-[#0b1c30] tracking-tight">
                User reviews and ratings
              </h2>
              <Link href="#" className="text-xs font-bold text-[#ea580c] hover:underline">
                View all reviews
              </Link>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left space-y-1">
                <span className="text-3xl font-black text-[#0b1c30]">★ {detail.rating.toFixed(2)}<span className="text-xl text-slate-400">/5</span></span>
                <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">based on {detail.reviewCountLabel} verified reviews</p>
              </div>
              <div className="h-px sm:h-12 w-full sm:w-px bg-slate-100" />
              <div className="text-center sm:text-right text-xs text-emerald-800 font-extrabold bg-emerald-50 border border-emerald-100 px-4 py-2.5 rounded-xl">
                ✓ 98.4% customers rate this service 5-stars
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {DUMMY_REVIEWS.map((rev) => (
                <div key={rev.id} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#fff7ed] text-[#ea580c] flex items-center justify-center font-black text-xs shrink-0">
                        {rev.initial}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-extrabold text-[#0b1c30]">{rev.name}</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{rev.location} • {rev.time}</span>
                      </div>
                    </div>
                    <span className="text-xs font-black text-amber-500 shrink-0">★★★★★</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 font-medium italic leading-relaxed">
                    "{rev.text}"
                  </p>
                </div>
              ))}
            </div>
          </motion.section>

        </div>
      </div>

      {/* BOTTOM SECTION: Related Services Grid */}
      <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-16 border-t border-slate-100 pt-10 space-y-6">
        <h2 className="text-xl font-black text-[#0b1c30] tracking-tight">Related services</h2>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {DUMMY_RELATED.map((rel) => (
            <Link href="#" key={rel.id} className="group block h-full">
              <motion.div whileHover={{ y: -3 }} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md transition-all duration-300 h-full">
                <div>
                  <div className="w-full aspect-[4/3] rounded-xl bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100 group-hover:bg-slate-100 transition-colors">
                    <span className="text-[#ea580c] group-hover:scale-110 transition-transform">
                      <FlaticonIcon name="bolt" size={28} />
                    </span>
                  </div>
                  
                  <h3 className="text-xs sm:text-sm font-bold text-[#0b1c30] mt-3 leading-snug line-clamp-2 group-hover:text-[#ea580c] transition-colors">
                    {rel.name}
                  </h3>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mt-1.5 block">
                    <span className="text-amber-500">★</span> {rel.rating} • {rel.time}
                  </span>
                </div>
                
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                  <span className="text-xs sm:text-sm font-black text-[#0b1c30]">{formatPrice(rel.price)}</span>
                  <span className="px-3 py-1 bg-slate-50 text-[#ea580c] border border-slate-200 rounded-lg text-xs font-extrabold group-hover:bg-[#ea580c] group-hover:text-white group-hover:border-[#ea580c] transition-all">
                    Book
                  </span>
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      </motion.section>

      {/* Sticky Mobile Action Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 p-3.5 px-4 flex items-center justify-between gap-4 lg:hidden shadow-[0_-5px_25px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Starts at</span>
          <span className="text-lg font-black text-[#0b1c30]">{formatPrice(service.pricePaise)}</span>
        </div>
        
        <div className="flex items-center gap-2">
          {showSave && (
            <SaveServiceButton serviceId={service.id} initialSaved={isSaved} />
          )}
          <Link 
            href={bookHref}
            className="px-6 py-2.5 bg-gradient-to-r from-[#ea580c] to-[#f97316] text-white text-xs font-extrabold rounded-xl shadow-md cursor-pointer"
          >
            {primaryBookLabel}
          </Link>
        </div>
      </div>
      
    </div>
  );
}
