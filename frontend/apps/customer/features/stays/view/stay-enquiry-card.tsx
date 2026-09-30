"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, MessageSquare } from "lucide-react";
import { Badge, Button, formatDate } from "@vsolve/ui";

import {
  formatPaise,
  getEnquiryStatusBadge,
  pricePeriodOf,
  stayLengthLabel,
  type StayEnquiry,
} from "../model";
import { canCancelStayEnquiry, cancelStayEnquiry } from "../queries";

interface StayEnquiryCardProps {
  enquiry: StayEnquiry;
}

export function StayEnquiryCard({ enquiry }: StayEnquiryCardProps) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const statusInfo = getEnquiryStatusBadge(enquiry.status);
  const cancellable = canCancelStayEnquiry(enquiry.status);

  const cancel = useMutation({
    mutationFn: () => cancelStayEnquiry(enquiry.id),
    onSuccess: () => {
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["my-stay-enquiries"] });
    },
  });

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-xs transition hover:shadow-raised">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Badge tone={statusInfo.tone} className="font-bold text-xs">
            {statusInfo.label}
          </Badge>

          <h3 className="pt-1 text-lg font-bold text-text">
            {enquiry.property_title || "Stay Property"}
          </h3>

          <p className="text-xs text-text-secondary">
            Room: <strong className="text-text">{enquiry.unit_name || "Standard room"}</strong> ·{" "}
            {enquiry.guest_count ?? 1} Guest{enquiry.guest_count === 1 ? "" : "s"}
          </p>
        </div>

        <div className="rounded-control border border-line/60 bg-surface-sunken p-3 text-right sm:min-w-40">
          <div className="text-xs text-text-secondary">Estimate</div>
          <div className="text-lg font-extrabold text-action">
            {formatPaise(enquiry.total_quote_paise ?? 0)}
          </div>
          <div className="mt-0.5 text-[11px] text-text-secondary">
            {enquiry.stay_length
              ? stayLengthLabel(enquiry.stay_length, pricePeriodOf(enquiry.price_period))
              : `${enquiry.nights ?? 1} night${(enquiry.nights ?? 1) === 1 ? "" : "s"}`}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-line/70 pt-4 text-xs text-text-secondary sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 shrink-0 text-action" />
          <span>
            Stay Window:{" "}
            <strong className="font-bold text-text">{formatDate(`${enquiry.check_in}T12:00:00`)}</strong>{" "}
            to{" "}
            <strong className="font-bold text-text">
              {formatDate(`${enquiry.check_out}T12:00:00`)}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Clock className="size-4 shrink-0 text-action" />
          <span>
            Submitted:{" "}
            <strong className="font-medium text-text">
              {enquiry.created_at ? formatDate(enquiry.created_at) : "Recent"}
            </strong>
          </span>
        </div>
      </div>

      {enquiry.message ? (
        <div className="mt-3 rounded-control bg-surface-sunken p-3 text-xs text-text-secondary">
          <span className="font-semibold text-text">Your Note: </span>
          {enquiry.message}
        </div>
      ) : null}

      {enquiry.host_response ? (
        <div className="mt-3 space-y-1 rounded-control border border-emerald-200/80 bg-emerald-50/80 p-3.5 text-xs text-emerald-950">
          <div className="flex items-center gap-1.5 font-bold text-emerald-800">
            <MessageSquare className="size-3.5 text-emerald-700" />
            Host Message ({enquiry.responded_at ? formatDate(enquiry.responded_at) : "Recently"}):
          </div>
          <p className="whitespace-pre-line leading-relaxed">{enquiry.host_response}</p>
        </div>
      ) : enquiry.status !== "CANCELLED" ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
          <Clock className="size-3.5 text-text-secondary" />
          <span>Awaiting host reply. You will be notified when the host responds.</span>
        </div>
      ) : null}

      {cancellable ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-line/70 pt-4">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="w-full text-xs text-text-secondary">Withdraw this enquiry?</p>
              <Button
                size="sm"
                variant="secondary"
                disabled={cancel.isPending}
                onClick={() => setConfirming(false)}
              >
                Keep enquiry
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
              Cancel enquiry
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
