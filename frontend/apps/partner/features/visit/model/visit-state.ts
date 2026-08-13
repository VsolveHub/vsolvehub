import type { Schemas } from "@vsolve/api-client";

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

const STATUS_COPY: Record<SiteVisitStatus, VisitStatusCopy> = {
  REQUESTED: {
    label: "Slot held",
    tone: "progress",
    // Deliberately not "Confirmed". A plan visit sits here while the Customer's
    // visit-plan payment is being verified.
    meaning:
      "Your time is held while the customer pays for their visit plan. Vsolve confirms it the moment that payment clears. If they never pay, the hold simply lapses — you are not owed a journey and nothing is charged to anyone.",
  },
  SCHEDULED: {
    label: "Confirmed",
    tone: "action",
    meaning:
      "This visit is booked and your calendar is held for it. Travel to the site at this time, confirm you have arrived, and write the estimate before you leave.",
  },
  IN_PROGRESS: {
    label: "You are on site",
    tone: "action",
    meaning:
      "Vsolve has your arrival. Close the visit when you are done and send the estimate — the estimate is what the customer paid for, so a visit without one is not complete.",
  },
  COMPLETED: {
    label: "Visit done",
    tone: "progress",
    meaning:
      "The visit is closed. Send your estimate inside the window below — a completed visit that produces no estimate is refunded to the customer and pays you nothing.",
  },
  CANCELLED: {
    label: "Cancelled",
    tone: "gone",
    meaning: "This visit is off. Your slot is released and your calendar is free again.",
  },
  VENDOR_NO_SHOW: {
    label: "Recorded as a no-show",
    tone: "gone",
    meaning:
      "The customer reported that nobody arrived. This visit pays nothing, their share is refunded or replaced, and it counts against your standing. Tell support if this is wrong.",
  },
  CUSTOMER_NO_SHOW: {
    label: "Nobody was on site",
    tone: "settled",
    meaning:
      "You reported that nobody was there. You travelled, so your visit payout still stands — Vsolve settles it through your usual payouts.",
  },
};

export function describeVisitStatus(status: SiteVisitStatus): VisitStatusCopy {
  return STATUS_COPY[status];
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
    // Both, because arrival confirmation can genuinely fail on site — no signal
    // in a basement — and refusing to let a vendor close a visit they attended
    // because a button did not reach the server is the wrong failure.
    canComplete: visit.status === "SCHEDULED" || visit.status === "IN_PROGRESS",
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
 */
export const CONFIRM_COMMITMENT =
  "Confirming books your calendar for this time. You are agreeing to travel to the customer's site at that slot and to write your estimate while you are there — the estimate is what the customer paid for, so a visit that produces none pays you nothing and is refunded to them.";

export interface ConfirmationOutcome {
  readonly title: string;
  readonly message: string;
  /** True while the slot is held rather than booked. */
  readonly isHeld: boolean;
}

/**
 * How a successful confirmation reads.
 *
 * `opens_plan_checkout` is the whole distinction. When it is true this vendor is
 * the **first** to confirm on the request, so their confirmation is what opens
 * the Customer's plan checkout — and their slot is held, not scheduled, until
 * that payment is verified by the provider callback. Every later vendor books
 * against a plan that is already paid for and is scheduled outright.
 */
export function describeConfirmation(
  confirmation: Schemas["VisitSlotConfirmation"],
): ConfirmationOutcome {
  if (confirmation.opens_plan_checkout) {
    return {
      isHeld: true,
      title: "Your time is held",
      message:
        "You are the first vendor to answer, so the customer is now paying for their visit plan. Your slot is held for you while that clears and Vsolve confirms it the moment it does. Do not travel yet. If the customer never pays, the hold lapses on its own — nothing is charged to them and nothing is owed to you.",
    };
  }

  return {
    isHeld: false,
    title: "Visit confirmed",
    message:
      "Your calendar is booked for this time and the customer has been told to expect you. Travel to the site at that slot and write your estimate there.",
  };
}

/**
 * The post-visit estimate window, stated plainly.
 *
 * `estimate_due_at` is stamped when a plan visit completes. Missing it is not a
 * soft deadline: the share is refunded to the Customer or replaced with a free
 * visit for another vendor, this vendor is paid nothing for the journey, and it
 * hits their standing. Saying less than that would be the platform being vague
 * about the one rule that decides whether the trip was worth making.
 */
export function describeEstimateWindow(estimateDueAt: string | null): string {
  if (estimateDueAt === null) {
    return "Send your estimate as soon as you can. A completed visit that never produces one is refunded to the customer and pays you nothing.";
  }
  return "Your estimate is due by the time shown. Miss it and the customer's share is refunded or given to another vendor, this visit pays you nothing, and it counts against your standing.";
}
