"use client";

import {
  Badge,
  Button,
  Card,
  ConfirmAction,
  ErrorState,
  FactList,
  Readout,
  buttonStyles,
} from "@vsolve/ui";
import { describeError, useServerCountdown } from "@vsolve/query";
import Link from "next/link";
import { useState } from "react";

import { timeAgo } from "@/lib/format";
import type { EnquiryRecord } from "@/features/enquiry/model/wire";
import { planVisitOf } from "@/features/enquiry/model/wire";

import { formatVisitInstant } from "../model/slot-grid";
import {
  describeEstimateWindow,
  describeVisitStatus,
  visitPermissionsFor,
} from "../model/visit-state";
import { useCompleteVisit, useConfirmVisitArrival, useReportCustomerNoShow } from "../queries";

/**
 * The A5 plan visit on this enquiry: where it stands, and the two commands that
 * move it.
 *
 * This is what makes `M2-FE-315`'s completed-visit guard a real path rather than
 * a dead end. An A5 estimate may only be submitted against a `COMPLETED` visit —
 * `m2_visit_not_completed` is the refusal — so a vendor with no way to *complete*
 * a visit has an estimate they can never send. Arrival and completion are both
 * published (`POST /site-visits/{id}/arrival/`, `.../complete/`), and they live
 * beside the estimate rather than on some other screen because they happen in
 * the same five minutes, on the same phone, at the same address.
 *
 * ## Arrival is the non-OTP fallback, and that is the default path
 *
 * Not a degraded one. The start OTP is M3 activation; `arrival_method` is stored
 * so a historical arrival still says truthfully how it was proved once OTP is
 * switched on. Either party may confirm, so the customer confirming first is not
 * a conflict.
 *
 * ## Completion does not require arrival
 *
 * `complete_site_visit` accepts `SCHEDULED` as well as `IN_PROGRESS`, and this
 * screen honours that. A basement with no signal is a real place, and refusing
 * to let a vendor close a visit they attended because a button never reached the
 * server would be the wrong failure — especially when the estimate window starts
 * at completion.
 *
 * ## No money is promised here
 *
 * The visit payout is earned on a completed visit **plus** a usable estimate
 * inside the window. Nothing on this panel implies that arriving, or completing,
 * pays anything on its own.
 */

const TONE = {
  action: "action",
  progress: "info",
  settled: "neutral",
  gone: "neutral",
} as const;

export interface VisitDayPanelProps {
  readonly enquiry: EnquiryRecord;
  /** Where the on-site estimate composer lives, for this workspace. */
  readonly estimateHref: string;
}

