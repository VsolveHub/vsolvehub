"use client";

import { Field, Select } from "@vsolve/ui";

import { durationOptions } from "../model/state";
import { useWorkspace } from "./workspace-context";

/**
 * Duration.
 *
 * B3's acceptance criterion is that this is "readable and keyboard accessible",
 * which is why it is a native select rather than a row of chips or a slider. A
 * select is operable by keyboard everywhere, announces its options and its
 * current value without any ARIA, and works with a screen reader's forms mode —
 * none of which is true by default of a custom widget, and all of which matters
 * more than the visual novelty would.
 *
 * Options are generated from the variant's configured bounds and increment, so
 * the UI cannot offer a length the backend will not price.
 */

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} minutes`;
  const hourPart = `${hours} hour${hours === 1 ? "" : "s"}`;
  return rest === 0 ? hourPart : `${hourPart} ${rest} minutes`;
}

export function DurationStage() {
  const { state, dispatch, durationMinutes } = useWorkspace();
  const { rules } = state;

  if (rules === null) return null;

  const options = durationOptions(rules);
  const recommended = rules.recommendedDurationMinutes;

  return (
    <div>
      <h2 className="text-lg font-semibold text-text">How long will this take?</h2>
      <p className="mt-1 text-sm text-text-secondary">
        We have recommended a length for the work you described. You can change
        it.
      </p>

      <div className="mt-4 max-w-xs">
        <Field
          label="Booked time"
          description={`Recommended for your selected work: ${durationLabel(recommended)}.`}
          required
        >
          <Select
            value={durationMinutes === null ? "" : String(durationMinutes)}
            onChange={(event) =>
              dispatch({ type: "SET_DURATION", minutes: Number(event.target.value) })
            }
          >
            {options.map((minutes) => (
              <option key={minutes} value={minutes}>
                {durationLabel(minutes)}
                {minutes === recommended ? " — recommended" : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <p className="mt-4 text-sm text-text-secondary">
        If the work runs longer, your professional asks you to approve the extra
        time before it is added. Nothing is charged without your approval.
      </p>
    </div>
  );
}
