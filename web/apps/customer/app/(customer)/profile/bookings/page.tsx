import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "@/lib/auth/session";
import { ProfileSubPage } from "@/components/customer/profile/ProfileSubPage";
import { ProfileBookingsSummary } from "@/components/customer/profile/ProfileStats";
import { getAllUserBookings } from "@/lib/bookings/user-bookings";
import { formatPrice } from "@/lib/format";

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
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden>
            📋
          </div>
          <p>No bookings yet.</p>
          <Link href="/services" className="btn btn-primary">
            Browse services
          </Link>
        </div>
      ) : (
        <div className="booking-list-v3">
          {bookings.map((b) => {
            const isNoWorker = b.status === "pending" || b.status === "no_worker_found";
            const statusText = isNoWorker ? "NO WORKER FOUND" : b.status.replace(/_/g, " ").toUpperCase();
            
            return (
              <div key={`${b.kind}-${b.id}`} className="booking-list-card-v3">
                <div className="card-header-v3">
                  <div className="card-title-group-v3">
                    <h3 className="card-title-v3">{b.title}</h3>
                    <p className="card-ref-v3">{b.bookingRef}</p>
                  </div>
                  <div className={`card-status-v3 ${isNoWorker ? 'status-alert' : 'status-normal'}`}>
                    {statusText}
                  </div>
                </div>

                <div className="card-tags-v3">
                  <span className="card-tag-v3">{KIND_LABELS[b.kind]}</span>
                  <span className="card-tag-v3">{b.categoryLabel}</span>
                  {b.assignedPartnerName && (
                    <span className="card-tag-v3">👤 {b.assignedPartnerName}</span>
                  )}
                </div>

                <div className="card-footer-v3">
                  <div className="card-meta-v3">
                    <span className="meta-item-v3">📅 {b.dateLabel}</span>
                    <span className="meta-item-v3">💵 {formatPrice(b.amountPaise)}</span>
                  </div>
                  <Link href={b.trackHref} className="card-details-btn-v3">
                    View Details
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
