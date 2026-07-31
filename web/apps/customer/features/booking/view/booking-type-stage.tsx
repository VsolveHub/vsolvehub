"use client";

import { useWorkspace } from "./workspace-context";
import { ChoiceCard } from "./choice-card";

/**
 * Instant or Scheduled. Nothing is preselected — a B3 acceptance criterion, and
 * the reason `fulfilment` starts as null rather than defaulting to Scheduled.
 *
 * The two options are described by what actually differs for the customer:
 * Instant takes payment before a professional is assigned, Scheduled holds a
 * slot first. Doc 11 §2 makes that ordering the substantive difference, and
 * hiding it until the payment screen would be a disclosure failure — the pay
 * screen (B5) states it again in full, but the choice is made here.
 */

export function BookingTypeStage() {
  const { state, dispatch } = useWorkspace();

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-lg font-semibold text-text">
        When do you need this?
      </legend>
      <p className="mt-1 text-sm text-text-secondary">
        Choose one to continue.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <ChoiceCard
          name="fulfilment"
          value="INSTANT"
          checked={state.fulfilment === "INSTANT"}
          onSelect={() => dispatch({ type: "SELECT_FULFILMENT", fulfilment: "INSTANT" })}
          title="Now"
          description="We find an available professional and they come as soon as they can."
        >
          <span className="mt-2 block text-sm text-text-secondary">
            Payment is taken before a professional is assigned. If nobody is
            available, you are refunded in full.
          </span>
        </ChoiceCard>

        <ChoiceCard
          name="fulfilment"
          value="SCHEDULED"
          checked={state.fulfilment === "SCHEDULED"}
          onSelect={() => dispatch({ type: "SELECT_FULFILMENT", fulfilment: "SCHEDULED" })}
          title="Pick a time"
          description="Choose a slot in the next seven days and we hold it for you."
        >
          <span className="mt-2 block text-sm text-text-secondary">
            Your slot is held before you pay, so the time is yours once you
            confirm.
          </span>
        </ChoiceCard>
      </div>
    </fieldset>
  );
}
