"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { FieldLabel, ScreenHeading } from "@/features/booking/view/mobile-screen";
import { DateSheet } from "@/features/booking/view/parts/date-sheet";
import { PickerRow } from "@/features/booking/view/parts/picker-row";
import { Segmented } from "@/features/booking/view/parts/segmented";
import { Calendar, MapPin } from "lucide-react";
import type { RequirementQuestionView } from "@/features/requirement/adapters";
import { iconForOption } from "../model/option-icons";
import { AnsweredOptionalRow, OptionalRow } from "./parts/optional-row";
import { OptionTiles } from "./parts/option-tiles";

/**
 * Step 2 of 3 — Where and when.
 *
 * Address and dates only; the estimate count and visit slots live on step 3.
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
 *
 * ## Events have one date
 *
 * In `eventMode` (an `event_type` brief — see `model/event-brief.ts`) the
 * screen asks for the venue and the event date, and nothing about flexibility
 * or a finish-by deadline: a wedding on the 14th is not "± a week". The one
 * extra fact is when decorators can get in, rendered from the catalogue's
 * `setup_access` question as tiles.
 */

/** The flexibility bands, in days, as the wire wants them. */
export const FLEXIBILITY_OPTIONS = [
  { value: "0", label: "Exact" },
  { value: "7", label: "± a week" },
  { value: "30", label: "± a month" },
] as const;

export interface SetupAccessControl {
  question: RequirementQuestionView;
  value: string | null;
  onChange: (value: string) => void;
}

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

  /** Event-shaped brief: venue + event date, no flexibility. */
  eventMode?: boolean;
  /**
   * Visit-first (A5) brief: the date is when the pro should come to measure
   * and quote. No flexibility band, no finish-by row — the visit is the brief.
   * Ignored when `eventMode` is set; an event keeps its own wording.
   */
  visitFirst?: boolean;
  /** The setup-access question, when the catalogue publishes one for an event. */
  setupAccess?: SetupAccessControl | null;
}

/** The one line the visit-first screen says instead of asking more. */
export const VISIT_FIRST_REASSURANCE =
  "A pro visits, measures and quotes in writing. Nothing to fill.";

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
  eventMode = false,
  visitFirst = false,
  setupAccess = null,
}: WhereWhenScreenProps) {
  const [startOpen, setStartOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  // Either shape drops the flexibility band and the deadline row: an event
  // happens on one date, and a visit is booked for one.
  const singleDate = eventMode || visitFirst;

  return (
    <>
      <ScreenHeading title="Where and when" />

      <div>
        <PickerRow
          label={eventMode ? "The venue" : "The site"}
          value={addressLine}
          placeholder={eventMode ? "Choose where the event is" : "Choose where the work is"}
          onOpen={onOpenAddress}
          icon={<MapPin className="size-5" />}
          trailing="word"
          emphasis
        />
        {eventMode ? (
          <p className="mt-1.5 text-xs leading-5 text-text-muted">
            Venue not booked yet? Give your home address — the decorator plans with you first.
          </p>
        ) : null}
      </div>

      <div>
        <PickerRow
          label={
            eventMode ? "Event date" : visitFirst ? "When should the pro come?" : "Ready to start"
          }
          value={formatDay(requestedStart)}
          placeholder={eventMode ? "Choose the date" : "Choose a date"}
          onOpen={() => setStartOpen(true)}
          icon={<Calendar className="size-5" />}
          trailing="word"
        />
        {visitFirst && !eventMode ? (
          <p className="mt-1.5 text-xs leading-5 text-text-muted">{VISIT_FIRST_REASSURANCE}</p>
        ) : null}
      </div>

      {singleDate ? null : (
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
      )}

      {eventMode && setupAccess !== null ? (
        <div>
          <FieldLabel>{setupAccess.question.label}</FieldLabel>
          <OptionTiles
            label={setupAccess.question.label}
            name={setupAccess.question.code}
            options={(setupAccess.question.options ?? []).map((option) => ({
              value: option.value,
              label: option.label,
              description: option.description,
              icon: iconForOption(option),
            }))}
            value={setupAccess.value}
            onChange={setupAccess.onChange}
          />
          {setupAccess.question.help !== undefined ? (
            <p className="mt-1.5 text-xs leading-5 text-text-muted">{setupAccess.question.help}</p>
          ) : null}
        </div>
      ) : null}

      {singleDate ? null : serviceBy === null ? (
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

      <DateSheet
        open={startOpen}
        onOpenChange={setStartOpen}
        value={requestedStart}
        onSelect={onRequestedStart}
        // An event is booked well ahead of the short window a job start gets, and never
        // for today: the professionals who serve it have to be found first.
        {...(eventMode ? { horizonDays: 180, earliestOffsetDays: 1 } : {})}
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
