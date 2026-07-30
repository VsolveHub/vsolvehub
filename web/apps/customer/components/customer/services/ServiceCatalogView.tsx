"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ServiceIcon } from "@/components/ui/ServiceIcons";
import { serviceImageSrc } from "@/lib/catalog/service-sketch-illustrations";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import type { IconName } from "@/components/ui/ServiceIcons";

const PREVIEW_LIMIT = 4;

export type CatalogServiceItem = {
  id: string;
  slug: string;
  name: string;
  href: string;
  icon: IconName;
  color: string;
  subtitle: string;
  imageUrl?: string | null;
};

export type CatalogCategoryData = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  headerIcon: IconName;
  totalCount: number;
  services: CatalogServiceItem[];
};

type Props = {
  categories: CatalogCategoryData[];
};

export function ServiceCatalogView({ categories }: Props) {
  const visibleCategories = categories.filter((c) => c.services.length > 0);
  const [activeSlug, setActiveSlug] = useState(visibleCategories[0]?.slug ?? "");
  const feedRef = useRef<HTMLDivElement>(null);
  const categorySlugs = visibleCategories.map((c) => c.slug).join(",");

  useEffect(() => {
    const sections = categorySlugs
      .split(",")
      .filter(Boolean)
      .map((slug) => document.getElementById(`cat-${slug}`))
      .filter(Boolean) as HTMLElement[];

    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) {
          setActiveSlug(visible[0].target.id.replace("cat-", ""));
        }
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5] }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [categorySlugs]);

  function scrollToCategory(slug: string) {
    setActiveSlug(slug);
    const el = document.getElementById(`cat-${slug}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div className="w-full min-h-screen bg-[#f1f5f9] pb-24">
      <header className="relative overflow-hidden border-b border-orange-100 bg-gradient-to-br from-[#fffaf5] via-[#fff7ed] to-[#ffedd5] px-4 pb-12 pt-12 sm:px-8">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-orange-200/30 blur-3xl" />
        <div className="max-w-6xl mx-auto relative z-10 flex flex-col items-center text-center">
          <span className="mb-4 inline-flex w-max items-center gap-2 rounded-full border border-orange-200 bg-white/75 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#c2410c] shadow-sm backdrop-blur-md">
            ★ EXPERT PROFESSIONALS
          </span>
          <h1 className="mb-3 text-4xl font-black tracking-tight text-[#0b1c30] sm:text-5xl">Our Services</h1>
          <p className="max-w-lg text-sm font-semibold text-slate-600">Everything you need for your home, delivered by top-rated professionals right at your doorstep.</p>
        </div>
      </header>

      {/* Mobile Categories Sticky Nav */}
      <div className="md:hidden sticky top-[68px] z-40 bg-white/80 backdrop-blur-lg border-b border-gray-150 py-3 px-4 overflow-x-auto hide-scrollbar" aria-label="Jump to category">
        <div className="flex gap-2 w-max">
          {visibleCategories.map((category, index) => (
            <button
              key={category.id}
              type="button"
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors border ${activeSlug === category.slug ? "bg-[var(--color-brand)] text-white border-[var(--color-brand)] shadow-md" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"}`}
              onClick={() => scrollToCategory(category.slug)}
            >
              <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[9px] ${activeSlug === category.slug ? "bg-white/20" : "bg-gray-100"}`}>{index + 1}</span>
              <span className="whitespace-nowrap">{category.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-6 md:mt-8">
        <div className="flex flex-col md:flex-row items-start gap-8">
          {/* Desktop Sidebar */}
          <aside className="hidden md:block w-64 shrink-0" aria-label="Categories">
            <div className="sticky top-[100px] bg-white rounded-3xl border border-gray-150 p-6 shadow-sm">
              <h3 className="text-xs font-black uppercase text-gray-400 tracking-widest mb-4">Categories</h3>
              <div className="flex flex-col gap-1">
                {visibleCategories.map((category, index) => (
                  <button
                    key={category.id}
                    type="button"
                    className={`flex items-center justify-between w-full p-3 rounded-2xl transition-colors ${activeSlug === category.slug ? "bg-[var(--color-brand-light)] text-[var(--color-brand)]" : "text-gray-600 hover:bg-gray-50"}`}
                    onClick={() => scrollToCategory(category.slug)}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black ${activeSlug === category.slug ? "bg-[var(--color-brand)] text-white" : "bg-gray-100 text-gray-500"}`}>{index + 1}</span>
                      <span className="text-sm font-bold text-left leading-tight">{category.name}</span>
                    </div>
                    {activeSlug === category.slug && (
                      <motion.div layoutId="chevron" className="text-[var(--color-brand)]">
                        <FlaticonIcon name="angle-right" size={12} />
                      </motion.div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Feed */}
          <div className="flex-1 min-w-0" ref={feedRef}>
            {visibleCategories.map((category, catIndex) => {
              const preview = category.services.slice(0, PREVIEW_LIMIT);
              const hasMore = category.totalCount > PREVIEW_LIMIT;

              return (
                <section
                  key={category.id}
                  id={`cat-${category.slug}`}
                  className="mb-12 scroll-mt-[160px] md:scroll-mt-[100px]"
                >
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="flex items-center gap-3 text-lg sm:text-xl font-black text-gray-900 uppercase tracking-tight">
                      <span className="w-10 h-10 rounded-2xl bg-[var(--color-brand-light)] flex items-center justify-center">
                        <ServiceIcon name={category.headerIcon} size={20} color="var(--color-brand)" />
                      </span>
                      {catIndex + 1}. {category.name}
                    </h2>
                    {hasMore && (
                      <Link href={`/services/${category.slug}`} className="text-xs font-bold text-[var(--color-brand)] hover:underline bg-[var(--color-brand-light)] px-3 py-1.5 rounded-lg">
                        View all ({category.totalCount}) →
                      </Link>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                    {preview.map((service) => (
                      <Link key={service.id} href={service.href} className="group block">
                        <motion.div whileHover={{ y: -4 }} className="flex flex-col bg-white rounded-2xl border border-gray-150 overflow-hidden shadow-sm hover:shadow-md transition-shadow h-full">
                          <div className="relative aspect-[4/3] w-full bg-gray-50 overflow-hidden">
                            <motion.div className="w-full h-full transition-transform duration-500 group-hover:scale-110">
                              <Image
                                src={serviceImageSrc({
                                  imageUrl: service.imageUrl,
                                  slug: service.slug,
                                  categorySlug: category.slug,
                                  serviceName: service.name,
                                  icon: service.icon,
                                })}
                                alt={service.name}
                                fill
                                sizes="(max-width: 1024px) 50vw, 25vw"
                                className="w-full h-full object-cover"
                              />
                            </motion.div>
                          </div>
                          <div className="p-3 sm:p-4 flex-1 flex flex-col justify-center">
                            <h3 className="text-sm font-bold text-gray-900 leading-snug group-hover:text-[var(--color-brand)] transition-colors line-clamp-2">{service.name}</h3>
                            <p className="text-[10px] sm:text-xs font-semibold text-gray-500 mt-1 line-clamp-1">{service.subtitle}</p>
                          </div>
                        </motion.div>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
