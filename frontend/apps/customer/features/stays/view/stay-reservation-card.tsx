"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, CheckCircle2 } from "lucide-react";
import { Badge, Button, formatDate } from "@vsolve/ui";

import { formatPaise } from "../model";
import {
  canCancelStayReservation,
  cancelStayReservation,
  type StayReservation,
} from "../queries";

interface StayReservationCardProps {
  reservation: StayReservation;
}

export function StayReservationCard({ reservation }: StayReservationCardProps) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const getBadgeTone = () => {
    switch (reservation.status) {
      case "CONFIRMED":
      case "CHECKED_IN":
      case "CHECKED_OUT":
        return "success";
      case "PAYMENT_PENDING":
        return "warning";
      case "CANCELLED":
      case "NO_SHOW":
        return "danger";
      default:
        return "neutral";
    }
  };

  const getLabel = () => {
    switch (reservation.status) {
      case "CONFIRMED":
        return "Confirmed";
      case "CHECKED_IN":
        return "Checked In";
      case "CHECKED_OUT":
        return "Checked Out";
      case "PAYMENT_PENDING":
        return "Payment Pending";
      case "CANCELLED":
        return "Cancelled";
      case "NO_SHOW":
        return "No Show";
      default:
        return (reservation.status ?? "Held").replace("_", " ");
    }
  };

  const cancellable = canCancelStayReservation(reservation.status);

  const cancel = useMutation({
    mutationFn: () => cancelStayReservation(reservation.id),
    onSuccess: () => {
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["my-stay-reservations"] });
    },
  });

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-xs transition hover:shadow-raised">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Badge tone={getBadgeTone()} className="font-bold text-xs uppercase tracking-wide">
            {getLabel()}
          </Badge>

          <h3 className="pt-1 text-lg font-bold text-text">
            {reservation.property_title || "Stay Property"}
          </h3>

          <p className="text-xs text-text-secondary">
            Room: <strong className="text-text">{reservation.unit_name || "Standard room"}</strong> ·{" "}
            {reservation.guest_count ?? 1} Guest{reservation.guest_count === 1 ? "" : "s"}
          </p>
        </div>

        <div className="rounded-control border border-line/60 bg-surface-sunken p-3 text-right sm:min-w-40">
          <div className="text-xs text-text-secondary">Paid Amount</div>
          <div className="text-lg font-extrabold text-action">
            {formatPaise(reservation.total_paise ?? 0)}
          </div>
          <div className="mt-0.5 text-[11px] text-text-secondary">
            {reservation.nights ?? 1} night{(reservation.nights ?? 1) === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-line/70 pt-4 text-xs text-text-secondary sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 shrink-0 text-action" />
          <span>
            Stay Window:{" "}
            <strong className="font-bold text-text">
              {formatDate(`${reservation.check_in}T12:00:00`)}
            </strong>{" "}
            to{" "}
            <strong className="font-bold text-text">
              {formatDate(`${reservation.check_out}T12:00:00`)}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-action" />
          <span>
            Reserved:{" "}
            <strong className="font-medium text-text">
              {reservation.created_at ? formatDate(reservation.created_at) : "Recent"}
            </strong>
          </span>
        </div>
      </div>

      {cancellable ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-line/70 pt-4">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="w-full text-xs text-text-secondary">
                Cancel before check-in? If payment was captured, a full refund will be requested.
              </p>
              <Button
                size="sm"
                variant="secondary"
                disabled={cancel.isPending}
                onClick={() => setConfirming(false)}
              >
                Keep reservation
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Confirm cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
              Cancel reservation
            </Button>
          )}
          {cancel.isError ? (
            <p className="text-xs text-danger-text">{(cancel.error as Error).message}</p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
