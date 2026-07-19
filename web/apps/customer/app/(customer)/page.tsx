import Link from "next/link";
import { Suspense } from "react";

import { HeroBanner } from "@/components/customer/home/HeroBanner";
import { PromoCards } from "@/components/customer/home/PromoCards";
import { WhyChoose } from "@/components/customer/home/WhyChoose";
import { HomeHowItWorks } from "@/components/customer/home/HomeHowItWorks";
import { HomeTestimonials } from "@/components/customer/home/HomeTestimonials";
import { HomeFaq } from "@/components/customer/home/HomeFaq";
import { NewAndNoteworthy } from "@/components/customer/home/NewAndNoteworthy";
import { HomeReferBanner } from "@/components/customer/home/HomeReferBanner";
import { HomeBottomCta } from "@/components/customer/home/HomeBottomCta";
import { HomeServiceVerticalCard } from "@/components/customer/home/HomeServiceVerticalCard";
import { VSmartStories } from "@/components/customer/home/VSmartStories";
import { AIAssistant } from "@/components/customer/home/AIAssistant";
import { PersonalizedSections } from "@/components/customer/home/PersonalizedSections";

import { getPopularServices, getCategories } from "@/lib/catalog/queries";
import { formatPriceLabel } from "@/lib/format";

export default async function HomePage() {
  // Catalog data only — these are cached (unstable_cache) and shared across all
  // users, so they resolve fast and let the page shell paint immediately.
  // Per-user content lives in <PersonalizedSections> behind a Suspense boundary.
  const [popular, categories] = await Promise.all([getPopularServices(12), getCategories()]);

  const categoryTiles = categories.map((cat) => ({
    slug: cat.slug,
    name: cat.name,
    icon: cat.icon,
  }));

  return (
    <div className="home-page">
      {/* Hero Section & Top Elements */}
      <section className="section-wrapper bg-white">
        <div className="desktop-wide-layout">
          <HeroBanner categories={categoryTiles} />

          <div className="home-stories-wrap">
            <VSmartStories />
          </div>
        </div>
      </section>

      {/* Spotlight */}
      <section className="section-wrapper bg-white">
        <div className="desktop-wide-layout section-pad-y">
          <PromoCards />
        </div>
      </section>

      {/* New & Noteworthy */}
      <section className="section-wrapper bg-gray">
        <div className="desktop-wide-layout" style={{ paddingBottom: "3rem", paddingTop: "3rem" }}>
          <NewAndNoteworthy />
        </div>
      </section>

      {/* Most booked services */}
      <section className="section-wrapper bg-white">
        <div className="desktop-wide-layout" style={{ paddingBottom: "3rem", paddingTop: "3rem" }}>
          <div className="section-header-row">
            <h2 className="home-section-title">Most booked services</h2>
            <Link href="/services" className="section-link">
              See all
            </Link>
          </div>
          <div className="popular-scroll">
            {popular.map((service, index) => (
              <HomeServiceVerticalCard
                key={service.id}
                href={`/services/${service.category.slug}/${service.slug}`}
                name={service.name}
                priceLabel={formatPriceLabel(service.pricePaise, service.unit)}
                categorySlug={service.category.slug}
                serviceSlug={service.slug}
                subCategorySlug={service.subCategory?.slug}
                badge={index === 0 ? "Best Seller" : undefined}
                serviceId={service.id}
                pricePaise={service.pricePaise}
                unit={service.unit}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Personalized: recently viewed, saved services, active bookings.
          Streamed so the per-user DB queries never block the static shell. */}
      <Suspense fallback={null}>
        <PersonalizedSections />
      </Suspense>

      {/* AI Assistant */}
      <section className="section-wrapper bg-gray">
        <div className="desktop-wide-layout section-pad-y">
          <AIAssistant />
        </div>
      </section>

      {/* Other Sections (Alternating) */}
      <section className="section-wrapper bg-white">
        <div className="desktop-wide-layout section-pad-y">
          <WhyChoose />
          <div style={{ height: "3rem" }} />
          <HomeHowItWorks />
        </div>
      </section>

      <section className="section-wrapper bg-gray">
        <div className="desktop-wide-layout section-pad-y">
          <HomeTestimonials />
        </div>
      </section>

      <section className="section-wrapper bg-white">
        <div className="desktop-wide-layout section-pad-y">
          <HomeFaq />
        </div>
      </section>

      <section className="section-wrapper bg-gray">
        <div className="desktop-wide-layout section-pad-y">
          <HomeReferBanner />
          <div style={{ height: "3rem" }} />
          <HomeBottomCta />
        </div>
      </section>
    </div>
  );
}
