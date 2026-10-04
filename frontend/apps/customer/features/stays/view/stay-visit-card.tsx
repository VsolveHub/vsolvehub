"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button } from "@vsolve/ui";

import { getVisitStatusBadge, visitDayLabel, visitWindowLabel } from "../model";
import { canCancelStayVisit, cancelStayVisit, type StayVisit } from "../queries";
import { OwnerContact } from "./owner-contact";

/** One visit in "My stays": when, what the owner said, and the owner's number once accepted. */
export function StayVisitCard({ visit }: { visit: StayVisit }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const badge = getVisitStatusBadge(visit.status);
  const cancel = useMutation({
    mutationFn: () => cancelStayVisit(visit.id),
    onSuccess: () => {
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["my-stay-visits"] });
    },
  });

  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <Badge tone={badge.tone} className="text-xs font-bold">
            {badge.label}
          </Badge>
          <h3 className="pt-1 text-lg font-bold text-text">{visit.property_title}</h3>
          {visit.unit_name ? (
            <p className="text-xs text-text-secondary">Room: {visit.unit_name}</p>
          ) : null}
        </div>
        <p className="flex items-center gap-1.5 rounded-control border border-line/60 bg-surface-sunken px-3 py-2 text-xs font-bold text-text">
          <CalendarClock className="size-4 text-action" aria-hidden />
          {visitDayLabel(visit.visit_date)} · {visitWindowLabel(visit.start_time, visit.end_time)}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-line/70 pt-4">
        {visit.status === "REQUESTED" ? (
          <p className="text-xs text-text-secondary">
            Waiting for the owner to accept. You&apos;ll be notified.
          </p>
        ) : null}
        {visit.status === "ACCEPTED" ? (
          <>
            <p className="text-sm font-semibold text-emerald-800">
              Your visit has been successfully accepted. See you there!
            </p>
            <OwnerContact
              hostName={visit.host_name}
              hostPhone={visit.host_phone}
              propertySlug={visit.property_slug}
            />
          </>
        ) : null}
        {visit.status === "DECLINED" ? (
          <div className="rounded-control border border-line bg-surface-sunken p-3 text-xs text-text-secondary">
            <p>The owner has not accepted your visit.</p>
            {visit.reason_text ? (
              <p className="mt-1">
                Reason: <strong className="font-semibold text-text">{visit.reason_text}</strong>
              </p>
            ) : null}
          </div>
        ) : null}

        {canCancelStayVisit(visit.status) ? (
          confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="w-full text-xs text-text-secondary">Cancel this visit?</p>
              <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
                Keep visit
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Cancel visit
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
              Cancel visit
            </Button>
          )
        ) : null}
        {cancel.isError ? (
          <p className="text-xs text-danger-text">{friendlyErrorMessage(cancel.error)}</p>
        ) : null}
      </div>
    </article>
  );
}
