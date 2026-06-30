import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "@/lib/auth/session";
import { ProfileSubPage } from "@/components/customer/profile/ProfileSubPage";
import { ProfileBookingsSummary } from "@/components/customer/profile/ProfileStats";
import { getAllUserBookings } from "@/lib/bookings/user-bookings";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";

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
          <p>No bookings yet.</p>
          <Link href="/services" className="btn btn-primary">
            Browse services
          </Link>
        </div>
      ) : (
        <div className="stack">
          {bookings.map((b) => (
            <Link key={`${b.kind}-${b.id}`} href={b.trackHref} className="card">
              <div className="flex-between">
                <p className="card-title">{b.title}</p>
                <Badge status={b.status}>{b.status.replace(/_/g, " ")}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <p className="card-text m-0">{b.bookingRef}</p>
                {b.assignedPartnerName && (
                  <p className="text-[10px] bg-purple-50 text-purple-700 border border-purple-100 px-1.5 py-0.5 rounded-md font-extrabold m-0">
                    👤 {b.assignedPartnerName}
                  </p>
                )}
              </div>
              <p className="text-sm text-muted">
                {KIND_LABELS[b.kind]} · {b.categoryLabel}
              </p>
              <p className="text-sm text-muted">
                {b.dateLabel} · {formatPrice(b.amountPaise)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </ProfileSubPage>
  );
}
