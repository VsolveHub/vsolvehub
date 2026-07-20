import Link from "next/link";
import type { UserBookingListItem } from "@/lib/bookings/user-bookings";
import { EmptyState } from "@/components/ui/primitives";

type Props = {
  bookings: UserBookingListItem[];
};

const THREAD =
  "flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50";

export function MessagesInbox({ bookings }: Props) {
  const activeBookings = bookings.filter(
    (b) => !["COMPLETED", "CANCELLED", "CLOSED"].includes(b.status)
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">
        Chat with support or open an active booking to track progress.
      </p>

      <Link href="/profile/help" className={`${THREAD} border-[var(--color-brand)]/20 bg-[var(--color-brand-light)]/40`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-sm font-black text-white" aria-hidden>
          VS
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <strong className="text-sm font-bold text-gray-900">V Solve Hub Support</strong>
            <span className="shrink-0 text-xs text-gray-400">Always on</span>
          </span>
          <span className="mt-0.5 block truncate text-sm text-gray-500">
            Need help? Call or email our support team.
          </span>
        </span>
      </Link>

      {activeBookings.length > 0 ? (
        <>
          <p className="mt-2 text-xs font-black uppercase tracking-widest text-gray-400">
            Booking chats
          </p>
          <div className="flex flex-col gap-3">
            {activeBookings.map((booking) => (
              <Link key={`${booking.kind}-${booking.id}`} href={booking.trackHref} className={THREAD}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-black text-gray-600" aria-hidden>
                  {booking.kind === "vehicle" ? "V" : booking.kind === "accommodation" ? "S" : "P"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <strong className="truncate text-sm font-bold text-gray-900">{booking.title}</strong>
                    <span className="shrink-0 text-xs text-gray-400">{booking.dateLabel}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-gray-500">
                    {booking.categoryLabel} · Tap to open booking details
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon="💬"
          title="No active booking chats yet."
          description="When you book a service, updates and contact options appear on the booking page."
          action={
            <Link
              href="/services"
              className="inline-flex items-center justify-center rounded-[10px] bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-900"
            >
              Book a service
            </Link>
          }
        />
      )}
    </div>
  );
}
