import type { Schemas } from "@vsolve/api-client";
import type { useT } from "@vsolve/ui";

/**
 * A site visit in the vendor's own terms, and what confirming one commits them
 * to.
 *
 * Closes the decision half of `M2-FE-314` and the guard half of `M2-FE-315`.
 * Pure. Every sentence here is checked against the revision-3 money rules in
 * `Django_Next.js_Plan/M2/README.md` §"The A5 visit plan mechanics" and
 * `07-state-machines-and-permissions.md` §4a/§4b, because Partner copy that
 * overstates what a visit pays is a promise the platform then has to break.
 *
 * ## The three rules this file exists to not get wrong
 *
 * 1. **Confirming a slot is A5 acceptance.** It takes the quote slot, the soft
 *    capacity hold and a hard reservation on the shared availability grid — the
 *    same grid the A1 technician flow books against, so a visit and a task job
 *    cannot double-book this vendor by database constraint rather than by
 *    convention.
 * 2. **The first confirmation opens the Customer's checkout, and until that
 *    payment is verified the slot is HELD, not scheduled.** The visit reads
 *    `REQUESTED`. If the Customer never pays, the hold lapses and nothing was
 *    charged — to them or to the vendor. Rendering a held slot as confirmed
 *    promises a vendor a job nobody has bought.
 * 3. **The visit payout is earned on a completed visit *plus* a usable
 *    estimate.** A visit that produces no estimate inside the post-visit window
 *    pays the vendor nothing and refunds the Customer that share. The estimate is
 *    what the Customer bought; the journey on its own is not the product.
 */

export type SiteVisit = Schemas["SiteVisit"];
export type SiteVisitStatus = Schemas["SiteVisitStatusEnum"];

export interface VisitStatusCopy {
  readonly label: string;
  readonly tone: "action" | "progress" | "settled" | "gone";
  /** What this state means and what moves it. Never a promise about money. */
  readonly meaning: string;
}

/** Catalogue keys, resolved with `t` in `describeVisitStatus`. */
const STATUS_COPY: Record<SiteVisitStatus, VisitStatusCopy> = {
  REQUESTED: {
    label: "visit.status.requested.label",
    tone: "progress",
    // Deliberately not "Confirmed". A plan visit sits here while the Customer's
    // visit-plan payment is being verified.
    meaning: "visit.status.requested.meaning",
  },
  SCHEDULED: {
    label: "visit.status.scheduled.label",
    tone: "action",
    meaning: "visit.status.scheduled.meaning",
  },
  IN_PROGRESS: {
    label: "visit.status.inProgress.label",
    tone: "action",
    meaning: "visit.status.inProgress.meaning",
  },
  COMPLETED: {
    label: "visit.status.completed.label",
    tone: "progress",
    meaning: "visit.status.completed.meaning",
  },
  CANCELLED: {
    label: "visit.status.cancelled.label",
    tone: "gone",
    meaning: "visit.status.cancelled.meaning",
  },
  VENDOR_NO_SHOW: {
    label: "visit.status.vendorNoShow.label",
    tone: "gone",
    meaning: "visit.status.vendorNoShow.meaning",
  },
  CUSTOMER_NO_SHOW: {
    label: "visit.status.customerNoShow.label",
    tone: "settled",
    meaning: "visit.status.customerNoShow.meaning",
  },
};

export function describeVisitStatus(
  status: SiteVisitStatus,
  t: ReturnType<typeof useT>,
): VisitStatusCopy {
  const copy = STATUS_COPY[status];
  return { ...copy, label: t(copy.label), meaning: t(copy.meaning) };
}

/* ---------------------------------------------------------------------------
   Permissions
   --------------------------------------------------------------------------- */

export interface VisitPermissions {
  /** `confirm_visit_arrival` needs a scheduled visit — a held one is not scheduled. */
  readonly canConfirmArrival: boolean;
  /** `complete_site_visit`: the vendor closes it, because only the vendor attended. */
  readonly canComplete: boolean;
  /**
   * `m2_site_visit_no_show_report`: you report the *other* party's absence.
   * A vendor reports `CUSTOMER`; the reverse is refused by the server.
   */
  readonly canReportCustomerNoShow: boolean;
  /** An A5 estimate may only be submitted against a COMPLETED visit. */
  readonly canEstimate: boolean;
}

export function visitPermissionsFor(visit: SiteVisit | null): VisitPermissions {
  if (visit === null) {
    return {
      canConfirmArrival: false,
      canComplete: false,
      canReportCustomerNoShow: false,
      canEstimate: false,
    };
  }

  return {
    canConfirmArrival: visit.status === "SCHEDULED",
    // Arrival-code verification is mandatory. A scheduled visit cannot skip
    // straight to completion.
    canComplete: visit.status === "IN_PROGRESS",
    canReportCustomerNoShow: visit.status === "SCHEDULED" || visit.status === "IN_PROGRESS",
    canEstimate: visit.status === "COMPLETED",
  };
}

/* ---------------------------------------------------------------------------
   Confirmation
   --------------------------------------------------------------------------- */

/**
 * What a vendor is agreeing to when they confirm a slot.
 *
 * Stated before the tap, not after. This is a person deciding whether to get on
 * a bike, and the two facts that decide it are: you travel at this time, and you
 * write the estimate there.
 *
 * A catalogue key: resolve it with `t` where it renders.
 */
export const CONFIRM_COMMITMENT_KEY = "visit.state.confirmCommitment";

export interface ConfirmationOutcome {
  readonly title: string;
  readonly message: string;
  /** True while the slot is held rather than booked. */
  readonly isHeld: boolean;
}

export function describeEstimateWindow(
  estimateDueAt: string | null,
  t: ReturnType<typeof useT>,
): string {
  if (estimateDueAt === null) {
    return t("visit.state.estimateWindow.noDeadline");
  }
  return t("visit.state.estimateWindow.withDeadline");
}
