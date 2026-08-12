"use client";

import { Field, Input } from "@vsolve/ui";
import type { ReactNode } from "react";

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
}

export function WhereWhenScreen({ addressPicker, minDate }: WhereWhenScreenProps) {
  const { state, dispatch } = useRequirement();

  return (
    <div>
      <h2 className="text-lg font-semibold text-text">Where and when</h2>

      <div className="mt-5">
        <p className="text-sm font-semibold text-text">Where is the work?</p>
        <div className="mt-2">{addressPicker}</div>
      </div>

      <div className="mt-6 flex flex-col gap-5">
        <Field
          label="Start from"
          description="The day the work should begin. Professionals quote against this, and it is what we check when we look for a request you may already have open."
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

        <Field
          label="Needed by"
          description="After this date we stop looking and close the request. Nothing you have paid is kept — pick the date the job stops being useful to you, not your ideal date."
          required
        >
          <Input
            type="date"
            min={minDate}
            value={state.serviceBy ?? ""}
            onChange={(event) =>
              dispatch({
                type: "SET_SERVICE_BY",
                serviceBy: event.target.value === "" ? null : event.target.value,
              })
            }
          />
        </Field>

        <div className="flex items-start gap-3">
          <input
            id="date-flexible"
            type="checkbox"
            checked={state.isDateFlexible}
            onChange={(event) =>
              dispatch({ type: "SET_DATE_FLEXIBLE", isFlexible: event.target.checked })
            }
            className="mt-1 size-5 rounded border-line text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          />
          <label htmlFor="date-flexible" className="text-sm leading-6 text-text">
            I can be flexible by a few days
            <span className="mt-0.5 block text-text-secondary">
              More professionals can quote when the dates can move. This does not
              change the date above.
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
