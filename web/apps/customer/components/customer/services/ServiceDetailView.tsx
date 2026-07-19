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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12 animate-fade-in">
      
      {/* Breadcrumbs */}
      <div className="mb-6">
        <div className="text-[10px] sm:text-xs font-bold tracking-widest text-gray-400 uppercase flex items-center space-x-2">
          <Link href={`/services/${service.category.slug}`} className="hover:text-gray-800 transition-colors">
            {service.category.name}
          </Link>
          <span className="text-gray-300 font-normal">›</span>
          <span className="text-amber-800/80">{service.name}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        
        {/* LEFT COLUMN: Image & Pricing Hub (lg:col-span-5) */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
          
          {/* Main Visual Image Card */}
          <div className="relative aspect-[4/3] w-full rounded-3xl overflow-hidden border border-gray-100 shadow-md bg-slate-50 group">
            <span className="absolute top-4 left-4 z-10 bg-orange-500 text-white text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-md shadow-sm">
              ⭐ Best Seller
            </span>
            <div className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 flex items-center justify-center overflow-hidden">
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

          {/* Pricing & Booking Action Card */}
          <div className="bg-slate-50 border border-gray-100 rounded-3xl p-6 shadow-md space-y-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-baseline space-x-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Starts at</span>
                    <span className="text-3xl font-extrabold text-gray-900 mt-0.5">
                      {formatPrice(service.pricePaise)}
                    </span>
                  </div>
                  {detail.originalPricePaise && (
                    <span className="text-base font-semibold text-gray-400 line-through">
                      {formatPrice(detail.originalPricePaise)}
                    </span>
                  )}
                </div>
                <div className="inline-block bg-orange-50 border border-orange-100 text-orange-700 text-[10px] font-extrabold px-3 py-0.5 rounded-full uppercase tracking-wider">
                  33% OFF • Limited Offer
                </div>
              </div>

              {/* Saved & Share controls */}
              <div className="flex items-center space-x-1 sm:space-x-2">
                {showSave && (
                  <SaveServiceButton serviceId={service.id} initialSaved={isSaved} />
                )}
                <ServiceShareButton url={shareUrl} title={service.name} />
              </div>
            </div>

            {/* CTAs */}
            <div className="space-y-3 pt-2">
              <Link
                href={bookHref}
                className="w-full py-3.5 bg-[#8b3d1b] hover:bg-[#6b2f15] text-white text-center rounded-2xl font-extrabold text-base transition-colors shadow-sm cursor-pointer flex items-center justify-center"
              >
                {primaryBookLabel}
              </Link>
            </div>

            {/* Perks details */}
            <div className="border-t border-gray-200/60 pt-4 space-y-2.5 text-xs sm:text-sm text-gray-600">
              <div className="flex items-center space-x-3">
                <span className="text-orange-600">
                  <FlaticonIcon name="shield-check" size={16} />
                </span>
                <span className="font-semibold text-gray-700">VSolve Cover: 30 days warranty included</span>
              </div>
              {durationLabel && (
                <div className="flex items-center space-x-3">
                  <span className="text-orange-600">
                    <FlaticonIcon name="clock" size={16} />
                  </span>
                  <span className="font-semibold text-gray-700">Estimated Duration: {durationLabel}</span>
                </div>
              )}
            </div>
          </div>
          
        </div>

        {/* RIGHT COLUMN: Service Details, Inclusions & Reviews (lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-8 sm:space-y-10">
          
          {/* Main Info Header */}
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
              {service.name}
            </h1>
            
            <div className="flex flex-wrap items-center gap-3">
              <span className="bg-orange-50 text-orange-700 text-xs font-extrabold px-3 py-1 rounded-full flex items-center space-x-1 border border-orange-100/50">
                <span className="text-orange-600">★</span>
                <span>{detail.rating.toFixed(2)}</span>
              </span>
              <span className="text-xs sm:text-sm text-gray-500 font-semibold">
                ({detail.reviewCountLabel} verified reviews & bookings)
              </span>
            </div>
            
            <p className="text-sm sm:text-base text-gray-600 leading-relaxed pt-2">
              {service.description}
            </p>
          </div>

          {/* What's Included Accordions */}
          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              What's included in this service
            </h2>
            
            <div className="border border-gray-100 rounded-3xl overflow-hidden shadow-sm bg-white divide-y divide-gray-100">
              
              {/* Inclusions Accordion */}
              <div>
                <button 
                  onClick={() => setInclusionsOpen(!inclusionsOpen)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left font-bold text-gray-800 hover:bg-slate-50 transition-colors"
                >
                  <span className="text-sm sm:text-base">Service Inclusions</span>
                  <span className={`transform transition-transform duration-200 text-gray-400 ${inclusionsOpen ? "rotate-185" : ""}`}>
                    <FlaticonIcon name="angle-small-down" size={20} />
                  </span>
                </button>
                
                {inclusionsOpen && (
                  <div className="px-6 pb-6 pt-2">
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {detail.covered.map((item) => (
                        <li key={item} className="flex items-start space-x-3 text-xs sm:text-sm text-gray-600">
                          <span className="text-emerald-500 font-extrabold mt-0.5">✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                      <li className="flex items-start space-x-3 text-xs sm:text-sm text-gray-600">
                        <span className="text-emerald-500 font-extrabold mt-0.5">✓</span>
                        <span>Custom scope for {service.name}</span>
                      </li>
                      <li className="flex items-start space-x-3 text-xs sm:text-sm text-gray-600">
                        <span className="text-emerald-500 font-extrabold mt-0.5">✓</span>
                        <span>Consultation to define deliverables</span>
                      </li>
                      <li className="flex items-start space-x-3 text-xs sm:text-sm text-gray-600">
                        <span className="text-emerald-500 font-extrabold mt-0.5">✓</span>
                        <span>Matched professional or vendor</span>
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Exclusions Accordion */}
              {detail.notCovered.length > 0 && (
                <div>
                  <button 
                    onClick={() => setExclusionsOpen(!exclusionsOpen)}
                    className="w-full px-6 py-4 flex items-center justify-between text-left font-bold text-gray-800 hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-sm sm:text-base">What is excluded</span>
                    <span className={`transform transition-transform duration-200 text-gray-400 ${exclusionsOpen ? "rotate-185" : ""}`}>
                      <FlaticonIcon name="angle-small-down" size={20} />
                    </span>
                  </button>
                  
                  {exclusionsOpen && (
                    <div className="px-6 pb-6 pt-2">
                      <ul className="space-y-3">
                        {detail.notCovered.map((item) => (
                          <li key={item} className="flex items-start space-x-3 text-xs sm:text-sm text-gray-600">
                            <span className="text-red-500 font-extrabold mt-0.5">✗</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
            </div>
          </section>

          {/* User Reviews Section */}
          <section className="space-y-5">
            <div className="flex items-baseline justify-between border-b border-gray-100 pb-3">
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                User reviews and ratings
              </h2>
              <Link href="#" className="text-xs sm:text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors">
                View all reviews
              </Link>
            </div>

            <div className="bg-slate-50 p-6 rounded-3xl border border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="text-center sm:text-left space-y-1">
                <span className="text-4xl font-extrabold text-slate-900">★ {detail.rating.toFixed(2)}/5</span>
                <p className="text-xs text-gray-500 font-semibold">based on {detail.reviewCountLabel} verified reviews</p>
              </div>
              <div className="h-px sm:h-12 w-full sm:w-px bg-gray-200" />
              <div className="text-center sm:text-right text-xs text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-full shadow-sm">
                ✓ 98.4% customers rate this service 5-stars
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {DUMMY_REVIEWS.map((rev) => (
                <div key={rev.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-extrabold text-xs">
                        {rev.initial}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs sm:text-sm font-bold text-slate-900">{rev.name}</span>
                        <span className="text-[10px] text-gray-400 font-semibold">{rev.location} • {rev.time}</span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-amber-500">★★★★★</span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 italic leading-relaxed">
                    "{rev.text}"
                  </p>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>

      {/* BOTTOM SECTION: Related Services Grid */}
      <section className="mt-16 sm:mt-24 border-t border-gray-100 pt-12 space-y-6">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Related services</h2>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {DUMMY_RELATED.map((rel) => (
            <div 
              key={rel.id} 
              className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-gray-200 transition-all duration-200 min-h-[190px]"
            >
              <div>
                {/* Related Image Box with Fallback Icon */}
                <div className="w-full aspect-[16/10] rounded-xl bg-slate-50 flex items-center justify-center overflow-hidden border border-gray-100/50">
                  <span className="text-orange-600">
                    <FlaticonIcon name="bolt" size={32} />
                  </span>
                </div>
                
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 mt-3 leading-snug line-clamp-1">
                  {rel.name}
                </h3>
                <span className="text-[10px] text-gray-400 font-semibold mt-1 block">
                  ★ {rel.rating} • {rel.time}
                </span>
              </div>
              
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-50">
                <span className="text-xs sm:text-sm font-extrabold text-slate-900">{formatPrice(rel.price)}</span>
                <button className="px-3 py-1 bg-slate-50 hover:bg-[#8b3d1b] hover:text-white border border-gray-200 hover:border-[#8b3d1b] text-slate-700 rounded-lg text-[10px] font-bold transition-all cursor-pointer">
                  Book
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sticky Mobile Action Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 p-4 flex items-center justify-between gap-4 lg:hidden shadow-lg shadow-black/20">
        <div className="flex flex-col">
          <span className="text-[9px] font-bold text-gray-400 uppercase">Starts at</span>
          <span className="text-lg font-extrabold text-gray-900">{formatPrice(service.pricePaise)}</span>
        </div>
        
        <div className="flex items-center space-x-2">
          {showSave && (
            <SaveServiceButton serviceId={service.id} initialSaved={isSaved} />
          )}
          <Link 
            href={bookHref} 
            className="px-6 py-2.5 bg-[#8b3d1b] hover:bg-[#6b2f15] text-white text-xs font-extrabold rounded-xl transition-colors shadow-sm cursor-pointer"
          >
            {primaryBookLabel}
          </Link>
        </div>
      </div>
      
    </div>
  );
}
