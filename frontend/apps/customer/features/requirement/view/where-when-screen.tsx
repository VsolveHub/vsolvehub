"use client";

import { Field, Input } from "@vsolve/ui";
import type { ReactNode } from "react";

import { Segmented } from "@/features/booking/view/parts/segmented";
import { FLEXIBILITY_OPTIONS } from "@/features/project-request/view/where-when-screen";
import { useRequirement } from "./requirement-context";

/**
 * Screen 2 — Where and when.
 *
 * ## The service-by date is a hard stop, and says so
 *
 * `GAP-001`. `service_by` is not a preference: when it passes, the requirement
 * closes as `CLOSED_EXPIRED` from *any* state and any unlock is refunded in full,
 * because a quote delivered after the work was needed is worthless. The clock
 * outranks every other transition in the state machine.
 *
 * A Customer who reads this field as "roughly when I'd like it" and puts next
 * Tuesday will have their requirement closed on Tuesday. So the consequence is
 * stated here, in the field's own description, rather than in terms nobody opens.
 *
 * ## Flexibility is separate from the deadline
 *
 * "I can move a few days either way" helps matching find supply. It does not move
 * the date after which the job is pointless. Two fields, because collapsing them
 * would let a flexible Customer accidentally extend their own expiry.
 *
 * ## Two dates, not one
 *
 * "Start from" arrived with the 1.21.0 re-point. `_assert_submittable` refuses a
 * requirement with no start ("when it should start") and `find_probable_duplicate`
 * matches within ±3 days of it, so `GAP-004` has nothing to compare without one.
 * It is asked as a **day**; the wire's field is a date-time, and the time
 * component is supplied at the adapter seam rather than by asking a Customer to
 * name a minute for a job that has not been scoped.
 *
 * ## There is deliberately only one date here
 *
 * "Needed by" used to sit directly below this one, required, asking the Customer
 * to "pick the date the job stops being useful, not your ideal date". That is a
 * hard question about their own patience, placed one field under a date that
 * already answers it — two inputs for one intention, on the last screen before
 * submitting.
 *
 * The server derives it now: a request stops being useful when the day the work
 * was meant to begin passes with nobody found. `services._closing_date` holds
 * that rule, the column it fills still drives the expiry sweep, and this
 * description states the consequence rather than asking for it again. Do not
 * re-add the field — the answer is already on the screen.
 */

export interface WhereWhenScreenProps {
  /**
   * The address picker, injected by the route.
   *
   * Addresses are a published M1 surface with their own feature and query; this
   * screen owns the requirement, not the address book. Passing the control in
   * keeps this screen free of a second data dependency and lets the M1 picker
   * stay the only place an address is chosen.
   */
  addressPicker: ReactNode;
  /** Earliest date the control will accept. Today, from the container. */
  minDate: string;
  /**
   * Suppresses this screen's own heading.
   *
   * The one-page brief wraps each capture screen in a numbered section that
   * supplies the heading, and two headings for one section is a broken document
   * outline rather than a cosmetic duplicate.
   */
  hideHeading?: boolean;
  /**
   * The estimate-count chooser, mounted by the container.
   *
   * On this screen since the M2-revamp removed the review step: how many
   * professionals should visit is part of "where and when", and the send
   * button sits beside it. Absent on A3 and before the draft exists.
   */
  visitPlanChooser?: ReactNode;
}

export function WhereWhenScreen({
  addressPicker,
  minDate,
  hideHeading = false,
  visitPlanChooser,
}: WhereWhenScreenProps) {
  const { state, dispatch } = useRequirement();

  return (
    <div>
      {hideHeading ? null : (
        <h2 className="text-lg font-semibold text-text">Where and when</h2>
      )}

      <div className={hideHeading ? "" : "mt-5"}>
        <p className="text-sm font-semibold text-text">Where is the work?</p>
        <div className="mt-2">{addressPicker}</div>
      </div>

      <div className="mt-6 flex flex-col gap-5">
        <Field
          label="Start from"
          description="The day the work should begin. Professionals quote against this, and if nobody has taken it by then we close the request and keep nothing."
          required
        >
          <Input
            type="date"
            min={minDate}
            value={state.requestedStart ?? ""}
            onChange={(event) =>
              dispatch({
                type: "SET_REQUESTED_START",
                requestedStart: event.target.value === "" ? null : event.target.value,
              })
            }
          />
        </Field>

        {/* Three bands rather than the checkbox this was. The wire has always
            taken `flexibility_days` as a number, and yes-or-no could say the
            dates were movable without saying how far — which is the difference
            between a vendor offering next Tuesday and not bothering. */}
        <Field
          label="How firm is that date?"
          description="More professionals can quote when the dates can move. This does not change the date above."
        >
          <Segmented
            label="How firm is that date?"
            name="flexibility"
            options={[...FLEXIBILITY_OPTIONS]}
            value={String(state.flexibilityDays)}
            onChange={(days) =>
              dispatch({ type: "SET_FLEXIBILITY_DAYS", days: Number(days) })
            }
          />
        </Field>

        {visitPlanChooser}
      </div>
    </div>
  );
}
