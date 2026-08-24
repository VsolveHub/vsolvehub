"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { FieldLabel, ScreenHeading } from "@/features/booking/view/mobile-screen";
import { DateSheet } from "@/features/booking/view/parts/date-sheet";
import { PickerRow } from "@/features/booking/view/parts/picker-row";
import { Segmented } from "@/features/booking/view/parts/segmented";
import { AnsweredOptionalRow, OptionalRow } from "./parts/optional-row";

/**
 * Step 2 of 2 — Where and when.
 *
 * The last screen since the M2-revamp removed the review step: the estimate
 * count is chosen here (the container mounts the chooser into
 * `visitPlanChooser`) and the docked action sends the brief. There is nothing
 * to review because everything being sent is on this screen or one tap back.
 *
 * ## The deadline is an optional row, not a required field
 *
 * `service_by` used to sit here as a second required date with forty words
 * underneath explaining that it is a hard stop: when it passes, the requirement
 * closes from any state and any fee refunds, because a quote delivered after the
 * work was needed is worthless. A customer who read that field as "roughly when
 * I'd like it" had their request close on the day they named.
 *
 * The server derives the closing date from the start day now, so this asks for a
 * deadline only from the people who genuinely have one — as a dashed row with
 * six words under it. The consequence is stated where it is short enough to be
 * read.
 *
 * ## Flexibility is separate from the deadline
 *
 * "I can move a week either way" helps matching find supply. It does not move
 * the date after which the job is pointless. Collapsing them would let a
 * flexible customer accidentally extend their own expiry.
 */

/** The flexibility bands, in days, as the wire wants them. */
export const FLEXIBILITY_OPTIONS = [
  { value: "0", label: "Exact" },
  { value: "7", label: "± a week" },
  { value: "30", label: "± a month" },
] as const;

export interface WhereWhenScreenProps {
  /** The chosen site as one line, or null. */
  addressLine: string | null;
  onOpenAddress: () => void;
  /** Mounted by the caller so this screen owns no data. */
  addressPicker?: ReactNode;

  /** `YYYY-MM-DD`, or null. */
  requestedStart: string | null;
  onRequestedStart: (isoDate: string) => void;

  /** Days either side the customer can move. */
  flexibilityDays: number;
  onFlexibilityDays: (days: number) => void;

  /** The hard deadline, or null when they have none. */
  serviceBy: string | null;
  onServiceBy: (isoDate: string | null) => void;

  /**
   * The estimate-count chooser, mounted by the container so this screen owns
   * no plan data. Absent on A3 and before the draft exists server-side.
   */
  visitPlanChooser?: ReactNode;
}

const DAY = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "long",
});

/** Built from local parts — `new Date(iso)` shifts the day west of UTC. */
function formatDay(isoDate: string | null): string | null {
  if (isoDate === null) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  return DAY.format(new Date(year, month - 1, day));
}

export function WhereWhenScreen({
  addressLine,
  onOpenAddress,
  addressPicker,
  requestedStart,
  onRequestedStart,
  flexibilityDays,
  onFlexibilityDays,
  serviceBy,
  onServiceBy,
  visitPlanChooser,
}: WhereWhenScreenProps) {
  const [startOpen, setStartOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);

  return (
    <>
      <ScreenHeading title="Where and when" />

      <PickerRow
        label="The site"
        value={addressLine}
        placeholder="Choose where the work is"
        onOpen={onOpenAddress}
        trailing="word"
        emphasis
      />

      <PickerRow
        label="Ready to start"
        value={formatDay(requestedStart)}
        placeholder="Choose a date"
        onOpen={() => setStartOpen(true)}
      />

      <div>
        <FieldLabel>How firm is that date?</FieldLabel>
        <Segmented
          label="How firm is that date?"
          name="flexibility"
          options={[...FLEXIBILITY_OPTIONS]}
          value={String(flexibilityDays)}
          onChange={(next) => onFlexibilityDays(Number(next))}
        />
      </div>

      {serviceBy === null ? (
        <OptionalRow
          title="Must finish by a date?"
          description="Optional. Vendors see it as a hard deadline."
          onAdd={() => setDeadlineOpen(true)}
        />
      ) : (
        <AnsweredOptionalRow
          title="Must finish by"
          value={formatDay(serviceBy) ?? serviceBy}
          onRemove={() => onServiceBy(null)}
        />
      )}

      {visitPlanChooser}

      <DateSheet
        open={startOpen}
        onOpenChange={setStartOpen}
        value={requestedStart}
        onSelect={onRequestedStart}
      />

      <DateSheet
        open={deadlineOpen}
        onOpenChange={setDeadlineOpen}
        value={serviceBy}
        onSelect={onServiceBy}
        // Further out than the start picker: a deadline is by definition later
        // than the day the work begins, and a six-week list would not reach it.
        horizonDays={180}
      />

      {addressPicker}
    </>
  );
}
