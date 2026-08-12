"use client";

import { Badge, Button, Card, Field, Input, formatMoney } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { useState } from "react";

import { timeAgo } from "@/lib/format";
import { permissionsFor } from "../model/enquiry-state";
import type { EnquiryRecord } from "../model/wire";
import { useRequestSiteVisit } from "../queries";

/**
 * Asking for a paid visit before quoting.
 *
 * Closes what is buildable of `M2-FE-306`. Two holes are designed around here
 * rather than discovered later, and both are stated on screen:
 *
 * ## The visit can be requested and never scheduled
 *
 * `schedule_site_visit` and `complete_site_visit` exist in
 * `apps/requirements/proposals.py` and are published on **no route**. So a visit
 * this screen creates sits at `REQUESTED` and nothing in either app can move it.
 * The panel says exactly that. It does not render a "Scheduled" step nobody can
 * reach, and it does not quietly treat `REQUESTED` as though a date were coming
 * — an honest dead end beats a lifecycle that fakes its next transition.
 * Requested in `frontend-execution-plan.md` §7.
 *
 * ## There is no callback flow at all
 *
 * `M2-FE-306` pairs a site visit with callback request and scheduling. Nothing
 * in contract 1.21.0, proposal 0012 or proposal 0013 publishes a callback, and a
 * callback is by definition a phone number crossing between two parties who have
 * not been authorized to exchange one. So no callback control is built — a
 * button that silently does nothing is worse than its absence — and the panel
 * names the two channels that do work.
 *
 * ## The fee is the vendor's own
 *
 * `SiteVisitRequestSerializer` publishes no default and the domain refuses a
 * non-positive fee: "A site visit needs a fee. Free visits are not offered."
 * There is no platform rate to show, so the vendor states theirs. Whether it
 * comes off the final price is theirs to decide too, and it is the thing a
 * customer weighs, so it is a visible choice rather than a hidden default.
 */

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Requested",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No show",
};

export interface SiteVisitPanelProps {
  readonly enquiry: EnquiryRecord;
}

export function SiteVisitPanel({ enquiry }: SiteVisitPanelProps) {
  const [feeRupees, setFeeRupees] = useState("");
  const [adjusts, setAdjusts] = useState(true);
  const [touched, setTouched] = useState(false);

  const requestVisit = useRequestSiteVisit(enquiry.id);
  const permissions = permissionsFor(enquiry.status);

  const parsed = Number(feeRupees.trim().replace(/,/g, ""));
  const feePaise =
    feeRupees.trim() !== "" && Number.isFinite(parsed) && parsed > 0
      ? Math.round(parsed * 100)
      : null;
  const feeError =
    touched && feePaise === null
      ? "Enter what you charge to visit. Vsolve does not offer free site visits."
      : undefined;

  const existing = enquiry.siteVisits;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold text-text">Site visit</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          If you cannot price this without seeing the place, ask for a paid visit. The fee is what
          makes the trip worth making before you have won the job.
        </p>
      </div>

      {existing.length > 0 ? (
        <ul className="flex list-none flex-col gap-2 p-0">
          {existing.map((visit) => (
            <li
              key={visit.id}
              className="rounded-control border border-line bg-surface-sunken p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-text">
                  {formatMoney(visit.fee_paise)}
                </span>
                <Badge tone={visit.status === "COMPLETED" ? "success" : "info"} dot>
                  {STATUS_LABEL[visit.status] ?? visit.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                {visit.adjusts_against_final_price
                  ? "Comes off your final price if the customer goes ahead with you."
                  : "Charged whether or not the customer goes ahead with you."}
              </p>
              {visit.scheduled_for ? (
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  Scheduled for {timeAgo(visit.scheduled_for)}
                </p>
              ) : (
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  Vsolve has your request. Scheduling a date is not built yet, so nobody can put a
                  time against this from either app — Operations will arrange it with you directly.
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {permissions.canRequestSiteVisit ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (feePaise === null || requestVisit.isPending) return;
            requestVisit.mutate(
              { feePaise, adjustsAgainstFinalPrice: adjusts },
              { onSuccess: () => setFeeRupees("") },
            );
          }}
        >
          <Field
            label="Your visit fee"
            description="In rupees. This is your charge, not a Vsolve rate."
            required
            error={
              feeError ??
              (requestVisit.error ? describeError(requestVisit.error, "mutation").message : undefined)
            }
          >
            <Input
              type="text"
              inputMode="decimal"
              value={feeRupees}
              onChange={(event) => setFeeRupees(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="500"
              disabled={requestVisit.isPending}
            />
          </Field>

          <label className="flex min-h-11 items-center gap-3 text-sm text-text">
            <input
              type="checkbox"
              checked={adjusts}
              onChange={(event) => setAdjusts(event.target.checked)}
              disabled={requestVisit.isPending}
              className="size-4 accent-action"
            />
            Take this off my final price if the customer goes ahead
          </label>

          <Button
            type="submit"
            variant="outline"
            // No idempotency key is declared on this path, so a second
            // submission would create a second visit request rather than
            // replaying the first.
            disabled={requestVisit.isPending}
            loading={requestVisit.isPending}
            loadingLabel="Requesting"
          >
            Request a visit
          </Button>
        </form>
      ) : null}

      <p className="text-xs leading-5 text-text-muted">
        Vsolve does not arrange phone calls between you and the customer. A written question and a
        paid visit are the only two ways to find out more, and both stay on the record.
      </p>
    </Card>
  );
}
