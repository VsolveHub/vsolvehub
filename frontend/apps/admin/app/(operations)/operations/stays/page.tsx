"use client";

import { useQuery } from "@tanstack/react-query";
import { factEntries, MarketplaceQueue, moneyLine } from "@/features/moderation/marketplace-queue";
import { fetchOpsStayEnquiries, fetchOpsStayReservations, fetchOpsStays, moderateOpsStay } from "@/features/moderation/queries";
import { Card, EmptyState, formatDate, formatMoney } from "@vsolve/ui";

export default function OpsStaysPage() {
  const enquiries = useQuery({
    queryKey: ["ops-stays-enquiries"],
    queryFn: fetchOpsStayEnquiries,
  });

  const reservations = useQuery({
    queryKey: ["ops-stays-reservations"],
    queryFn: fetchOpsStayReservations,
  });

  return (
    <div className="flex flex-col gap-8">
      <MarketplaceQueue
        heading="Stay properties"
        queryKey="ops-stays"
        load={async () => {
          const rows = await fetchOpsStays();
          return rows.map((row) => {
            const media = (row as { media?: { url?: string }[] }).media;
            const nightly = row.units?.[0]?.nightly_rate_paise;
            const nightlyLine = moneyLine(nightly, "/ night");
            return {
              id: row.id,
              title: row.title,
              public_state: row.public_state,
              partyName: row.host_name,
              moderation_status: row.moderation_status,
              photoUrl: media?.[0]?.url,
              location: row.location_text || undefined,
              moneyLines: nightlyLine ? [nightlyLine] : [],
              facts: factEntries(row.structured_fields),
            };
          });
        }}
        moderate={moderateOpsStay}
      />

      <Card>
        <h2 className="mb-3 text-base font-semibold text-navy-900">Enquiries</h2>
        {enquiries.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
        {enquiries.error ? (
          <p className="text-sm text-danger-text">{(enquiries.error as Error).message}</p>
        ) : null}
        {enquiries.data && enquiries.data.length === 0 ? (
          <EmptyState compact title="No enquiries" description="Guest questions show up here." />
        ) : null}
        <ul className="flex flex-col gap-3">
          {enquiries.data?.map((enquiry) => (
            <li key={enquiry.id} className="rounded-card border border-line p-3">
              <p className="font-semibold text-navy-900">{enquiry.property_title}</p>
              <p className="text-sm text-text-secondary">
                {enquiry.status} · {formatDate(`${enquiry.check_in}T12:00:00`)} –{" "}
                {formatDate(`${enquiry.check_out}T12:00:00`)}
                {typeof enquiry.total_quote_paise === "number"
                  ? ` · ${formatMoney(enquiry.total_quote_paise)}`
                  : ""}
              </p>
              <p className="mt-1 text-sm text-text-secondary">Guest: {enquiry.guest_count || 1}</p>
              {enquiry.message ? <p className="mt-2 text-sm">{enquiry.message}</p> : null}
              {enquiry.host_response ? (
                <p className="mt-2 text-sm text-text-secondary">Host replied: {enquiry.host_response}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-navy-900">Reservations</h2>
        {reservations.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
        {reservations.error ? (
          <p className="text-sm text-danger-text">{(reservations.error as Error).message}</p>
        ) : null}
        {reservations.data && reservations.data.length === 0 ? (
          <EmptyState
            compact
            title="No reservations"
            description="Hotel / short-stay bookings show up here."
          />
        ) : null}
        <ul className="flex flex-col gap-3">
          {reservations.data?.map((reservation) => (
            <li key={reservation.id} className="rounded-card border border-line p-3">
              <p className="font-semibold text-navy-900">
                {reservation.property_title ?? "Stay"} · {reservation.unit_name ?? "Room"}
              </p>
              <p className="text-sm text-text-secondary">
                {reservation.status} · {formatDate(`${reservation.check_in}T12:00:00`)} –{" "}
                {formatDate(`${reservation.check_out}T12:00:00`)}
                {typeof reservation.total_paise === "number"
                  ? ` · ${formatMoney(reservation.total_paise)}`
                  : ""}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Guest: {reservation.customer_name || "—"}
                {reservation.customer_phone ? ` · ${reservation.customer_phone}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
