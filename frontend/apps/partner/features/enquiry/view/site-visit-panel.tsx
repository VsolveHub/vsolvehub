"use client";

import { Badge, Button, Card, Field, Input, formatMoney } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { useState } from "react";

import { timeAgo } from "@/lib/format";
import { permissionsFor } from "../model/enquiry-state";
import type { EnquiryRecord } from "../model/wire";
import { useRequestSiteVisit } from "../queries";

/**
 * Asking for a paid **ad-hoc** visit, beside the A5 plan visit rather than
 * instead of it.
 *
 * Closes what is buildable of `M2-FE-306`. Three things are designed around here
 * rather than discovered later:
 *
 * ## Plan visits are not this panel's
 *
 * `is_plan_visit` (1.24.0) separates the two, and the A5 plan visit belongs to
 * `features/visit/view/visit-day-panel.tsx` — it is paid out of the customer's
 * visit plan, occupies one of its shares, and opens the estimate window when it
 * completes. Listing it here as well would show a vendor one visit twice, with
 * two different sets of controls.
 *
 * ## An ad-hoc visit can be requested and this app cannot put a time on it
 *
 * `POST /site-visits/{id}/schedule/` is published (1.22.0) and takes both
 * parties — the vendor proposes a slot they can travel in, the customer confirms
 * a time somebody will be on site. **No screen in this app calls it for an
 * ad-hoc visit**, because a one-sided date picker would offer a time nobody had
 * agreed to. So a visit this panel creates sits at `REQUESTED` until Operations
 * or the customer moves it, and the panel says exactly that rather than
 * rendering a lifecycle it cannot advance. Logged in
 * `frontend-execution-plan.md` §7.
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
  IN_PROGRESS: "On site",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  // The enum carries no bare `NO_SHOW`; it names which party did not turn up,
  // and the two settle completely differently.
  VENDOR_NO_SHOW: "You did not arrive",
  CUSTOMER_NO_SHOW: "Nobody was there",
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

  // Ad-hoc visits only. The A5 plan visit is rendered by `VisitDayPanel`, which
  // owns the arrival and completion commands that go with it.
  const existing = enquiry.siteVisits.filter((visit) => !visit.is_plan_visit);

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
                  Vsolve has your request. A date needs the customer to agree to it as well, and
                  this app cannot set one on its own — Operations will arrange it with you both.
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
