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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:py-12">
      
      {/* Breadcrumbs */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="mb-6">
        <div className="text-[10px] sm:text-xs font-bold tracking-widest text-gray-400 uppercase flex items-center space-x-2">
          <Link href={`/services/${service.category.slug}`} className="hover:text-[var(--color-brand)] transition-colors">
            {service.category.name}
          </Link>
          <span className="text-gray-300 font-normal">›</span>
          <span className="text-[var(--color-brand)]">{service.name}</span>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        
        {/* LEFT COLUMN: Image & Pricing Hub (lg:col-span-5) */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
          
          {/* Main Visual Image Card */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative aspect-[4/3] w-full rounded-3xl overflow-hidden border border-gray-150 shadow-md bg-slate-50 group">
            <span className="absolute top-4 left-4 z-10 bg-[var(--color-brand-accent)] text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg shadow-sm">
              ⭐ Best Seller
            </span>
            <div className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700 flex items-center justify-center overflow-hidden">
              <ServiceSketchImage
                slug={service.slug}
                subCategorySlug={service.subCategory?.slug}
                categorySlug={service.category.slug}
                serviceName={service.name}
                variant="hero"
                alt={service.name}
              />
            </div>
          </motion.div>

          {/* Pricing & Booking Action Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white border border-gray-150 rounded-[32px] p-6 shadow-sm space-y-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <div className="flex items-baseline space-x-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Starts at</span>
                    <span className="text-3xl font-black text-gray-900 mt-1">
                      {formatPrice(service.pricePaise)}
                    </span>
                  </div>
                  {detail.originalPricePaise && (
                    <span className="text-base font-bold text-gray-400 line-through">
                      {formatPrice(detail.originalPricePaise)}
                    </span>
                  )}
                </div>
                <div className="inline-block bg-[var(--color-brand-light)] border border-[var(--color-brand)]/20 text-[var(--color-brand)] text-[10px] font-black px-3 py-1 rounded-md uppercase tracking-widest">
                  33% OFF • Limited Offer
                </div>
              </div>

              {/* Saved & Share controls */}
              <div className="flex items-center space-x-2">
                {showSave && (
                  <SaveServiceButton serviceId={service.id} initialSaved={isSaved} />
                )}
                <ServiceShareButton url={shareUrl} title={service.name} />
              </div>
            </div>

            {/* CTAs */}
            <div className="space-y-3 pt-3">
              <Link
                href={bookHref}
              >
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full py-4 bg-[var(--color-brand)] text-white text-center rounded-2xl font-black text-sm shadow-lg hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center">
                  {primaryBookLabel}
                </motion.div>
              </Link>
            </div>

            {/* Perks details */}
            <div className="border-t border-gray-100 pt-5 space-y-3 text-xs text-gray-600">
              <div className="flex items-center space-x-3">
                <span className="text-[var(--color-brand-accent)] bg-orange-50 p-1.5 rounded-lg">
                  <FlaticonIcon name="shield-check" size={16} />
                </span>
                <span className="font-bold text-gray-700">VSolve Cover: 30 days warranty included</span>
              </div>
              {durationLabel && (
                <div className="flex items-center space-x-3">
                  <span className="text-[var(--color-brand)] bg-[var(--color-brand-light)] p-1.5 rounded-lg">
                    <FlaticonIcon name="clock" size={16} />
                  </span>
                  <span className="font-bold text-gray-700">Estimated Duration: {durationLabel}</span>
                </div>
              )}
            </div>
          </motion.div>
          
        </div>

        {/* RIGHT COLUMN: Service Details, Inclusions & Reviews (lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-10 sm:space-y-12">
          
          {/* Main Info Header */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 tracking-tight leading-tight">
              {service.name}
            </h1>
            
            <div className="flex flex-wrap items-center gap-3">
              <span className="bg-orange-50 text-orange-700 text-xs font-black px-3 py-1.5 rounded-full flex items-center space-x-1.5 border border-orange-100/50">
                <span className="text-orange-600">★</span>
                <span>{detail.rating.toFixed(2)}</span>
              </span>
              <span className="text-xs font-bold text-gray-500">
                ({detail.reviewCountLabel} verified reviews & bookings)
              </span>
            </div>
            
            <p className="text-sm sm:text-base font-medium text-gray-600 leading-relaxed pt-2">
              {service.description}
            </p>
          </motion.div>

          {/* What's Included Accordions */}
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-5">
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
              What's included in this service
            </h2>
            
            <div className="border border-gray-150 rounded-[32px] overflow-hidden shadow-sm bg-white divide-y divide-gray-100">
              
              {/* Inclusions Accordion */}
              <div>
                <button 
                  onClick={() => setInclusionsOpen(!inclusionsOpen)}
                  className={`w-full px-6 py-5 flex items-center justify-between text-left font-bold text-gray-900 transition-colors ${inclusionsOpen ? "bg-gray-50/50" : "hover:bg-gray-50"}`}
                >
                  <span className="text-sm sm:text-base">Service Inclusions</span>
                  <motion.span animate={{ rotate: inclusionsOpen ? 180 : 0 }} className="text-gray-400">
                    <FlaticonIcon name="angle-small-down" size={20} />
                  </motion.span>
                </button>
                
                <AnimatePresence>
                  {inclusionsOpen && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="px-6 pb-6 pt-2">
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {detail.covered.map((item) => (
                            <li key={item} className="flex items-start space-x-3 text-sm text-gray-600 font-medium">
                              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600 font-black mt-0.5 text-[10px]">✓</span>
                              <span>{item}</span>
                            </li>
                          ))}
                          <li className="flex items-start space-x-3 text-sm text-gray-600 font-medium">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600 font-black mt-0.5 text-[10px]">✓</span>
                            <span>Custom scope for {service.name}</span>
                          </li>
                          <li className="flex items-start space-x-3 text-sm text-gray-600 font-medium">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600 font-black mt-0.5 text-[10px]">✓</span>
                            <span>Consultation to define deliverables</span>
                          </li>
                          <li className="flex items-start space-x-3 text-sm text-gray-600 font-medium">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600 font-black mt-0.5 text-[10px]">✓</span>
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
                    className={`w-full px-6 py-5 flex items-center justify-between text-left font-bold text-gray-900 transition-colors ${exclusionsOpen ? "bg-gray-50/50" : "hover:bg-gray-50"}`}
                  >
                    <span className="text-sm sm:text-base">What is excluded</span>
                    <motion.span animate={{ rotate: exclusionsOpen ? 180 : 0 }} className="text-gray-400">
                      <FlaticonIcon name="angle-small-down" size={20} />
                    </motion.span>
                  </button>
                  
                  <AnimatePresence>
                    {exclusionsOpen && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="px-6 pb-6 pt-2">
                          <ul className="space-y-4">
                            {detail.notCovered.map((item) => (
                              <li key={item} className="flex items-start space-x-3 text-sm text-gray-600 font-medium">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600 font-black mt-0.5 text-[10px]">✗</span>
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
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-6">
            <div className="flex items-baseline justify-between border-b border-gray-150 pb-4">
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                User reviews and ratings
              </h2>
              <Link href="#" className="text-xs font-bold text-[var(--color-brand)] hover:underline">
                View all reviews
              </Link>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-150 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="text-center sm:text-left space-y-2">
                <span className="text-4xl font-black text-gray-900">★ {detail.rating.toFixed(2)}<span className="text-2xl text-gray-400">/5</span></span>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">based on {detail.reviewCountLabel} verified reviews</p>
              </div>
              <div className="h-px sm:h-16 w-full sm:w-px bg-gray-150" />
              <div className="text-center sm:text-right text-xs text-green-700 font-bold bg-green-50 border border-green-100 px-5 py-3 rounded-xl shadow-sm">
                ✓ 98.4% customers rate this service 5-stars
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {DUMMY_REVIEWS.map((rev) => (
                <div key={rev.id} className="bg-white p-6 rounded-[24px] border border-gray-150 shadow-sm flex flex-col justify-between space-y-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-[var(--color-brand-light)] text-[var(--color-brand)] flex items-center justify-center font-black text-sm">
                        {rev.initial}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-900">{rev.name}</span>
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{rev.location} • {rev.time}</span>
                      </div>
                    </div>
                    <span className="text-sm font-black text-[var(--color-brand-accent)]">★★★★★</span>
                  </div>
                  <p className="text-sm text-gray-600 font-medium italic leading-relaxed">
                    "{rev.text}"
                  </p>
                </div>
              ))}
            </div>
          </motion.section>

        </div>
      </div>

      {/* BOTTOM SECTION: Related Services Grid */}
      <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-20 border-t border-gray-150 pt-12 space-y-8">
        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Related services</h2>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
          {DUMMY_RELATED.map((rel) => (
            <Link href="#" key={rel.id} className="group block h-full">
              <motion.div whileHover={{ y: -4 }} className="bg-white p-4 rounded-3xl border border-gray-150 shadow-sm flex flex-col justify-between hover:shadow-lg transition-all duration-300 h-full">
                <div>
                  <div className="w-full aspect-[4/3] rounded-2xl bg-gray-50 flex items-center justify-center overflow-hidden border border-gray-100 group-hover:bg-gray-100 transition-colors">
                    <span className="text-[var(--color-brand)] group-hover:scale-110 transition-transform">
                      <FlaticonIcon name="bolt" size={32} />
                    </span>
                  </div>
                  
                  <h3 className="text-sm font-bold text-gray-900 mt-4 leading-snug line-clamp-2 group-hover:text-[var(--color-brand)] transition-colors">
                    {rel.name}
                  </h3>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2 block">
                    <span className="text-[var(--color-brand-accent)]">★</span> {rel.rating} • {rel.time}
                  </span>
                </div>
                
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-50">
                  <span className="text-sm font-black text-gray-900">{formatPrice(rel.price)}</span>
                  <span className="px-4 py-2 bg-gray-50 text-[var(--color-brand)] border border-gray-200 rounded-xl text-xs font-black group-hover:bg-[var(--color-brand)] group-hover:text-white group-hover:border-[var(--color-brand)] transition-all">
                    Book
                  </span>
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      </motion.section>

      {/* Sticky Mobile Action Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-xl border-t border-gray-150 p-4 pb-8 flex items-center justify-between gap-4 lg:hidden shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Starts at</span>
          <span className="text-xl font-black text-gray-900 mt-0.5">{formatPrice(service.pricePaise)}</span>
        </div>
        
        <div className="flex items-center space-x-3">
          {showSave && (
            <SaveServiceButton serviceId={service.id} initialSaved={isSaved} />
          )}
          <Link 
            href={bookHref}
            className="px-8 py-3 bg-[var(--color-brand)] text-white text-sm font-black rounded-xl shadow-lg cursor-pointer"
          >
            {primaryBookLabel}
          </Link>
        </div>
      </div>
      
    </div>
  );
}
