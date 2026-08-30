"use client";

import {
  Badge,
  Button,
  Card,
  ConfirmAction,
  ErrorState,
  FactList,
  FactTile,
  Readout,
  Spinner,
  buttonStyles,
  formatMoney,
} from "@vsolve/ui";
import { describeError, useServerCountdown } from "@vsolve/query";
import Link from "next/link";
import { useState } from "react";

import { Pictogram, type PictogramName } from "@/components/pictogram";
import { timeAgo } from "@/lib/format";
import type { EnquiryRecord } from "@/features/enquiry/model/wire";
import { planVisitOf } from "@/features/enquiry/model/wire";

import { formatVisitInstant } from "../model/slot-grid";
import {
  describeVisitStatus,
  visitPermissionsFor,
  type SiteVisitStatus,
} from "../model/visit-state";
import {
  useCompleteVisit,
  useConfirmVisitArrivalWithCode,
  useReportCustomerNoShow,
} from "../queries";
import { ArrivalCodeEntry } from "./arrival-code-entry";

/**
 * The A5 plan visit on this enquiry: where it stands, and the two commands that
 * move it.
 *
 * This is what makes `M2-FE-315`'s completed-visit guard a real path rather than
 * a dead end. An A5 estimate may only be submitted against a `COMPLETED` visit —
 * `m2_visit_not_completed` is the refusal — so a vendor with no way to *complete*
 * a visit has an estimate they can never send. Arrival and completion are both
 * published (`POST /partner/site-visits/{id}/arrival/`, `.../complete/`), and they live
 * beside the estimate rather than on some other screen because they happen in
 * the same five minutes, on the same phone, at the same address.
 *
 * ## Arrival is proved by the customer's code
 *
 * The code path landed with contract 1.39.0 and inverted what this panel used to
 * say. The customer holds a code on their own visit page; entering it here is
 * what starts the visit, and it is proof because the two of you have to be
 * standing together for the digits to move.
 *
 * It is mandatory. Completion is offered only after those digits have moved the
 * visit to `IN_PROGRESS`, so neither app can skip arrival proof.
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
  /** The server says this invitation already has a submitted estimate. */
  readonly estimateSubmitted?: boolean;
  /** False when the parent renders the estimate record and its revise action. */
  readonly showEstimateAction?: boolean;
  /** True while the held visit is checking whether customer payment cleared. */
  readonly isRefreshing?: boolean;
}

