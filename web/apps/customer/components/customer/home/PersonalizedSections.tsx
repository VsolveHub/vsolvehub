import Link from "next/link";

import { ActiveBookings } from "@/components/customer/home/ActiveBookings";
import { HomeServiceSquareAddCard } from "@/components/customer/home/HomeServiceSquareAddCard";
import { HomeServiceVerticalCard } from "@/components/customer/home/HomeServiceVerticalCard";

import { getServicesByIds, serializeService, serviceInclude, getPopularServices } from "@/lib/catalog/queries";
import { getRecentlyViewedIds } from "@/lib/recently-viewed";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { CART_STATUSES } from "@vsolve/db";
import { formatPriceLabel } from "@/lib/format";

export async function PersonalizedSections() {
  const [recentIds, session, popular] = await Promise.all([getRecentlyViewedIds(), getServerSession(), getPopularServices(5)]);

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

  // Merge recently viewed with popular to ensure we have exactly 5 items for a perfect grid
  const recentOrPopular = [...recentlyViewed];
  for (const p of popular) {
    if (recentOrPopular.length >= 5) break;
    if (!recentOrPopular.some(r => r.id === p.id)) {
      recentOrPopular.push(p as any);
    }
  }

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
      {recentOrPopular.length > 0 && (
        <section className="w-full bg-slate-50">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 py-10 sm:py-16">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Recommended for you</h2>
                <p className="text-sm font-semibold text-gray-500 mt-1">
                  Based on your recent activity
                </p>
              </div>
              <Link href="/services" className="text-sm font-bold text-[var(--color-brand)] hover:text-blue-700 bg-blue-50 px-4 py-2 rounded-full transition-colors flex items-center gap-2">
                See all <span>→</span>
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
              {recentOrPopular.map((service) => (
                <div key={service.id} className="w-full">
                  <HomeServiceSquareAddCard
                    href={`/services/${service.category.slug}/${service.slug}`}
                    name={service.name}
                    priceLabel={formatPriceLabel(service.pricePaise, service.unit)}
                    categorySlug={service.category.slug}
                    serviceSlug={service.slug}
                    serviceId={service.id}
                    pricePaise={service.pricePaise}
                    unit={service.unit}
                    imageUrl={service.imageUrl}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {savedServices.length > 0 && (
        <section className="w-full bg-white">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 py-10 sm:py-16">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Saved Services</h2>
              <Link href="/profile" className="text-sm font-bold text-[var(--color-brand)] hover:text-blue-700 bg-blue-50 px-4 py-2 rounded-full transition-colors flex items-center gap-2">
                See all <span>→</span>
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
              {savedServices.map((service) => (
                <div key={service.id} className="w-full">
                  <HomeServiceVerticalCard
                    href={`/services/${service.category.slug}/${service.slug}`}
                    name={service.name}
                    priceLabel={formatPriceLabel(service.pricePaise, service.unit)}
                    categorySlug={service.category.slug}
                    serviceSlug={service.slug}
                    serviceId={service.id}
                    pricePaise={service.pricePaise}
                    unit={service.unit}
                    imageUrl={service.imageUrl}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeBookings.length > 0 && (
        <section className="w-full bg-slate-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
            <ActiveBookings bookings={activeBookings} />
          </div>
        </section>
      )}
    </>
  );
}
