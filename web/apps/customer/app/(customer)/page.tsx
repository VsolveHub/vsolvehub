import { Suspense } from "react";

import { HeroBanner } from "@/components/customer/home/HeroBanner";
import { HomeTrustStrip } from "@/components/customer/home/HomeTrustStrip";
import { CategoryGrid } from "@/components/customer/home/CategoryGrid";
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
import { CleaningEssentials } from "@/components/customer/home/CleaningEssentials";
import { SectionHeading } from "@/components/customer/home/SectionHeading";

import { getPopularServices, getCategories, getAppPromos, getAppStories } from "@/lib/catalog/queries";
import { formatPriceLabel } from "@/lib/format";

/** One shell for every home section: consistent max width, gutters, and vertical rhythm. */
function Section({
  children,
  tone = "white",
}: {
  children: React.ReactNode;
  tone?: "white" | "muted" | "indigo";
}) {
  const bg =
    tone === "muted" ? "bg-slate-50" : tone === "indigo" ? "bg-indigo-50/60" : "bg-white";
  return (
    <section className={`w-full ${bg}`}>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-12 sm:px-6 sm:py-20 lg:px-12 xl:px-16">
        {children}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const [popular, categories, promos, stories] = await Promise.all([
    getPopularServices(12),
    getCategories(),
    getAppPromos(),
    getAppStories(),
  ]);

  const spotlightPromos = promos.filter((p) => p.type === "spotlight");
  const bannerPromos = promos.filter((p) => p.type === "banner");

  const categoryTiles = categories.map((cat) => ({
    slug: cat.slug,
    name: cat.name,
    icon: cat.icon,
  }));

  return (
    <div className="flex min-h-screen flex-col bg-white pb-6">
      {/* Hero + stories + trust */}
      <section className="w-full bg-white">
        <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-12 xl:px-16">
          <HeroBanner categories={categoryTiles} />
          <div className="py-6">
            <VSmartStories stories={stories} />
          </div>
          <div className="pb-10">
            <HomeTrustStrip />
          </div>
        </div>
      </section>

      {/* Browse by category — primary navigation */}
      <Section tone="indigo">
        <SectionHeading
          eyebrow="Explore"
          title="Browse by category"
          action={{ label: "All services", href: "/services" }}
          actionVariant="outline"
        />
        <CategoryGrid categories={categoryTiles} />
      </Section>

      {/* Spotlight */}
      {spotlightPromos.length > 0 && (
        <Section>
          <SectionHeading eyebrow="Handpicked" title="In the spotlight" />
          <PromoCards promos={spotlightPromos.slice(0, 3)} />
        </Section>
      )}

      {/* New & noteworthy */}
      <Section tone="muted">
        <SectionHeading
          eyebrow="Just added"
          title="New and noteworthy"
          action={{ label: "See all", href: "/services" }}
        />
        <NewAndNoteworthy services={popular.slice(0, 5)} />
      </Section>

      {/* Most booked services */}
      <Section>
        <SectionHeading
          eyebrow="Popular right now"
          title="Most booked services"
          action={{ label: "See all", href: "/services" }}
        />
        <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {popular.slice(5, 10).map((service, index) => (
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
              imageUrl={service.imageUrl}
            />
          ))}
        </div>
      </Section>

      {/* Cleaning essentials (banner promos) */}
      {bannerPromos.length > 0 && (
        <Section tone="muted">
          <SectionHeading eyebrow="Deep clean" title="Cleaning essentials" />
          <CleaningEssentials promos={bannerPromos} />
        </Section>
      )}

      {/* Personalized: recently viewed, saved, active bookings */}
      <Suspense fallback={null}>
        <PersonalizedSections />
      </Suspense>

      {/* Why choose + how it works */}
      <Section>
        <div className="space-y-16">
          <WhyChoose />
          <HomeHowItWorks />
        </div>
      </Section>

      <Section tone="muted">
        <HomeTestimonials />
      </Section>

      <Section>
        <HomeFaq />
      </Section>

      <Section tone="muted">
        <div className="space-y-12">
          <HomeReferBanner />
          <HomeBottomCta />
        </div>
      </Section>

      {/* Floating assistant — fixed overlay, rendered once */}
      <AIAssistant />
    </div>
  );
}
