"use client";

import { serverClock } from "@vsolve/api-client";
import { describeError, useServerCountdown, type Countdown } from "@vsolve/query";
import { useState } from "react";

import { planVisitOf, type EnquiryRecord } from "@/features/enquiry/model/wire";

import { describeVisitTiming, type VisitTiming } from "../model/visit-clock";
import {
  describeVisitStatus,
  visitPermissionsFor,
  type SiteVisit,
  type VisitPermissions,
  type VisitStatusCopy,
} from "../model/visit-state";
import {
  useCompleteVisit,
  useConfirmVisitArrivalWithCode,
  useReportCustomerNoShow,
} from "../queries";

/**
 * One visit's state, shared by the card that describes it and the bar that acts
 * on it.
 *
 * The card and the action bar are two components because they sit at opposite
 * ends of the screen — the bar is `sticky bottom-0` and must therefore be the
 * last child of the scroll container, while the card belongs at the top with the
 * rest of the facts. They are nonetheless one piece of state: the arrival code
 * is entered in the card and submitted from the bar, and a refused completion
 * has to surface next to the button that asked for it.
 *
 * Lifting that into a hook is what keeps the two honest about each other. The
 * alternative — each component owning its own mutations — gives a screen two
 * `useCompleteVisit` instances whose `isPending` disagree, which is how a bar
 * ends up enabled while the card says it is working.
 *
 * Returns `null` when this enquiry has no plan visit at all. Every hook is
 * called unconditionally before that check, so the caller may branch on the
 * result without breaking the rules of hooks.
 */

export interface VisitDayControls {
  readonly visit: SiteVisit;
  readonly status: VisitStatusCopy;
  readonly permissions: VisitPermissions;
  /** Null while the slot is held and no time has been fixed yet. */
  readonly timing: VisitTiming | null;
  /** The post-visit estimate window, when one is open. */
  readonly estimateCountdown: Countdown | null;
  /**
   * The vendor has pressed "I've arrived" and is being asked for the code.
   *
   * Local sequencing, never a server fact (owner decision, 2026-09-01): arrival
   * is proven only by the customer's digits, and this merely decides whether the
   * screen is asking for them yet. It is deliberately not persisted — reloading
   * on the road should not leave a code box open.
   */
  readonly askingForCode: boolean;
  readonly setAskingForCode: (asking: boolean) => void;
  /**
   * True when the arrival control may be offered at all: the server says this
   * visit can take an arrival *and* the clock says its day has come.
   */
  readonly canStartArrival: boolean;
  /**
   * Open the day gate by hand. **Non-production builds only** — null in a
   * production bundle, and null whenever the gate is already open.
   *
   * The arrival path (press → code → on site → finish → estimate) is five
   * screens deep and only reachable on the visit's own day, which makes it the
   * one flow nobody can walk while building it. Rather than seed a visit for
   * today every time, dev gets an override that says on screen exactly what it
   * is. Deliberately not a silent `NODE_ENV` branch on `canStartArrival`
   * itself: dev and production would then disagree about what the screen shows
   * with nothing on the screen admitting it.
   */
  readonly overrideArrivalGate: (() => void) | null;
  readonly arrival: ReturnType<typeof useConfirmVisitArrivalWithCode>;
  readonly complete: ReturnType<typeof useCompleteVisit>;
  readonly noShow: ReturnType<typeof useReportCustomerNoShow>;
  readonly pending: boolean;
  /**
   * The one refusal worth a banner.
   *
   * A wrong arrival code is deliberately excluded: it is an ordinary event with
   * its own field-level message under the digits, not an outage notice at the
   * top of the card.
   */
  readonly failure: ReturnType<typeof describeError> | null;
  readonly resetFailure: () => void;
}

/** Compiled out of a production bundle: the constant folds and the branch dies. */
const ARRIVAL_GATE_IS_OVERRIDABLE = process.env.NODE_ENV !== "production";

export function useVisitDay(enquiry: EnquiryRecord): VisitDayControls | null {
  const [askingForCode, setAskingForCode] = useState(false);
  const [gateOverridden, setGateOverridden] = useState(false);

  const visit = planVisitOf(enquiry.siteVisits);
  const arrival = useConfirmVisitArrivalWithCode(enquiry.id);
  const complete = useCompleteVisit(enquiry.id);
  const noShow = useReportCustomerNoShow(enquiry.id);
  const estimateCountdown = useServerCountdown(visit?.estimate_due_at ?? null, 60_000);

  if (visit === null) return null;

  const permissions = visitPermissionsFor(visit);
  const timing = describeVisitTiming(visit, serverClock.now());
  const error = complete.error ?? noShow.error;
  const dayHasCome = timing?.arrivalWindowOpen ?? false;

  return {
    visit,
    status: describeVisitStatus(visit.status),
    permissions,
    timing,
    estimateCountdown,
    askingForCode,
    setAskingForCode,
    // `timing === null` means a held slot with no fixed time, and
    // `canConfirmArrival` is already false there — `dayHasCome`'s `?? false` is
    // for that unreachable pairing rather than a policy of its own.
    canStartArrival: permissions.canConfirmArrival && (dayHasCome || gateOverridden),
    overrideArrivalGate:
      ARRIVAL_GATE_IS_OVERRIDABLE && permissions.canConfirmArrival && !dayHasCome && !gateOverridden
        ? () => setGateOverridden(true)
        : null,
    arrival,
    complete,
    noShow,
    pending: arrival.isPending || complete.isPending || noShow.isPending,
    failure: error ? describeError(error, "mutation") : null,
    resetFailure: () => {
      arrival.reset();
      complete.reset();
      noShow.reset();
    },
  };
}
