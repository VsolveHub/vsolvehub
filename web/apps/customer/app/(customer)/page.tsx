import Link from "next/link";

import { HeroBanner } from "@/components/customer/home/HeroBanner";

import { HomeGreeting } from "@/components/customer/home/HomeGreeting";

import { HomeStatsStrip } from "@/components/customer/home/HomeStatsStrip";

import { QuickServices } from "@/components/customer/home/QuickServices";

import { TrendingSearches } from "@/components/customer/home/TrendingSearches";

import { CategoryGrid } from "@/components/customer/home/CategoryGrid";

import { PromoCards } from "@/components/customer/home/PromoCards";

import { HomeSpotlight } from "@/components/customer/home/HomeSpotlight";

import { WhyChoose } from "@/components/customer/home/WhyChoose";

import { HomeHowItWorks } from "@/components/customer/home/HomeHowItWorks";

import { HomeTestimonials } from "@/components/customer/home/HomeTestimonials";

import { HomeFaq } from "@/components/customer/home/HomeFaq";

import { HomeReferBanner } from "@/components/customer/home/HomeReferBanner";

import { HomeBottomCta } from "@/components/customer/home/HomeBottomCta";

import { HomeServiceMiniCard } from "@/components/customer/home/HomeServiceMiniCard";

import { getPopularServices, getServicesByIds, serializeService, serviceInclude } from "@/lib/catalog/queries";

import { getRecentlyViewedIds } from "@/lib/recently-viewed";

import { getServerSession } from "@/lib/auth/session";

import { prisma } from "@/lib/db/client";

import { formatPriceLabel } from "@/lib/format";



export default async function HomePage() {

  const [popular, recentIds, session, categories, serviceCount] = await Promise.all([

    getPopularServices(12),

    getRecentlyViewedIds(),

    getServerSession(),

    prisma.serviceCategory.findMany({ orderBy: { sortOrder: "asc" } }),

    prisma.service.count(),

  ]);



  const recentlyViewed = await getServicesByIds(recentIds);



  let savedServices: Awaited<ReturnType<typeof getServicesByIds>> = [];

  if (session) {

    const saved = await prisma.savedService.findMany({

      where: { userId: session.id },

      include: { service: { include: serviceInclude } },

      take: 6,

      orderBy: { createdAt: "desc" },

    });

    savedServices = saved.map((s) => serializeService(s.service));

  }



  const categoryTiles = categories.map((cat) => ({

    slug: cat.slug,

    name: cat.name,

    icon: cat.icon,

  }));



  return (

    <div className="home-page">

      <HeroBanner />

      <HomeGreeting name={session?.name} />

      <HomeStatsStrip serviceCount={serviceCount} categoryCount={categories.length} />

      <QuickServices />

      <TrendingSearches />



      <section className="home-section">

        <div className="section-header-row">

          <h2 className="home-section-title">Browse categories</h2>

          <Link href="/services" className="section-link">

            View All →

          </Link>

        </div>

        <CategoryGrid categories={categoryTiles} />

      </section>



      <PromoCards />

      <HomeSpotlight />

      <WhyChoose />



      <section className="home-section">

        <div className="section-header-row">

          <h2 className="home-section-title">Popular services</h2>

          <Link href="/services" className="section-link">

            View All →

          </Link>

        </div>

        <div className="popular-scroll">

          {popular.map((service) => (
            <HomeServiceMiniCard
              key={service.id}
              href={`/services/${service.category.slug}/${service.slug}`}
              name={service.name}
              priceLabel={formatPriceLabel(service.pricePaise, service.unit)}
              categorySlug={service.category.slug}
              categoryIcon={service.category.icon}
            />
          ))}

        </div>

      </section>



      <HomeHowItWorks />

      <HomeTestimonials />

      <HomeFaq />

      <HomeReferBanner />



      {recentlyViewed.length > 0 && (

        <section className="home-section">

          <h2 className="home-section-title">Recently viewed</h2>

          <div className="popular-scroll">

            {recentlyViewed.map((service) => (
              <HomeServiceMiniCard
                key={service.id}
                href={`/services/${service.category.slug}/${service.slug}`}
                name={service.name}
                priceLabel={formatPriceLabel(service.pricePaise, service.unit)}
                categorySlug={service.category.slug}
                categoryIcon={service.category.icon}
              />
            ))}

          </div>

        </section>

      )}



      {savedServices.length > 0 && (

        <section className="home-section">

          <h2 className="home-section-title">Saved services</h2>

          <div className="popular-scroll">

            {savedServices.map((service) => (
              <HomeServiceMiniCard
                key={service.id}
                href={`/services/${service.category.slug}/${service.slug}`}
                name={service.name}
                priceLabel={formatPriceLabel(service.pricePaise, service.unit)}
                categorySlug={service.category.slug}
                categoryIcon={service.category.icon}
              />
            ))}

          </div>

        </section>

      )}



      <HomeBottomCta />

    </div>

  );

}


