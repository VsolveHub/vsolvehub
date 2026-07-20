import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "@/lib/auth/session";
import { ProfileSubPage } from "@/components/customer/profile/ProfileSubPage";
import { ProfileBookingsSummary } from "@/components/customer/profile/ProfileStats";
import { getAllUserBookings } from "@/lib/bookings/user-bookings";
import { formatPrice } from "@/lib/format";
import { EmptyState } from "@/components/ui/primitives";

const KIND_LABELS = {
  service: "Service",
  vehicle: "Vehicle",
  accommodation: "Stay",
} as const;

export default async function ProfileBookingsPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/profile/bookings");

  const bookings = await getAllUserBookings(session.id);
  const totalPaise = bookings.reduce((sum, b) => sum + b.amountPaise, 0);

  return (
    <ProfileSubPage title="My bookings">
      <ProfileBookingsSummary count={bookings.length} totalPaise={totalPaise} />
      {bookings.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No bookings yet."
          action={
            <Link
              href="/services"
              className="inline-flex items-center justify-center rounded-[10px] bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-900"
            >
              Browse services
            </Link>
          }
        />
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {bookings.map((b) => {
            const isNoWorker = b.status === "pending" || b.status === "no_worker_found";
            const statusText = isNoWorker ? "NO WORKER FOUND" : b.status.replace(/_/g, " ").toUpperCase();

            return (
              <div
                key={`${b.kind}-${b.id}`}
                className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-900">{b.title}</h3>
                    <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                      {b.bookingRef}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                      isNoWorker ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {statusText}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {[KIND_LABELS[b.kind], b.categoryLabel, b.assignedPartnerName && `👤 ${b.assignedPartnerName}`]
                    .filter(Boolean)
                    .map((tag) => (
                      <span
                        key={tag as string}
                        className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600"
                      >
                        {tag}
                      </span>
                    ))}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-3 text-xs font-semibold text-gray-500">
                    <span>📅 {b.dateLabel}</span>
                    <span>💵 {formatPrice(b.amountPaise)}</span>
                  </div>
                  <Link
                    href={b.trackHref}
                    className="rounded-lg bg-[var(--color-brand-light)] px-3 py-1.5 text-xs font-black text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand)] hover:text-white"
                  >
                    View details
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ProfileSubPage>
  );
}
