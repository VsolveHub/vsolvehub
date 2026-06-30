import Link from "next/link";
import type { UserBookingListItem } from "@/lib/bookings/user-bookings";

type Props = {
  bookings: UserBookingListItem[];
};

export function MessagesInbox({ bookings }: Props) {
  const activeBookings = bookings.filter((b) => !["COMPLETED", "CANCELLED", "CLOSED"].includes(b.status));

  return (
    <div className="messages-inbox">
      <Link href="/profile/help" className="messages-thread messages-thread-support">
        <span className="messages-thread-avatar" aria-hidden>
          VS
        </span>
        <span className="messages-thread-body">
          <span className="messages-thread-top">
            <strong>V Solve Hub Support</strong>
            <span className="messages-thread-time">Always on</span>
          </span>
          <span className="messages-thread-preview">
            Need help? Call or email our support team.
          </span>
        </span>
      </Link>

      {activeBookings.length > 0 ? (
        <>
          <p className="messages-section-label">Booking chats</p>
          <div className="messages-thread-list">
            {activeBookings.map((booking) => (
              <Link key={`${booking.kind}-${booking.id}`} href={booking.trackHref} className="messages-thread">
                <span className="messages-thread-avatar messages-thread-avatar-booking" aria-hidden>
                  {booking.kind === "vehicle" ? "V" : booking.kind === "accommodation" ? "S" : "P"}
                </span>
                <span className="messages-thread-body">
                  <span className="messages-thread-top">
                    <strong>{booking.title}</strong>
                    <span className="messages-thread-time">{booking.dateLabel}</span>
                  </span>
                  <span className="messages-thread-preview">
                    {booking.categoryLabel} · Tap to open booking details
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state messages-empty">
          <p>No active booking chats yet.</p>
          <p className="text-sm text-muted">
            When you book a service, updates and contact options appear on the booking page.
          </p>
          <Link href="/services" className="btn btn-primary">
            Book a service
          </Link>
        </div>
      )}
    </div>
  );
}
