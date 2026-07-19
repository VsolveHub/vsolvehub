"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/format";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { getServiceCardMeta } from "@/lib/catalog/service-card-meta";

type ServiceCardData = {
  id: string;
  name: string;
  slug: string;
  description: string;
  pricePaise: number;
  unit?: string;
  duration?: number;
  category: { slug: string; name: string; icon: string };
  subCategory?: { name: string; slug: string } | null;
};

type SubCategory = {
  id: string;
  name: string;
  slug: string;
  services: ServiceCardData[];
};

type Props = {
  categorySlug: string;
  categoryName: string;
  subCategories: SubCategory[];
  standaloneServices: ServiceCardData[];
};

const SERVICE_BULLETS: Record<string, string[]> = {
  "deep-home-cleaning": [
    "6-step intensive process",
    "Inclusive of appliances & toilets"
  ],
  "basic-home-cleaning": [
    "Dusting, sweeping & mopping",
    "Eco-friendly cleaning agents used"
  ],
  "bathroom-deep-cleaning": [
    "Hard water stain removal",
    "Sanitisation & anti-fungal treatment"
  ],
  "kitchen-deep-cleaning": [
    "Degreasing of chimney & slabs",
    "Cabinet cleaning inside-out"
  ],
  "sofa-shampooing": [
    "Industrial shampooing & vacuuming",
    "Fabric conditioning & stain removal"
  ],
  "carpet-cleaning": [
    "Deep extraction wash",
    "Softening treatment"
  ],
  "mattress-cleaning": [
    "Dust-mite elimination",
    "UV sanitisation & deodorising"
  ],
  "general-pest-control": [
    "Odourless gel treatment",
    "Covers cockroaches, ants & silverfish"
  ],
  "cockroach-control": [
    "Targeted kitchen gel application",
    "Safe for kids and pets"
  ],
  "termite-control": [
    "Drill-Fill-Seal barrier technology",
    "1-year warranty on treated areas"
  ],
  "bed-bug-control": [
    "2-visit intensive spray treatment",
    "Immediate relief from bites"
  ],
  "wash-and-fold": [
    "Premium detergent wash",
    "Neatly folded & packed"
  ],
  "dry-cleaning": [
    "Stain removal pre-treatment",
    "Premium hanger packaging"
  ],
  "steam-ironing": [
    "Crisp crease steam press",
    "Hanger/fold option available"
  ]
};

function getServiceBullets(slug: string, description: string): string[] {
  if (SERVICE_BULLETS[slug]) return SERVICE_BULLETS[slug];
  const parts = description.split(/[.,;]/).map(s => s.trim()).filter(s => s.length > 10);
  if (parts.length >= 2) return parts.slice(0, 2);
  return ["Expert professional service", "100% verified partners"];
}

function getServiceImage(slug: string, categorySlug: string): string {
  switch (slug) {
    case "deep-home-cleaning":
    case "deep-cleaning":
      return "/basic_home_cleaning_hd.jpg";
    case "basic-home-cleaning":
      return "/home_cleaner_hd.jpg";
    case "bathroom-deep-cleaning":
      return "/bathroom_deep_cleaning_hd.jpg";
    case "kitchen-deep-cleaning":
      return "/appliance_hd.jpg";
    case "sofa-shampooing":
    case "carpet-cleaning":
    case "mattress-cleaning":
      return "/basic_home_cleaning_hd.jpg";
    case "general-pest-control":
    case "cockroach-control":
    case "termite-control":
    case "bed-bug-control":
      return "/basic_home_cleaning_hd.jpg";
    case "ac-deep-cleaning":
      return "/ac_deep_cleaning_hd.jpg";
    case "ac-general-service":
      return "/ac_general_service_hd.jpg";
    case "split-ac-installation":
      return "/ac_technician_hd.jpg";
    case "ac-gas-filling":
      return "/ac_gas_filling_hd.jpg";
    case "tap-repair":
    case "drain-block-removal":
    case "wc-flush-repair":
    case "basin-sink-installation":
      return "/basin_sink_installation_hd.jpg";
    default:
      if (categorySlug === "technician") return "/ac_technician_hd.jpg";
      if (categorySlug === "beauty-wellness") return "/beauty_hd.jpg";
      if (categorySlug === "pet-services") return "/pet_hd.jpg";
      return "/basic_home_cleaning_hd.jpg";
  }
}

