import Link from "next/link";

import { ActiveBookings } from "@/components/customer/home/ActiveBookings";
import { HomeServiceSquareAddCard } from "@/components/customer/home/HomeServiceSquareAddCard";
import { HomeServiceVerticalCard } from "@/components/customer/home/HomeServiceVerticalCard";

import { getServicesByIds, serializeService, serviceInclude } from "@/lib/catalog/queries";
import { getRecentlyViewedIds } from "@/lib/recently-viewed";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { CART_STATUSES } from "@vsolve/db";
import { formatPriceLabel } from "@/lib/format";

/**
 * Session + personalized data (recently viewed, saved services, active bookings).
 * Rendered inside a <Suspense> boundary on the home page so the static, cached
 * catalog content paints immediately while these per-user DB queries stream in.
 */
export async function PersonalizedSections() {
  const [recentIds, session] = await Promise.all([getRecentlyViewedIds(), getServerSession()]);

  const [recentlyViewed, saved, standard, accommodation, vehicle] = await Promise.all([
    getServicesByIds(recentIds),
    session
      ? prisma.savedService.findMany({
          where: { userId: session.id },
          include: { service: { include: serviceInclude } },
          take: 6,
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    session
      ? prisma.booking.findMany({
          where: {
            userId: session.id,
            // CART_STATUSES keeps cart drafts out; "CLOSED" was never a booking
            // status and silently matched nothing.
            status: { notIn: [...CART_STATUSES, "COMPLETED", "CANCELLED"] },
          },
          include: { service: { include: { category: true } } },
          orderBy: { createdAt: "desc" },
          take: 3,
        })
      : Promise.resolve([]),
    session
      ? prisma.accommodationBooking.findMany({
          where: {
            userId: session.id,
            NOT: { status: { in: ["COMPLETED", "CANCELLED", "CLOSED"] } },
          },
          include: { property: true },
          orderBy: { createdAt: "desc" },
          take: 3,
        })
      : Promise.resolve([]),
    session
      ? prisma.vehicleBooking.findMany({
          where: {
            userId: session.id,
            NOT: { status: { in: ["COMPLETED", "CANCELLED", "CLOSED"] } },
          },
          include: { rentalAsset: true },
          orderBy: { createdAt: "desc" },
          take: 3,
        })
      : Promise.resolve([]),
  ]);

  const savedServices = saved.map((s) => serializeService(s.service));

  const activeBookings = [
    ...standard.map((b) => ({
      id: b.id,
      ref: b.bookingRef,
      title: b.service.name,
      status: b.status,
      type: "service" as const,
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
      type: "accommodation" as const,
      date: b.moveInDate || b.visitDate || "TBD",
      trackHref: `/accommodation/track/${b.bookingRef}`,
    })),
    ...vehicle.map((b) => ({
      id: b.id,
      ref: b.bookingRef,
      title: b.flowType === "rental" ? `${b.rentalAsset?.brand} ${b.rentalAsset?.model}` : "Vehicle Service",
      status: b.status,
      type: "vehicle" as const,
      date: b.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      trackHref: `/vehicle/track/${b.bookingRef}`,
    })),
  ];

  return (
    <>
      {recentlyViewed.length > 0 && (
        <section className="section-wrapper bg-gray">
          <div className="desktop-wide-layout section-pad-y">
            <div className="section-header-row" style={{ alignItems: "flex-start" }}>
              <div>
                <h2 className="home-section-title">Cleaning Essentials</h2>
                <p className="nan-subtitle" style={{ color: "#4b5563", marginTop: "0.25rem" }}>
                  Monthly cleaning essential services
                </p>
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
                  serviceId={service.id}
                  pricePaise={service.pricePaise}
                  unit={service.unit}
                />
              ))}
            </div>
          </div>
        </section>
      )}

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
                  serviceId={service.id}
                  pricePaise={service.pricePaise}
                  unit={service.unit}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {activeBookings.length > 0 && (
        <section className="section-wrapper bg-gray">
          <div className="desktop-wide-layout section-pad-y">
            <div className="home-section active-bookings-wide" aria-label="Active bookings">
              <ActiveBookings bookings={activeBookings} />
            </div>
          </div>
        </section>
      )}
    </>
  );
}