export function VisitDayPanel({
  enquiry,
  estimateHref,
  estimateSubmitted = false,
  showEstimateAction = true,
  isRefreshing = false,
}: VisitDayPanelProps) {
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [reportingNoShow, setReportingNoShow] = useState(false);

  const visit = planVisitOf(enquiry.siteVisits);
  const arrivalWithCode = useConfirmVisitArrivalWithCode(enquiry.id);
  const complete = useCompleteVisit(enquiry.id);
  const noShow = useReportCustomerNoShow(enquiry.id);

  const estimateCountdown = useServerCountdown(visit?.estimate_due_at ?? null, 60_000);

  if (visit === null) return null;

  const status = describeVisitStatus(visit.status);
  const permissions = visitPermissionsFor(visit);
  const pending = arrivalWithCode.isPending || complete.isPending || noShow.isPending;
  // The code's own refusal is deliberately kept out of this: a wrong code is an
  // ordinary event with its own field-level message, not an outage banner at the
  // top of the panel.
  const error = complete.error ?? noShow.error;
  const presentation = error ? describeError(error, "mutation") : null;
  // `SiteVisit.timezone` (1.26.0). Until it was published this row could only
  // say "in two days", which is not a time a vendor can turn up at.
  const when = visit.scheduled_for
    ? formatVisitInstant(visit.scheduled_for, visit.timezone)
    : null;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-text">Your visit</h2>
        <Badge tone={TONE[status.tone]} dot>
          {status.label}
        </Badge>
      </div>

      <VisitProgress status={visit.status} />

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

      {when?.zoneUnsupported ? (
        <p className="text-xs leading-5 text-text-muted">
          Check this time against the site&rsquo;s timezone ({visit.timezone}).
        </p>
      ) : null}

      {visit.status === "REQUESTED" ? (
        <HeldVisit
          earningPaise={enquiry.fixedVisitEarningPaise}
          approximateArea={enquiry.approximateArea}
          isRefreshing={isRefreshing}
        />
      ) : null}

      {visit.status === "COMPLETED" ? (
        <div className="flex flex-col gap-2">
          {estimateSubmitted ? (
            <p className="text-sm font-semibold leading-5 text-success-text">
              Estimate submitted. The customer can review it now.
            </p>
          ) : visit.estimate_due_at && estimateCountdown ? (
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
          <p className="text-sm leading-5 text-text-secondary">
            {estimateSubmitted
              ? "You can revise it while the enquiry remains open."
              : "Send the estimate before the timer ends."}
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
            arrivalWithCode.reset();
            complete.reset();
            noShow.reset();
          }}
          reference={presentation.reference}
        />
      ) : null}

      {permissions.canConfirmArrival ? (
        <div className="flex flex-col gap-3 rounded-card border border-action-line bg-action-surface p-3">
          <ArrivalCodeEntry
            onSubmit={(code) => arrivalWithCode.mutate({ siteVisitId: visit.id, code })}
            isSubmitting={arrivalWithCode.isPending}
            error={
              arrivalWithCode.error
                ? describeError(arrivalWithCode.error, "mutation").message
                : null
            }
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {permissions.canComplete ? (
          <Button disabled={pending} onClick={() => setConfirmingComplete(true)}>
            Finish the visit
          </Button>
        ) : null}

        {permissions.canEstimate && showEstimateAction ? (
          // A real anchor, not a button that routes: the composer is a
          // destination a vendor may well want to open in a second tab while
          // they are standing in the customer's hallway.
          <Link href={estimateHref} className={`${buttonStyles()} w-full`}>
            {estimateSubmitted ? "Revise estimate" : "Write the estimate"}
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
        title="Finish this visit"
        consequence="Finishing the visit starts the estimate timer. Send the estimate before it ends."
        confirmLabel="Finish the visit"
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
        consequence="Use this only if you reached the site and the customer was not there."
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

/**
 * The gap between accepting a visit and being able to travel to it.
 *
 * Accepting does not book. The slot is held while the customer pays, and only
 * a verified payment turns a hold into a booking — so there is a window,
 * minutes long, where the partner has won the visit and must not set off. The
 * warning is the loudest thing here, above the facts and before the money.
 *
 * The locked rows are the point, not decoration: the exact address and the
 * customer's phone both exist on the server right now and are deliberately
 * withheld until payment confirms. Rendering them locked says two true things
 * at once — there is an address, and you cannot have it yet. No release
 * control: no such mutation is published.
 *
 * Ported from `gallery/held-visit-screen.tsx`.
 */
function HeldVisit({
  earningPaise,
  approximateArea,
  isRefreshing,
}: {
  readonly earningPaise: number | null;
  readonly approximateArea: string;
  readonly isRefreshing: boolean;
}) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span
          aria-hidden
          className="grid size-14 place-items-center rounded-full bg-success-surface text-success-text"
        >
          <Pictogram name="yes" size="lg" />
        </span>
        <p className="text-lg font-extrabold tracking-[-0.02em] text-text">This visit is yours</p>
      </div>

      <div className="flex gap-3 rounded-card border-[1.5px] border-warning-line bg-warning-surface p-3.5">
        <span aria-hidden className="mt-px shrink-0 text-warning-text">
          <Pictogram name="later" size="md" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold tracking-[-0.015em] text-warning-text">
            Do not travel yet
          </p>
          <p className="mt-1 text-[12.5px] leading-[18px] text-warning-text">
            Waiting for customer payment. This page updates automatically.
          </p>
        </div>
        {isRefreshing ? <Spinner size="sm" /> : null}
      </div>

      <div className="flex flex-col gap-2">
        <FactTile
          locked
          icon={<Pictogram name="site" size="sm" />}
          label="Exact address"
          value={approximateArea.trim() === "" ? "After payment" : `${approximateArea} — after payment`}
        />
        <FactTile
          locked
          icon={<Pictogram name="call" size="sm" />}
          label="Customer phone"
          value="After payment"
        />
      </div>

      {earningPaise === null ? null : (
        <p className="text-center text-xs text-text-muted">
          You receive <span className="font-extrabold text-text">{formatMoney(earningPaise)}</span>{" "}
          after this visit.
        </p>
      )}
    </div>
  );
}

const PROGRESS_STEPS: readonly {
  readonly label: string;
  readonly icon: PictogramName;
}[] = [
  { label: "Visit", icon: "date" },
  { label: "On site", icon: "site" },
  { label: "Estimate", icon: "price" },
];

function VisitProgress({ status }: { readonly status: SiteVisitStatus }) {
  if (status === "CANCELLED" || status === "VENDOR_NO_SHOW" || status === "CUSTOMER_NO_SHOW") {
    return null;
  }

  const current = status === "COMPLETED" ? 2 : status === "IN_PROGRESS" ? 1 : 0;

  return (
    <ol aria-label="Visit progress" className="grid grid-cols-3 gap-2">
      {PROGRESS_STEPS.map((step, index) => {
        const complete = index < current;
        const active = index === current;
        return (
          <li
            key={step.label}
            aria-current={active ? "step" : undefined}
            className="flex min-w-0 flex-col items-center gap-1.5 text-center"
          >
            <span
              className={`grid h-11 w-11 place-items-center rounded-2xl border ${
                complete
                  ? "border-success-line bg-success-surface text-success-text"
                  : active
                    ? "border-action-line bg-action-surface text-action-secondary"
                    : "border-line bg-surface-sunken text-text-muted"
              }`}
            >
              <Pictogram name={complete ? "done" : step.icon} size="md" />
            </span>
            <span
              className={`truncate text-xs font-bold ${active ? "text-text" : "text-text-muted"}`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
