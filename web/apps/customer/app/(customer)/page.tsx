import Link from "next/link";

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
import { HomeServiceMiniCard } from "@/components/customer/home/HomeServiceMiniCard";
import { HomeServiceVerticalCard } from "@/components/customer/home/HomeServiceVerticalCard";
import { HomeServiceSquareAddCard } from "@/components/customer/home/HomeServiceSquareAddCard";
import { VSmartStories } from "@/components/customer/home/VSmartStories";
import { ActiveBookings } from "@/components/customer/home/ActiveBookings";
import type { ActiveBookingItem } from "@/components/customer/home/ActiveBookings";
import { AIAssistant } from "@/components/customer/home/AIAssistant";

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
  let activeBookings: ActiveBookingItem[] = [];

  if (session) {
    const [saved, standard, accommodation, vehicle] = await Promise.all([
      prisma.savedService.findMany({
        where: { userId: session.id },
        include: { service: { include: serviceInclude } },
        take: 6,
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.findMany({
        where: {
          userId: session.id,
          NOT: { status: { in: ["COMPLETED", "CANCELLED", "CLOSED"] } },
        },
        include: { service: { include: { category: true } } },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
      prisma.accommodationBooking.findMany({
        where: {
          userId: session.id,
          NOT: { status: { in: ["COMPLETED", "CANCELLED", "CLOSED"] } },
        },
        include: { property: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
      prisma.vehicleBooking.findMany({
        where: {
          userId: session.id,
          NOT: { status: { in: ["COMPLETED", "CANCELLED", "CLOSED"] } },
        },
        include: { rentalAsset: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
    ]);

    savedServices = saved.map((s) => serializeService(s.service));

    activeBookings = [
      ...standard.map((b) => ({
        id: b.id,
        ref: b.bookingRef,
        title: b.service.name,
        status: b.status,
        type: "service",
        date: new Date(b.slot).toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
        trackHref: `/booking/track/${b.bookingRef}`,
      })),
      ...accommodation.map((b) => ({
        id: b.id,
        ref: b.bookingRef,
        title: b.property.title,
        status: b.status,
        type: "accommodation",
        date: b.moveInDate || b.visitDate || "TBD",
        trackHref: `/accommodation/track/${b.bookingRef}`,
      })),
      ...vehicle.map((b) => ({
        id: b.id,
        ref: b.bookingRef,
        title: b.flowType === "rental" ? `${b.rentalAsset?.brand} ${b.rentalAsset?.model}` : "Vehicle Service",
        status: b.status,
        type: "vehicle",
        date: b.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        trackHref: `/vehicle/track/${b.bookingRef}`,
      })),
    ];
  }

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
        <div className="desktop-wide-layout" style={{ paddingBottom: '3rem', paddingTop: '3rem' }}>
          <NewAndNoteworthy />
        </div>
      </section>

      {/* Most booked services */}
      <section className="section-wrapper bg-white">
        <div className="desktop-wide-layout" style={{ paddingBottom: '3rem', paddingTop: '3rem' }}>
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
              />
            ))}
          </div>
        </div>
      </section>

      {/* Cleaning Essentials */}
      {recentlyViewed.length > 0 && (
        <section className="section-wrapper bg-gray">
          <div className="desktop-wide-layout section-pad-y">
            <div className="section-header-row" style={{ alignItems: 'flex-start' }}>
              <div>
                <h2 className="home-section-title">Cleaning Essentials</h2>
                <p className="nan-subtitle" style={{ color: '#4b5563', marginTop: '0.25rem' }}>Monthly cleaning essential services</p>
              </div>
              <Link href="/services" className="section-link">
                See all
              </Link>
            </div>
            <div className="popular-scroll">
              {recentlyViewed.map((service) => (
                <HomeServiceSquareAddCard
                  key={service.id}
                  href={`/services/${service.category.slug}/${service.slug}`}
                  name={service.name}
                  priceLabel={formatPriceLabel(service.pricePaise, service.unit)}
                  categorySlug={service.category.slug}
                  serviceSlug={service.slug}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Saved Services */}
      {savedServices.length > 0 && (
        <section className="section-wrapper bg-white">
          <div className="desktop-wide-layout section-pad-y">
            <div className="section-header-row">
              <h2 className="home-section-title">Saved Services</h2>
              <Link href="/profile" className="section-link">
                See all
              </Link>
            </div>
            <div className="popular-scroll">
              {savedServices.map((service) => (
                <HomeServiceVerticalCard
                  key={service.id}
                  href={`/services/${service.category.slug}/${service.slug}`}
                  name={service.name}
                  priceLabel={formatPriceLabel(service.pricePaise, service.unit)}
                  categorySlug={service.category.slug}
                  serviceSlug={service.slug}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Other Sections (Alternating) */}

      <section className="section-wrapper bg-gray">
        <div className="desktop-wide-layout section-pad-y">
          <AIAssistant />
          {activeBookings.length > 0 && (
            <div className="home-section active-bookings-wide" aria-label="Active bookings" style={{ marginTop: '2rem' }}>
              <ActiveBookings bookings={activeBookings} />
            </div>
          )}
        </div>
      </section>

      <section className="section-wrapper bg-white">
        <div className="desktop-wide-layout section-pad-y">
          <WhyChoose />
          <div style={{ height: '3rem' }} />
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
          <div style={{ height: '3rem' }} />
          <HomeBottomCta />
        </div>
      </section>
    </div>
  );
}
