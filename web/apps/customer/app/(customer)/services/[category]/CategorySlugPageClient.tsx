"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CategoryTabs } from "./categorySlugPage/CategoryTabs";
import { BestValueSection } from "./categorySlugPage/BestValueSection";
import { ExpressSection } from "./categorySlugPage/ExpressSection";
import { EmptyState } from "./categorySlugPage/EmptyState";
import { FaqSection } from "./categorySlugPage/FaqSection";

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
  function handleBook(service: { id: string }) {
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">

      <CategoryTabs activeTab={activeTab} setActiveTab={setActiveTab} subCategories={subCategories} />

      {/* Main Services Display */}
      <div className="space-y-10">
        <BestValueSection services={bestValue} categorySlug={categorySlug} onBook={handleBook} />
        <ExpressSection services={express} categorySlug={categorySlug} onBook={handleBook} />

        {bestValue.length === 0 && express.length === 0 && (
          <EmptyState onShowAll={() => setActiveTab("all")} />
        )}
      </div>

      <FaqSection />

    </div>
  );
}