export function CategorySlugPageClient({
  categorySlug,
  categoryName,
  subCategories,
  standaloneServices,
}: Props) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const router = useRouter();

  // One service per booking — a provider must accept each request individually,
  // so tapping "Book" goes straight into the single-service booking flow.
  function handleBook(service: ServiceCardData) {
    router.push(`/booking?serviceId=${service.id}`);
  }

  // Filter subcategories to display based on active tab
  const filteredSubCategories = activeTab === "all" || activeTab === "popular"
    ? subCategories
    : subCategories.filter(sub => sub.slug === activeTab);

  // Compile all services from active subcategories + standalone
  let allFilteredServices = [
    ...filteredSubCategories.flatMap(sub => sub.services),
    ...(activeTab === "all" ? standaloneServices : [])
  ];

  // If popular, limit or filter accordingly
  if (activeTab === "popular") {
    allFilteredServices = allFilteredServices.filter(s => s.pricePaise >= 80000);
  }

  // Split into "Best Value Packages" and "Express Solutions"
  // threshold: price >= ₹900 (90000 paise)
  const bestValue = allFilteredServices.filter(s => s.pricePaise >= 90000);
  const express = allFilteredServices.filter(s => s.pricePaise < 90000);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
      
      {/* Interactive Subcategory / Tab Pills */}
      <div className="border-b border-gray-100 pb-4 mb-8">
        <div className="flex items-center justify-between gap-4 overflow-x-auto no-scrollbar py-2">
          <div className="flex items-center gap-2 sm:gap-3 whitespace-nowrap">
            {/* All Services Tab */}
            <button
              onClick={() => setActiveTab("all")}
              className={`px-5 py-2.5 text-xs sm:text-sm font-bold rounded-full transition-all duration-200 cursor-pointer ${
                activeTab === "all"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              All Services
            </button>
            
            {/* Popular Tab */}
            <button
              onClick={() => setActiveTab("popular")}
              className={`px-5 py-2.5 text-xs sm:text-sm font-bold rounded-full transition-all duration-200 cursor-pointer ${
                activeTab === "popular"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Popular
            </button>

            {/* Dynamic Subcategories as Pills */}
            {subCategories.map((sub) => (
              <button
                key={sub.id}
                onClick={() => setActiveTab(sub.slug)}
                className={`px-5 py-2.5 text-xs sm:text-sm font-bold rounded-full transition-all duration-200 cursor-pointer ${
                  activeTab === sub.slug
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50"
                }`}
              >
                {sub.name}
              </button>
            ))}
          </div>

          {/* Filter Pill */}
          <button className="flex items-center space-x-2 px-5 py-2.5 text-xs sm:text-sm font-bold bg-white border border-gray-200 hover:border-gray-300 text-slate-700 rounded-full transition-colors cursor-pointer whitespace-nowrap shadow-sm">
            <FlaticonIcon name="filter" size={14} className="text-slate-500" />
            <span>Filter</span>
          </button>
        </div>
      </div>

      {/* Main Services Display */}
      <div className="space-y-12 sm:space-y-16">
        
        {/* 1. Best Value Packages (Large Cards) */}
        {bestValue.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-end justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Best Value Packages</h2>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">Our most requested bundles for a complete home makeover.</p>
              </div>
              <Link href="#" className="text-xs sm:text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors">
                View all
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {bestValue.map((service) => {
                const bullets = getServiceBullets(service.slug, service.description);
                const serviceImg = getServiceImage(service.slug, categorySlug);
                const rating = (4.5 + (service.id.charCodeAt(service.id.length - 1) % 5) * 0.1).toFixed(1);
                
                return (
                  <div 
                    key={service.id} 
                    className="group bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-md hover:shadow-lg transition-all duration-300 flex flex-col h-full"
                  >
                    {/* Card Image */}
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-50">
                      <img
                        src={serviceImg}
                        alt={service.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      {/* Floating Badges */}
                      <div className="absolute top-4 left-4">
                        <span className="bg-orange-500 text-white text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-md shadow-sm">
                          Best Seller
                        </span>
                      </div>
                      <div className="absolute top-4 right-4">
                        <span className="bg-white/95 backdrop-blur-sm text-gray-800 text-xs font-bold px-2.5 py-1 rounded-full shadow-sm flex items-center space-x-1 border border-gray-100/50">
                          <span className="text-amber-500">★</span>
                          <span>{rating}</span>
                        </span>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-5 sm:p-6 flex flex-col flex-grow justify-between">
                      <div className="space-y-4">
                        <h3 className="text-lg font-extrabold text-gray-900 leading-snug group-hover:text-orange-600 transition-colors">
                          <Link href={`/services/${categorySlug}/${service.slug}`}>
                            {service.name}
                          </Link>
                        </h3>
                        
                        {/* Bullet points */}
                        <ul className="space-y-2 text-xs sm:text-sm text-gray-500">
                          {bullets.map((bullet, idx) => (
                            <li key={idx} className="flex items-start space-x-2">
                              <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Pricing and Action */}
                      <div className="flex items-center justify-between pt-5 border-t border-gray-50 mt-6">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-gray-400 tracking-wider uppercase">Starting At</span>
                          <span className="text-xl font-extrabold text-gray-900">{formatPrice(service.pricePaise)}</span>
                        </div>
                        
                        <button
                          onClick={() => handleBook(service)}
                          className="px-6 py-2.5 rounded-2xl font-extrabold text-sm shadow-sm transition-all duration-200 cursor-pointer bg-[#8b3d1b] hover:bg-[#6b2f15] text-white shadow-orange-100"
                        >
                          Book now
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 2. Express Solutions (Small Horizontal Cards) */}
        {express.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-end justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Express Solutions</h2>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">Quick fixes for busy households. Done in under 2 hours.</p>
              </div>
              <Link href="#" className="text-xs sm:text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors">
                View all
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {express.map((service) => {
                const rating = (4.5 + (service.id.charCodeAt(service.id.length - 1) % 5) * 0.1).toFixed(1);
                const cardMeta = getServiceCardMeta(service.slug, categorySlug, service.name);

                return (
                  <div 
                    key={service.id} 
                    className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-gray-200 transition-all duration-200 min-h-[165px]"
                  >
                    <div>
                      {/* Icon & Rating Row */}
                      <div className="flex items-start justify-between">
                        <div className="p-2.5 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100/50">
                          <FlaticonIcon name={cardMeta.icon} size={18} color={cardMeta.color} />
                        </div>
                        <span className="bg-gray-50 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 border border-gray-100">
                          <span className="text-amber-500">★</span>
                          <span>{rating}</span>
                        </span>
                      </div>
                      
                      {/* Title */}
                      <h4 className="text-sm font-bold text-gray-900 mt-3.5 leading-snug">
                        <Link href={`/services/${categorySlug}/${service.slug}`} className="hover:text-orange-600 transition-colors line-clamp-2">
                          {service.name}
                        </Link>
                      </h4>
                    </div>

                    {/* Price & Action Row */}
                    <div className="flex items-center justify-between pt-3.5 mt-3 border-t border-gray-50">
                      <span className="text-base font-extrabold text-gray-900">{formatPrice(service.pricePaise)}</span>
                      
                      <button
                        onClick={() => handleBook(service)}
                        className="px-4 py-1.5 rounded-xl font-extrabold text-xs border transition-all duration-200 cursor-pointer bg-white border-gray-200 text-slate-800 hover:border-orange-500 hover:text-orange-600"
                      >
                        Book
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Empty State */}
        {bestValue.length === 0 && express.length === 0 && (
          <div className="text-center py-16 bg-slate-50 rounded-3xl border border-dashed border-gray-200">
            <span className="text-slate-300 inline-block mb-3">
              <FlaticonIcon name="search-alt" size={48} />
            </span>
            <p className="text-slate-500 text-sm font-semibold">No services found under this tab.</p>
            <button 
              onClick={() => setActiveTab("all")}
              className="mt-4 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-full text-xs font-bold cursor-pointer transition-colors"
            >
              Show All Services
            </button>
          </div>
        )}

      </div>

      {/* Dynamic FAQs Section styled with Tailwind */}
      <section className="mt-20 border-t border-gray-100 pt-12 max-w-3xl mx-auto">
        <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight text-center mb-8">
          Frequently Asked Questions
        </h2>
        
        <div className="space-y-6">
          <div className="bg-slate-50 p-5 sm:p-6 rounded-2xl border border-gray-100">
            <h4 className="font-bold text-gray-900 text-base flex items-start space-x-3">
              <span className="text-orange-600 font-extrabold">Q.</span>
              <span>How do I choose the right cleaning service?</span>
            </h4>
            <p className="text-gray-600 text-sm mt-2.5 ml-6 leading-relaxed">
              Assess your needs: deep cleaning for seasonal maintenance or express cleaning for weekly upkeep. All our professionals are rated for transparency and background verified for safety.
            </p>
          </div>

          <div className="bg-slate-50 p-5 sm:p-6 rounded-2xl border border-gray-100">
            <h4 className="font-bold text-gray-900 text-base flex items-start space-x-3">
              <span className="text-orange-600 font-extrabold">Q.</span>
              <span>Are the service charges inclusive of materials?</span>
            </h4>
            <p className="text-gray-600 text-sm mt-2.5 ml-6 leading-relaxed">
              Yes, our standard charges for deep cleaning include all specialized eco-safe cleaning agents, equipment, and travel costs. No hidden fees or extra material costs.
            </p>
          </div>
        </div>
      </section>
      
    </div>
  );
}
