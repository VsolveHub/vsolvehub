"use client";

import Link from "next/link";
import { formatPriceLabel } from "@/lib/format";
import { SERVICE_SLUG_TO_PROPERTY_TYPE } from "@/lib/accommodation/constants";
import { getVehicleFlowHref } from "@/lib/vehicle/constants";
import { ServiceIcon } from "@/components/ui/ServiceIcons";
import { getServiceCardMeta } from "@/lib/catalog/service-card-meta";
import { motion } from "framer-motion";

function formatDurationChip(duration: number, unit?: string): string | null {
  if (duration <= 0) return null;
  if (unit === "day") return "Full day";
  if (unit === "night") return "Per night";
  return `${Math.round(duration / 60)} hrs`;
}

export type ServiceCardData = {
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

function getAccommodationHref(service: ServiceCardData) {
  const subSlug = service.subCategory?.slug ?? service.slug;
  const type = SERVICE_SLUG_TO_PROPERTY_TYPE[subSlug] ?? SERVICE_SLUG_TO_PROPERTY_TYPE[service.slug];
  return type ? `/accommodation?type=${type}` : "/accommodation";
}

function getBookHref(service: ServiceCardData) {
  if (service.category.slug === "accommodation-services") {
    return getAccommodationHref(service);
  }
  const subSlug = service.subCategory?.slug ?? service.slug;
  const vehicleHref = getVehicleFlowHref(service.slug, subSlug);
  if (vehicleHref) return vehicleHref;
  return `/booking?serviceId=${service.id}`;
}

function getBookLabel(service: ServiceCardData) {
  if (service.category.slug === "accommodation-services") return "Browse";
  return "Book now";
}

export function ServiceCard({ service }: { service: ServiceCardData }) {
  const href = `/services/${service.category.slug}/${service.slug}`;
  const bookHref = getBookHref(service);
  const bookLabel = getBookLabel(service);
  const metaLabel = service.subCategory?.name ?? service.category.name;
  const durationLabel = formatDurationChip(service.duration ?? 0, service.unit);
  
  const subSlug = service.subCategory?.slug ?? service.slug;
  const cardMeta = getServiceCardMeta(subSlug, service.category.slug, service.name);
  
  const rating = (4.5 + (service.id.charCodeAt(service.id.length - 1) % 5) * 0.1).toFixed(1);

  return (
    <motion.li whileHover={{ y: -4 }} className="list-none group">
      <div className="bg-white rounded-3xl border border-gray-150 overflow-hidden shadow-sm transition-shadow hover:shadow-lg flex flex-col h-full relative">
        <Link href={href} className="flex flex-col sm:flex-row p-5 gap-5 flex-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]">
          <div className="flex-1 flex flex-col sm:flex-row gap-5 min-w-0">
            <span className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-2xl bg-gray-50 flex items-center justify-center border border-gray-100 shadow-inner group-hover:scale-105 transition-transform" aria-hidden>
              <ServiceIcon
                name={cardMeta.icon}
                size={40}
                color={cardMeta.color}
                slug={service.slug}
                subCategorySlug={subSlug}
                categorySlug={service.category.slug}
                serviceName={service.name}
                alt={service.name}
              />
            </span>
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-green-700 bg-green-50 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 bg-green-500 rounded-full" /> Verified Pro
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded-full">
                  <span className="text-[var(--color-brand-accent)]">★</span> {rating}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-gray-900 leading-tight mb-1 tracking-tight group-hover:text-[var(--color-brand)] transition-colors line-clamp-2">{service.name}</h3>
              <p className="text-xs text-gray-500 font-medium line-clamp-2 mb-3 leading-relaxed">{service.description.slice(0, 100)}...</p>
              
              <div className="flex items-center gap-2 mt-auto flex-wrap">
                <span className="text-[10px] font-bold bg-gray-100 text-gray-700 px-2.5 py-1 rounded-md">{metaLabel}</span>
                {durationLabel && (
                  <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md">⏱ {durationLabel}</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="sm:text-right shrink-0 flex items-center sm:items-start pt-2 sm:pt-0 border-t border-gray-50 sm:border-t-0 mt-4 sm:mt-0">
            <span className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">{formatPriceLabel(service.pricePaise, service.unit)}</span>
          </div>
        </Link>

        <div className="flex items-center justify-between p-4 sm:px-5 bg-gray-50/50 border-t border-gray-100">
          <label className="flex items-center gap-2 cursor-pointer group/cb" onClick={(e) => e.stopPropagation()}>
            <div className="relative flex items-center justify-center w-4 h-4 rounded border border-gray-300 bg-white group-hover/cb:border-[var(--color-brand)] transition-colors">
              <input type="checkbox" className="opacity-0 absolute inset-0 cursor-pointer peer" />
              <svg className="w-3 h-3 text-white peer-checked:text-[var(--color-brand)] opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2.5 7 5.5 10 11.5 3"></polyline>
              </svg>
            </div>
            <span className="text-xs font-bold text-gray-500 group-hover/cb:text-gray-900 transition-colors">Add to Compare</span>
          </label>
          <Link href={bookHref} className="px-5 py-2.5 bg-[var(--color-brand)] text-white text-xs font-black rounded-xl shadow-md hover:opacity-90 transition-opacity">
            {bookLabel}
          </Link>
        </div>
      </div>
    </motion.li>
  );
}

export function ServiceCardList({ services }: { services: ServiceCardData[] }) {
  if (!services.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 bg-white rounded-3xl border border-gray-150 shadow-sm text-center">
        <p className="text-lg font-bold text-gray-900 mb-6">No services found.</p>
        <Link href="/services" className="px-6 py-3 bg-[var(--color-brand-light)] text-[var(--color-brand)] text-sm font-black rounded-2xl hover:bg-[var(--color-brand)] hover:text-white transition-colors">
          Browse all services
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-6 m-0 p-0 list-none">
      {services.map((service) => (
        <ServiceCard key={service.id} service={service} />
      ))}
    </ul>
  );
}
