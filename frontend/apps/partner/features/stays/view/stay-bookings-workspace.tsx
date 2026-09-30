"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Card, EmptyState, formatDate, formatMoney } from "@vsolve/ui";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import {
  fetchPartnerStayReservations,
  partnerStayReservationAction,
  type StayReservation,
  type StayReservationAction,
} from "@/features/stays/queries";
import { STAY_SECTIONS } from "@/features/stays/view/stay-sections";
import {
  StayReservationDetailSheet,
  stayReservationStatusLabel,
  stayReservationTone,
} from "@/features/stays/view/stay-record-sheets";
import { SectionNav } from "@/features/workspace/view/section-nav";

/**
 * Paid stay reservations — the half of a host's stay inbox that has money in it.
 *
 * Split out of `stays-workspace.tsx` alongside enquiries. The card every row
 * opens carries the guest's name, number, the amounts and the check-in history,
 * which is the information a host needs in front of them at the desk — so the
 * row is a summary and the sheet holds the commands, rather than the row
 * offering "Check in" against a name it does not show.
 */
export function PartnerStayBookingsWorkspace() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reservations = useQuery({
    queryKey: ["partner-stays", "reservations"],
    queryFn: fetchPartnerStayReservations,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["partner-stays"] });
  };

  const reservationAction = useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: StayReservationAction;
      reason?: string;
    }) => partnerStayReservationAction(id, action, reason),
    onSuccess: invalidate,
  });

  const selected: StayReservation | null = selectedId
    ? (reservations.data ?? []).find((row) => row.id === selectedId) ?? null
    : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">Stays</p>
        <h1 className="mt-1 text-2xl font-extrabold text-navy-900">Bookings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Paid reservations across your properties. Open a booking for the guest, the amounts and
          check-in.
        </p>
      </div>

      <SectionNav label="Stay sections" items={STAY_SECTIONS} />

      <Card>
        {reservations.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
        {reservations.error ? (
          <p className="text-sm text-danger-text">{friendlyErrorMessage(reservations.error)}</p>
        ) : null}
        {reservations.data && reservations.data.length === 0 ? (
          <EmptyState
            compact
            title="No paid reservations yet"
            description="Hotel and short-stay bookings that guests pay for appear here."
          />
        ) : null}

        <ul className="flex flex-col gap-3">
          {reservations.data?.map((reservation) => (
            <li key={reservation.id}>
              <button
                type="button"
                onClick={() => setSelectedId(reservation.id)}
                className="w-full rounded-card border border-line p-3 text-left transition hover:border-line-strong hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-navy-900">
                    {reservation.property_title ?? "Stay"} · {reservation.unit_name ?? "Room"}
                  </span>
                  <Badge tone={stayReservationTone(reservation.status)}>
                    {stayReservationStatusLabel(reservation.status)}
                  </Badge>
                </span>
                <span className="block text-sm text-text-secondary">
                  {formatDate(`${reservation.check_in}T12:00:00`)} –{" "}
                  {formatDate(`${reservation.check_out}T12:00:00`)}
                  {typeof reservation.total_paise === "number"
                    ? ` · ${formatMoney(reservation.total_paise)}`
                    : ""}
                </span>
                <span className="mt-1 block text-sm text-text-secondary">
                  Guest: {reservation.customer_name || "—"}
                  {reservation.customer_phone ? ` · ${reservation.customer_phone}` : ""}
                </span>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-text-link">
                  View booking
                  <ChevronRight className="size-3.5" aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <StayReservationDetailSheet
        reservation={selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            reservationAction.reset();
          }
        }}
        onCheckIn={(id) => reservationAction.mutate({ id, action: "check_in" })}
        onCheckOut={(id) => reservationAction.mutate({ id, action: "check_out" })}
        onNoShow={(id) => reservationAction.mutate({ id, action: "no_show" })}
        onCancel={(id, reason) => reservationAction.mutate({ id, action: "cancel", reason })}
        isPending={reservationAction.isPending}
        actionError={
          reservationAction.error ? friendlyErrorMessage(reservationAction.error) : null
        }
      />
    </div>
  );
}
