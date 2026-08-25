"use client";

import { MapPin, Phone } from "lucide-react";
import { Badge, Button, Readout, Timeline, TimelineEvent, cn } from "@vsolve/ui";
import type { TimelineTone } from "@vsolve/ui";

/**
 * A5 · Visit tracker — the visit that is actually booked.
 *
 * ## Why "Booked" appears here and nowhere earlier
 *
 * Requested, Held and Booked are three different things, and only this screen
 * has earned the third word. A slot is Requested while professionals are being
 * offered it, Held once one accepts and until the hold expires, and Booked only
 * after payment has cleared. `MatchingScreen` therefore never prints "Booked" —
 * a customer who thinks a held slot is confirmed stops watching the countdown,
 * and the visit they were relying on quietly evaporates.
 *
 * ## Why the exact address is on this screen and not the last one
 *
 * The site address is deliberately withheld until money has moved: before that,
 * a request is a public-ish document offered to several professionals, and a
 * flat number in it is a stranger's home address handed to people who have no
 * appointment there. Payment is what turns "somebody in Kondapur" into "this
 * door at this time", and the timeline says so in words — "Your address has been
 * shared with Ravi" — so the release is visible rather than silent.
 *
 * ## Why the code is a `Readout`
 *
 * It is read aloud, digit by digit, in a doorway. `spaced` gives it the tracking
 * that makes that possible, and `announce` keeps a screen reader from running
 * the digits together into one number nobody said. The instruction beside it
 * names *when* to read it out, because the code only proves anything if the two
 * people are in the same place when it moves between them.
 *
 * ## Why this is a gallery component and not a route
 *
 * BE-2/BE-3/BE-4 are unpublished, so there is no visit DTO carrying a matched
 * professional, a released address and a timeline. This is a pure component —
 * props in, JSX out, no fetching and no data state — rendered from fixed sample
 * values at `/design/m2/visit-tracker`, and it carries its own shell because
 * `MobileScreen`'s `min-h-[100dvh]` root does not fit a 390x844 artboard frame.
 */

export interface TrackerProfessional {
  /** The full name, which a paid-for visit has earned. */
  name: string;
  initials: string;
  trade: string;
  rating: string;
  /** Adds "ID verified" to the line under the name. Never assumed. */
  idVerified?: boolean;
}

export interface VisitTimelineEventView {
  id: string;
  /** Plain language, in the customer's words. */
  title: string;
  /**
   * Already formatted and already localised by the caller. Empty for an event
   * that has not happened yet — a future step has no time, and inventing one
   * would put a fabricated entry in a record both parties read during a dispute.
   */
  timestamp: string;
  tone: TimelineTone;
  detail?: string;
}

export interface VisitTrackerScreenProps {
  /** 1-based, for "Visit 1 of 3". */
  visitIndex: number;
  visitCount: number;
  /** "Tue 2 Sep". */
  day: string;
  /** "10:00 – 12:00". */
  window: string;
  professional: TrackerProfessional;
  arrivalCode: string;
  /** The full address. Released only because payment has happened. */
  siteAddress: string;
  siteLandmark?: string;
  timeline: readonly VisitTimelineEventView[];
  onBack?: () => void;
  onCall?: () => void;
  onReschedule?: () => void;
  onCancel?: () => void;
}

/** "Plumber · 4.8 rating · ID verified", with nothing in it that was assumed. */
function professionalMeta(professional: TrackerProfessional): string {
  const parts = [professional.trade, `${professional.rating} rating`];
  if (professional.idVerified === true) parts.push("ID verified");
  return parts.join(" · ");
}

export function VisitTrackerScreen({
  visitIndex,
  visitCount,
  day,
  window: visitWindow,
  professional,
  arrivalCode,
  siteAddress,
  siteLandmark,
  timeline,
  onBack,
  onCall,
  onReschedule,
  onCancel,
}: VisitTrackerScreenProps) {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="shrink-0 border-b border-line bg-surface pt-11">
        <div className="flex h-14 items-center gap-1 px-1">
          <button
            type="button"
            onClick={onBack}
            className={cn(
              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control",
              "text-text-secondary hover:bg-surface-hover hover:text-text",
            )}
          >
            <span className="sr-only">Back</span>
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M12.5 4.5 7 10l5.5 5.5" />
            </svg>
          </button>

          <h1 className="min-w-0 flex-1 truncate px-1 text-[15px] font-bold text-text">
            {`Visit ${visitIndex} of ${visitCount}`}
          </h1>

          <span className="shrink-0 pr-1">
            <Badge tone="success" dot>
              Booked
            </Badge>
          </span>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-[14px] overflow-y-auto px-[14px] pb-[26px] pt-4">
        <section className="rounded-card border border-line bg-surface p-[14px] shadow-card">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
            Your professional arrives
          </h2>
          <p className="mt-1 text-xl font-extrabold tracking-[-0.02em] text-text">
            {`${day} · ${visitWindow}`}
          </p>

          <div className="mt-3 flex items-center gap-2.5 rounded-[12px] bg-surface-sunken px-2.5 py-2">
            <span
              aria-hidden
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                "bg-action-secondary text-[13px] font-extrabold text-action-secondary-text",
              )}
            >
              {professional.initials}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-bold text-text">
                {professional.name}
              </span>
              <span className="block truncate text-[11.5px] text-text-muted">
                {professionalMeta(professional)}
              </span>
            </span>

            {/* 44px, not the 36px circle the artboard draws: a call button that
                is missed lands on the card behind it, and this is the control a
                customer reaches for when somebody is late. */}
            <button
              type="button"
              onClick={onCall}
              className={cn(
                "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                "border border-line bg-surface text-text-link hover:bg-surface-hover",
              )}
            >
              <span className="sr-only">{`Call ${professional.name}`}</span>
              <Phone aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </section>

        <Readout
          tone="active"
          size="md"
          spaced
          label="Arrival code"
          value={arrivalCode}
          announce={`Arrival code: ${arrivalCode.split("").join(" ")}`}
          caption="Read it out only once the professional is at your door."
        />

        <section className="flex items-start gap-3 rounded-card border border-line bg-surface p-[14px] shadow-card">
          <MapPin aria-hidden className="mt-0.5 h-[18px] w-[18px] shrink-0 text-text-link" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
              Site address
            </h2>
            <p className="mt-1 text-[13.5px] leading-[19px] text-text">{siteAddress}</p>
            {siteLandmark !== undefined ? (
              <p className="mt-1 text-xs text-text-muted">{siteLandmark}</p>
            ) : null}
          </div>
        </section>

        <Timeline label="Visit progress">
          {timeline.map((event) => (
            <TimelineEvent
              key={event.id}
              title={event.title}
              timestamp={event.timestamp}
              tone={event.tone}
            >
              {event.detail}
            </TimelineEvent>
          ))}
        </Timeline>

        {/* Two equal-width controls, and neither is primary. Nothing on a booked
            visit needs recommending — the visit is the plan, and both of these
            are ways to change it. */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onReschedule} className="flex-1">
            Reschedule
          </Button>
          <Button variant="ghost" onClick={onCancel} className="flex-1">
            Cancel visit
          </Button>
        </div>
      </main>
    </div>
  );
}