export function VisitDayPanel({ enquiry, estimateHref }: VisitDayPanelProps) {
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [reportingNoShow, setReportingNoShow] = useState(false);

  const visit = planVisitOf(enquiry.siteVisits);
  const arrival = useConfirmVisitArrival(enquiry.id);
  const complete = useCompleteVisit(enquiry.id);
  const noShow = useReportCustomerNoShow(enquiry.id);

  const estimateCountdown = useServerCountdown(visit?.estimate_due_at ?? null, 60_000);

  if (visit === null) return null;

  const status = describeVisitStatus(visit.status);
  const permissions = visitPermissionsFor(visit);
  const pending = arrival.isPending || complete.isPending || noShow.isPending;
  const error = arrival.error ?? complete.error ?? noShow.error;
  const presentation = error ? describeError(error, "mutation") : null;
  // `SiteVisit.timezone` (1.26.0). Until it was published this row could only
  // say "in two days", which is not a time a vendor can turn up at.
  const when = visit.scheduled_for
    ? formatVisitInstant(visit.scheduled_for, visit.timezone)
    : null;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">Your visit</h2>
        <Badge tone={TONE[status.tone]} dot>
          {status.label}
        </Badge>
      </div>

      <p className="text-sm leading-6 text-text-secondary">{status.meaning}</p>

      <FactList
        items={[
          {
            label: "When",
            // Null while a first-vendor slot is held and the customer's plan
            // payment is still being verified. Said plainly rather than blank.
            value:
              when && visit.scheduled_for
                ? `${when.label} (${timeAgo(visit.scheduled_for)})`
                : "Held — confirmed once the customer pays",
          },
          ...(visit.duration_minutes !== null
            ? [{ label: "On site for", value: `${visit.duration_minutes} minutes` }]
            : []),
          ...(visit.arrival_confirmed_at !== null
            ? [{ label: "Arrived", value: timeAgo(visit.arrival_confirmed_at) }]
            : []),
          ...(visit.completed_at !== null
            ? [{ label: "Closed", value: timeAgo(visit.completed_at) }]
            : []),
        ]}
      />

      {when ? (
        <p className="text-xs leading-5 text-text-muted">
          {when.zoneUnsupported
            ? `Shown in your device's clock — this phone does not recognise ${visit.timezone}, which is the site's own timezone.`
            : `Times are in ${visit.timezone}, the timezone of the place you are going to.`}
        </p>
      ) : null}

      {visit.status === "COMPLETED" ? (
        <div className="flex flex-col gap-2">
          {visit.estimate_due_at && estimateCountdown ? (
            <Readout
              label="Estimate due in"
              value={estimateCountdown.isExpired ? "Past due" : estimateCountdown.display}
              announce={
                estimateCountdown.isExpired
                  ? "The estimate window has passed"
                  : estimateCountdown.announce
              }
              tone={estimateCountdown.isExpired ? "danger" : "warning"}
              size="sm"
              caption={`Due ${timeAgo(visit.estimate_due_at)}`}
            />
          ) : null}
          <p className="text-sm leading-6 text-text-secondary">
            {describeEstimateWindow(visit.estimate_due_at)}
          </p>
        </div>
      ) : null}

      {visit.cancellation_reason_code ? (
        <p className="text-sm leading-6 text-text-secondary">
          Recorded reason: {visit.cancellation_reason_code.replace(/[_-]+/g, " ")}
        </p>
      ) : null}

      {presentation ? (
        <ErrorState
          inline
          title={presentation.title}
          message={presentation.message}
          severity={presentation.severity}
          actionLabel="Try again"
          onAction={() => {
            arrival.reset();
            complete.reset();
            noShow.reset();
          }}
          reference={presentation.reference}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {permissions.canConfirmArrival ? (
          <Button
            disabled={pending}
            loading={arrival.isPending}
            loadingLabel="Recording"
            onClick={() => arrival.mutate({ siteVisitId: visit.id })}
          >
            I am on site
          </Button>
        ) : null}

        {permissions.canComplete ? (
          <Button variant="outline" disabled={pending} onClick={() => setConfirmingComplete(true)}>
            Close the visit
          </Button>
        ) : null}

        {permissions.canEstimate ? (
          // A real anchor, not a button that routes: the composer is a
          // destination a vendor may well want to open in a second tab while
          // they are standing in the customer's hallway.
          <Link href={estimateHref} className={buttonStyles()}>
            Write the estimate
          </Link>
        ) : null}

        {permissions.canReportCustomerNoShow ? (
          <Button variant="ghost" disabled={pending} onClick={() => setReportingNoShow(true)}>
            Nobody was there
          </Button>
        ) : null}
      </div>

      <ConfirmAction
        open={confirmingComplete}
        onOpenChange={setConfirmingComplete}
        title="Close this visit"
        consequence="Closing the visit starts the clock on your estimate. Send it inside that window — a completed visit that never produces an estimate is refunded to the customer, pays you nothing, and counts against your standing."
        confirmLabel="Close it"
        pending={complete.isPending}
        onConfirm={() =>
          complete.mutate(
            { siteVisitId: visit.id },
            { onSuccess: () => setConfirmingComplete(false) },
          )
        }
      />

      <ConfirmAction
        open={reportingNoShow}
        onOpenChange={setReportingNoShow}
        title="Report that nobody was on site"
        consequence="Vsolve records that you travelled and found nobody there, and asks the customer what happened. You travelled, so your visit payout still stands. This is not a way to cancel a visit you did not attend."
        confirmLabel="Report it"
        destructive
        pending={noShow.isPending}
        onConfirm={() =>
          noShow.mutate({ siteVisitId: visit.id }, { onSuccess: () => setReportingNoShow(false) })
        }
      />
    </Card>
  );
}
