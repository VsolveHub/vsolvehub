import { helperNoun, isOfferLive } from "@/features/crew-offer/model/offer-state";
import type { CrewOffer } from "@/features/crew-offer/queries";
import { bucketOf } from "@/features/enquiry/model/enquiry-state";
import type { EnquirySummary } from "@/features/enquiry/queries";
import type { Engagement } from "@/features/engagement/queries";
import { isOfferSettled, type Offer } from "@/features/offers/queries";
import type { PartnerVisit } from "@/features/work/queries";

/**
 * The one timeline every Partner-facing record collapses into: somebody
 * asked, I answered, I'm doing it, I got paid. Four card states, each with
 * its own colour on the canvas — see Task 6/7/9's screen source files.
 *
 * ## Every status set here is typed against the published enum, on purpose
 *
 * The sets below are `ReadonlySet<T["status"]>` rather than `Set<string>`, so a
 * status this build invents fails `tsc` in this file instead of quietly matching
 * nothing at runtime. That is not decoration: the draft this file was written
 * from filtered engagements on `"IN_PROGRESS"`, which is a member of
 * `EngagementStageStatusEnum` and **not** of `EngagementStatusEnum`, so a
 * bare-string set would have dropped every engagement actually being worked on
 * and shown an empty WORK screen to a vendor mid-job. A `Set<string>` cannot
 * catch that. This one does.
 */
export type WorkUrgency =
  | "live"
  | "needs_price"
  | "doing"
  | "answered"
  | "not_chosen"
  | "closed"
  | "settled";

/**
 * `offer` covers **two** sources, deliberately.
 *
 * An A3 crew offer (`features/crew-offer`, the rate-card cascade) and an A1
 * direct offer (`features/offers`, the unit-scoped dispatch inbox) are different
 * records on different endpoints with no field name in common — but to a vendor
 * looking at this stack they are the same kind of thing: somebody is offering
 * work, and there is a clock on the answer. They share the card treatment and the
 * `live` urgency. What separates them on screen is `href`, `areaLabel` and
 * `accessibleName`, all of which are already per-item.
 */
export type WorkItemKind = "offer" | "enquiry" | "engagement" | "job";

export interface WorkItem {
  readonly kind: WorkItemKind;
  /**
   * Stable React key, namespaced by **source** rather than by `kind`.
   *
   * Usually that is the same string — but the two offer sources share one kind,
   * so `offer:` and `direct-offer:` keep them distinct. The key's whole job is to
   * be unique across the merged stack, and `${kind}:${id}` stops guaranteeing
   * that the moment two sources feed one kind.
   */
  readonly key: string;
  /** Route to the detail screen for this item. */
  readonly href: string;
  /**
   * What this item is worth, in paise. `null` = not priced yet.
   *
   * **This is not uniformly a payout figure, and a screen must not label it as
   * one.** What it means depends on the kind:
   *
   * - `offer` (A3 crew) — `lead_total_receipt_paise`, genuinely the lead's own
   *   net take for the whole job. ADR-0009 fixes the offer screen on exactly
   *   this number.
   * - `offer` (A1 direct) — `estimated_net.amount_paise`. The projection
   *   publishes `estimated_gross`, `commission` and `estimated_net` separately,
   *   so the net figure is the server's own subtraction rather than one this
   *   adapter performs. Still an *estimate*, as the field name says.
   * - `job` — `earning.net_paise`, explicitly after commission; the wire calls
   *   `PartnerBookingEarning` "one Partner's own money for one job".
   * - `engagement` — `staged_total_paise`, the **agreed total to date**, which
   *   may or may not already net out commission. Whether the platform's cut sits
   *   inside the total or is added on top is `commission_treatment`, and that is
   *   an unenumerated `CharField(max_length=24, blank=True)` with no `choices`
   *   at the model layer (`backend/apps/requirements/models/engagements.py:92`,
   *   and the same field on the proposal at `models/matching.py:285-287`, whose
   *   comment says plainly that it is "an open owner decision, so it is recorded
   *   rather than assumed"). This adapter therefore cannot compute a true net
   *   figure for an engagement, and does not pretend to.
   *
   * So: fine as a headline "what this is worth" number on a card. Never as
   * "this is what you will be paid" for an engagement.
   */
  readonly amountPaise: number | null;
  /** Short visible label that says whether the amount is estimated, final, or agreed. */
  readonly amountLabel: string | null;
  readonly urgency: WorkUrgency;
  /**
   * ISO deadline for a card that is racing a clock (an offer's
   * `responds_by`, an enquiry's `responds_by`). `null` for everything else.
   */
  readonly respondsBy: string | null;
  /** ISO scheduled/requested start, for sorting the "doing" bucket. `null` if unscheduled. */
  readonly whenIso: string | null;
  /**
   * Whether `whenIso` is a **day** the customer asked for rather than a moment
   * anybody scheduled.
   *
   * An enquiry's `requested_start` is published as `date-time` but is the date
   * the customer picked in the requirement flow, so it arrives at midnight. A
   * card that formatted it as a clock said **"STARTS 12:00 am"** on every
   * enquiry — a precise-looking time nobody chose, on the screen a vendor uses
   * to plan their day.
   *
   * True for both enquiry sources; false for an A1 visit, whose
   * `scheduled_start` is a real slot. The card picks a date or a clock from
   * this rather than guessing from the value, because midnight is also a
   * legitimate — if unlikely — scheduled time, and guessing would silently
   * mis-render the one job that really does start then.
   */
  readonly whenIsDay: boolean;
  /** Published duration for a scheduled A1 offer or visit. `null` when the source has none. */
  readonly durationMinutes: number | null;
  /**
   * A published locality or service-area label, never a measured distance or
   * exact street address. `null` where the source type has no area field.
   */
  readonly areaLabel: string | null;
  /** The next useful action when this card needs a source-specific verb. */
  readonly actionLabel?: string;
  /**
   * What the work **is**, and nothing else — the card's visible title.
   *
   * One short noun phrase, so it survives one line at 360px: "Interior fit-out
   * project", "Deep clean". Deliberately carries no state, because packing both
   * into one string is what produced "Interior fit-out project, waiting on y…"
   * on a real screen — a title that truncates before it reaches the part that
   * distinguishes it from the card above.
   *
   * Where a source publishes no name for the work, this says what kind of
   * record it is in the vendor's own vocabulary ("Project", "Booking") rather
   * than restating its status. `Engagement` and `PartnerBooking` both publish
   * no service name (`schema.d.ts:6544`, `:7926`); a booking's first work task
   * carries a real `label` and is used where there is one.
   */
  readonly title: string;
  /**
   * Where the work has got to — the small chip beside the title, and the part
   * of the accessible name that follows it. `null` where the card's colour and
   * its action already say it.
   */
  readonly stateLabel: string | null;
  /**
   * Title and state as one string, for `aria-label` on the card link.
   *
   * Composed rather than authored: a screen reader announcing the title and
   * then the chip separately would read the card twice, and the two must never
   * drift apart.
   *
   * It used to be accessible-name-only, on the 2026-08-19 rule that this app
   * renders pictures and numbers and never a service name as visible copy. That
   * rule is what left a Partner reading `₹450` beside a map pin for a job whose
   * trade was nowhere on the screen, and it is superseded by
   * `docs/superpowers/specs/2026-08-21-partner-readable-ui-design.md`:
   * the picture is the fast path, the word is the guarantee.
   *
   * Two enquiry states share the `needs_price` urgency and the colour cannot
   * tell them apart, so the state half is what distinguishes them: "Shop
   * fit-out, waiting on your answer" versus "Shop fit-out, needs a price".
   */
  readonly accessibleName: string;
}

/**
 * What to call an engagement, from the only field that distinguishes one.
 *
 * `archetype` is an unenumerated `type: string` on the wire, so this matches the
 * one value the A3 path is known to publish and treats everything else as a
 * project — the A5 case, and the larger one. Getting it wrong costs a vendor a
 * slightly generic noun; inventing a service name would cost them a wrong one.
 */
function engagementTitle(engagement: Engagement): string {
  return engagement.archetype === "A3_TIME_BLOCK" ? "Crew booking" : "Project";
}

/**
 * What to call a booking: its durable booked-scope title.
 *
 * `display_title` exists before operational tasks are materialized, which keeps
 * a confirmed booking from collapsing to "Job". The work-task label remains a
 * compatibility fallback for older records, and the generic noun is reserved
 * for a record that genuinely publishes neither.
 */
function jobTitle(job: PartnerVisit): string {
  const durableTitle = blankToNull(job.display_title);
  if (durableTitle !== null) return durableTitle;
  const [first, ...rest] = job.work_tasks;
  if (first === undefined) return "Job";
  return rest.length === 0 ? first.label : `${first.label} +${rest.length}`;
}

/** Title plus state, in the one order every card announces them. */
function named(title: string, stateLabel: string | null): {
  title: string;
  stateLabel: string | null;
  accessibleName: string;
} {
  return {
    title,
    stateLabel,
    accessibleName: stateLabel === null ? title : `${title}, ${stateLabel}`,
  };
}

const CREW_OFFER_HREF = (id: string) => `/work/offers/${id}`;
const ENQUIRY_HREF = (id: string) => `/work/enquiries/${id}`;
const ENGAGEMENT_HREF = (id: string) => `/work/jobs/${id}`;
const JOB_HREF = (id: string) => `/work/jobs/${id}`;

/**
 * An A1 direct offer is answered **in the inbox**, so every one of them points at
 * the list rather than at a detail screen of its own.
 *
 * This is not a placeholder. `features/offers` has no per-offer route today —
 * `app/offers/` holds a `layout.tsx` and a `page.tsx` and nothing else — because
 * accept, decline, undo and commit are all inline controls on the row. Inventing
 * `/work/offers/{id}` for these would produce a link to a screen nobody has
 * built, and it would collide with the A3 crew-offer detail route above, which
 * already owns that exact pattern for a different record type.
 *
 * If a detail screen is ever added, this is the one constant to re-point.
 */
const DIRECT_OFFER_HREF = () => `/work/offers`;

/*
  `spoken()` lived here — a helper that turned a published enum member into
  "waiting for approval" so a card could be titled from its status. Both its
  callers are gone: a card titled "Job, confirmed" or "Engagement, active" told
  a vendor the one thing the card's own colour already said, and none of what
  the work actually was. Titles come from `jobTitle` / `engagementTitle` now.
*/

/**
 * A published string that is present but empty, read as the absence it is.
 *
 * Two sources need this and they need it for different reasons:
 * `CrewOffer.area_label` is non-nullable so "no area" can only arrive as `""`,
 * while `Offer.approximate_area` is nullable and can arrive as either. Both mean
 * the same thing to a screen, and `WorkItem.areaLabel` should say so once.
 */
function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/* --------------------------------------------------------------------------
   A3 crew offers — the rate-card cascade
   -------------------------------------------------------------------------- */

function fromCrewOffers(offers: readonly CrewOffer[], serverNow: string): WorkItem[] {
  return offers
    .filter((offer) => isOfferLive(offer, serverNow))
    .map((offer) => {
      const area = blankToNull(offer.area_label);
      return {
        kind: "offer" as const,
        key: `offer:${offer.invitation_id}`,
        href: CREW_OFFER_HREF(offer.invitation_id),
        // `lead_total_receipt_paise` is the lead's own take for the whole job —
        // the number ADR-0009 fixes the offer screen on. It is non-nullable, and
        // it is never reconstructed from a rate card here (`offer-state.ts`
        // rule 1).
        amountPaise: offer.lead_total_receipt_paise,
        amountLabel: "Your payout",
        urgency: "live" as const,
        respondsBy: offer.responds_by,
        whenIso: offer.requested_start,
        whenIsDay: false,
        durationMinutes: null,
        areaLabel: area,
        ...named(
          `Crew offer · ${offer.headcount} ${helperNoun(offer.headcount)}`,
          area,
        ),
      };
    });
}

/* --------------------------------------------------------------------------
   A1 direct offers — the unit-scoped dispatch inbox
   -------------------------------------------------------------------------- */

/**
 * The other offer inbox, and it shares nothing with the one above but its shape
 * on this screen.
 *
 * `Offer` (contract 1.13.0) and `CrewOffer` have **no field name in common** —
 * the id is `id` rather than `invitation_id`, the deadline is `expires_at`
 * rather than `responds_by`, the start is `starts_at` rather than
 * `requested_start`, the area is a nullable `approximate_area` rather than a
 * non-null `area_label`, and the money is a `Money` object rather than a paise
 * integer. Every one of those was read off `schema.d.ts:7269-7295` rather than
 * assumed from the A3 mapping.
 *
 * ## Filtered by settlement, and deliberately not by a clock
 *
 * `isOfferSettled` is the module's own predicate and is reused rather than
 * reimplemented as the inverse of its `SETTLED_STATUSES` list. What survives it
 * is `OFFERED` and `ACCEPTED_PENDING_UNDO` — and the second one is kept on
 * purpose: that module documents it as *not* settled, because the undo window
 * expires on a server timer into a commitment.
 *
 * Unlike the A3 mapping there is **no client-side lapse check** here, and that
 * is the A1 module's own position rather than an omission: Celery owns every
 * deadline, `status` is the truth, and the inbox polls at five seconds precisely
 * so the server's answer arrives quickly. The A3 side adds `isOfferLive` because
 * it polls at fifteen against a two-minute deadline and has a real staleness
 * window to close; inventing the same guard here would be this adapter deciding
 * an offer is dead while the server still says otherwise.
 */
function fromDirectOffers(offers: readonly Offer[]): WorkItem[] {
  return offers
    .filter((offer) => !isOfferSettled(offer))
    .map((offer) => {
      const area = blankToNull(offer.approximate_area);
      const lines = offer.service_lines;
      const first = lines[0];
      const label =
        first === undefined
          ? "job"
          : lines.length > 1
            ? `${first.service_label} +${lines.length - 1} more`
            : first.service_label;

      return {
        kind: "offer" as const,
        // Namespaced away from the A3 keys: both sources produce `kind: "offer"`,
        // and these are different records from different endpoints.
        key: `direct-offer:${offer.id}`,
        href: DIRECT_OFFER_HREF(),
        // `estimated_net` is the server's own gross-minus-commission figure.
        // Null before the projection has priced the unit.
        amountPaise: offer.estimated_net?.amount_paise ?? null,
        amountLabel: "Est. payout",
        urgency: "live" as const,
        // `undo_deadline` first, because once the offer is `ACCEPTED_PENDING_UNDO`
        // that is the clock actually running — `expires_at` is the window the
        // vendor already answered inside, and sorting on it would pin an accepted
        // offer to the top of the stack behind a countdown that has passed.
        // `expires_at` is non-nullable, so this is never null.
        respondsBy: offer.undo_deadline ?? offer.expires_at,
        whenIso: offer.starts_at,
        whenIsDay: false,
        durationMinutes: offer.estimated_duration_minutes,
        areaLabel: area,
        ...named(label, area),
      };
    });
}

/* --------------------------------------------------------------------------
   Enquiries — the ones still waiting on this vendor
   -------------------------------------------------------------------------- */

/**
 * Whether the ball is with this vendor.
 *
 * Decided by `enquiry-state.bucketOf` rather than by a status set of this
 * module's own, so the WORK stack and the enquiry inbox cannot come to different
 * conclusions about the same row. `needs_response` is `INVITED` ("Waiting for
 * you") and `accepted` is `ACCEPTED` ("Accepted — quote next"); `quoted` is with
 * the customer and `closed` is over, and neither is work this vendor still owes.
 *
 * Note this is deliberately **not** `permissionsFor(status).canQuote`, which is
 * `ACCEPTED | QUOTED` — that answers "may this vendor send a price", which is
 * true of an enquiry they have already priced and false of one they have not yet
 * accepted. The question here is whose move it is.
 */
function isVendorsMove(enquiry: EnquirySummary): boolean {
  const bucket = bucketOf(enquiry.status);
  return bucket === "needs_response" || bucket === "accepted";
}

function fromEnquiries(enquiries: readonly EnquirySummary[]): WorkItem[] {
  return enquiries.filter(isVendorsMove).map((enquiry) => ({
    kind: "enquiry" as const,
    key: `enquiry:${enquiry.id}`,
    href: ENQUIRY_HREF(enquiry.id),
    amountPaise: null,
    amountLabel: null,
    urgency: "needs_price" as const,
    // Both are published non-nullable on `EnquirySummary`, so neither is
    // defaulted. `responds_by` is a business-hours deadline rather than a
    // wall-clock one — see `enquiry-state.describeDeadline`; the sort below only
    // needs the instant.
    respondsBy: enquiry.responds_by,
    whenIso: enquiry.requested_start,
    // The customer picked a day, not a time — see `whenIsDay`.
    whenIsDay: true,
    durationMinutes: null,
    areaLabel: enquiry.approximate_area.trim() || null,
    actionLabel:
      enquiry.archetype === "A5_CUSTOM_PROJECT"
        ? enquiry.status === "INVITED"
          ? "Review & book visit"
          : "Book visit"
        : enquiry.status === "INVITED"
          ? "Review request"
          : "Prepare quote",
    // An `INVITED` enquiry has not been accepted yet, so "needs a price" would
    // be the wrong state for it even though it shares the `needs_price`
    // urgency. The urgency is the card's colour; this is the chip.
    ...named(
      enquiry.service_name,
      enquiry.status === "INVITED" ? "waiting on your answer" : "needs a price",
    ),
  }));
}

/**
 * Whether this vendor already answered and is waiting on the customer.
 *
 * `quoted` is the one bucket `isVendorsMove` excludes on purpose — the ball is
 * with the customer, not this vendor (see that function's own doc comment).
 * But it is still this vendor's own sent price, and dropping it from the stack
 * entirely left no card at all for "I answered" — one of the four states the
 * module doc at the top of this file promises. It reads as `settled`: green,
 * done-my-part, no clock running, because there genuinely is nothing left for
 * this vendor to do until the customer moves.
 */
function quotedOutcome(
  enquiry: EnquirySummary,
): "waiting" | "not_chosen" | "cancelled" | null {
  if (bucketOf(enquiry.status) !== "quoted") return null;
  if (enquiry.latest_proposal_status === "SUBMITTED") return "waiting";
  if (
    enquiry.latest_proposal_status === "REJECTED" &&
    enquiry.latest_proposal_rejection_reason === "NOT_CHOSEN"
  ) {
    return "not_chosen";
  }
  if (enquiry.requirement_status.startsWith("CLOSED_")) return "cancelled";
  return null;
}

function fromQuotedEnquiries(enquiries: readonly EnquirySummary[]): WorkItem[] {
  return enquiries.flatMap((enquiry): WorkItem[] => {
    const outcome = quotedOutcome(enquiry);
    if (outcome === null) return [];
    return [
      {
        kind: "enquiry" as const,
        key: `enquiry:${enquiry.id}`,
        href: ENQUIRY_HREF(enquiry.id),
        amountPaise: null,
        amountLabel: null,
        urgency:
          outcome === "waiting" ? "answered" : outcome === "not_chosen" ? "not_chosen" : "closed",
        respondsBy: null,
        whenIso: enquiry.requested_start,
        whenIsDay: true,
        durationMinutes: null,
        areaLabel: enquiry.approximate_area.trim() || null,
        ...named(
          enquiry.service_name,
          outcome === "waiting" ? "quote sent" : outcome === "not_chosen" ? "not chosen" : "cancelled",
        ),
      },
    ];
  });
}

/* --------------------------------------------------------------------------
   Engagements — the agreements being performed
   -------------------------------------------------------------------------- */

/**
 * Engagement statuses that read as "doing it now" rather than settled.
 *
 * The published members are `PENDING_START | ACTIVE | COMPLETING | COMPLETED |
 * WARRANTY | CLOSED | DISPUTED | CANCELLED`. `ACTIVE` is "work is under way" and
 * `COMPLETING` is "every stage is settled, the customer is signing off" — both
 * are still the vendor's open business — while `PENDING_START` is agreed but not
 * begun. The other four are over, and an engagement is never mapped to `settled`
 * here: this stack shows a vendor what they are on the hook for, and a closed
 * agreement is not that.
 *
 * `DISPUTED` is left out on purpose. It is a state that needs a screen with the
 * dispute on it, not a row in a merged stack that would render it as ordinary
 * work in progress.
 */
type EngagementStatus = Engagement["status"];

const DOING_ENGAGEMENT_STATUS: ReadonlySet<EngagementStatus> = new Set<EngagementStatus>([
  "PENDING_START",
  "ACTIVE",
  "COMPLETING",
]);

function fromEngagements(engagements: readonly Engagement[]): WorkItem[] {
  return engagements
    .filter((engagement) => DOING_ENGAGEMENT_STATUS.has(engagement.status))
    .map((engagement) => ({
      kind: "engagement" as const,
      key: `engagement:${engagement.id}`,
      href: ENGAGEMENT_HREF(engagement.id),
      // `staged_total_paise` — "now owed", the number the work is against
      // today, amendments included. The same field `EngagementCard` shows, for
      // the reason written there: `total_paise` never moves, so on an engagement
      // with an accepted amendment the original is a figure nobody is owed.
      // `@vsolve/query`'s `agreedTotals().owedPaise` is the canonical name for
      // this rule and is read directly here only because that barrel re-exports
      // `QueryProvider` — pulling a React provider and the devtools into a pure
      // model module, and into every node test that imports it, is a heavier
      // dependency than one field read justifies.
      //
      // Explicitly **not** `commission_paise`: that is Vsolve's cut, rendered as
      // a deduction in `agreement-panel.tsx`, and it is documented server-side as
      // "zero for `LEAD_ONLY`" — so on the whole A3 direct-pay path it is not
      // even a number, let alone the vendor's.
      //
      // This is the one kind whose amount is **not** a net payout figure. See
      // `WorkItem.amountPaise` for what `commission_treatment` leaves undecided.
      amountPaise: engagement.staged_total_paise,
      amountLabel: "Agreed total",
      urgency: "doing" as const,
      // An engagement publishes no schedule of its own — its stages carry
      // `scheduled_on`, the agreement does not — so there is nothing honest to
      // sort it by. It falls to the end of its own bucket rather than being
      // given a date this module made up.
      respondsBy: null,
      whenIso: null,
      whenIsDay: false,
      durationMinutes: null,
      areaLabel: null,
      /*
        `Engagement` publishes no service name — only `archetype`, a
        `requirement` uuid and money (`schema.d.ts:6544`). So the title is what
        kind of record this is in the vendor's own vocabulary, which is what
        `engagement-copy`'s wording exists to decide. It is not much, but
        "Project" beats the status: a card reading "Engagement, active" told a
        vendor the one thing they could already see from its colour, and none
        of the thing they opened the app to find out.
      */
      ...named(engagementTitle(engagement), null),
    }));
}

/* --------------------------------------------------------------------------
   A1 visits — the jobs with a slot on the calendar
   -------------------------------------------------------------------------- */

type VisitStatus = PartnerVisit["status"];

/**
 * A visit that is still this Partner's to finish.
 *
 * `ABORTED` and `COMPLETION_SUBMITTED` are in here for a reason worth writing
 * down, because both look at first glance like states that are over:
 *
 * - **`ABORTED`** is not finished — `canReportCompletion` returns true for it
 *   (`features/work/queries.ts:68-70`), so a Partner who abandoned a job on site
 *   still owes the completion report that settles the money. Leaving it out made
 *   the job vanish from the only screen that lists work, at exactly the moment
 *   the Partner needed to act on it.
 * - **`COMPLETION_SUBMITTED`** is the ordinary transient state immediately after
 *   filing that report. Dropping it made the card blink out of existence in the
 *   second the Partner would look for confirmation that it landed.
 *
 * Neither gets its own urgency. They render as ordinary "doing" cards — the fix
 * is that they are visible, not that they are special.
 */
const DOING_VISIT_STATUS: ReadonlySet<VisitStatus> = new Set<VisitStatus>([
  "CONFIRMED",
  "EN_ROUTE",
  "ARRIVED",
  "IN_PROGRESS",
  "ABORTED",
  "COMPLETION_SUBMITTED",
]);

const SETTLED_VISIT_STATUS: ReadonlySet<VisitStatus> = new Set<VisitStatus>([
  "COMPLETED",
  "PARTIALLY_COMPLETED",
]);

const SETTLED_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A settled job stays on the stack for 24h, then drops off — otherwise every
 * job a Partner has ever finished becomes a permanent green tail and
 * `EmptyWork` ("Nothing today") is unreachable for anyone with history.
 *
 * `scheduled_start` is the closest instant `PartnerVisit` publishes for a
 * finished job — there is no separate completed-at timestamp on the wire
 * today, so this is measured from when the job was due to start, not from
 * when it was actually marked done. `server_now` (not the browser's clock)
 * is the reference instant, the same clock-skew guard `offersServerNow` gives
 * the crew-offer countdown.
 */
function isRecentlySettled(job: PartnerVisit): boolean {
  const scheduled = new Date(job.scheduled_start).getTime();
  const now = new Date(job.server_now).getTime();
  if (Number.isNaN(scheduled) || Number.isNaN(now)) return true;
  return now - scheduled < SETTLED_WINDOW_MS;
}

/*
 * `DISPUTED`, `RECOVERY_REQUIRED` and `CANCELLED` are still dropped, and
 * deliberately so rather than by oversight. What a disputed or clawed-back job
 * should say — and what the Partner is even allowed to do from the card — is a
 * product question with money and an Operations case behind it. Rendering one as
 * an ordinary work card would be this module inventing that answer.
 */

function fromJobs(jobs: readonly PartnerVisit[]): WorkItem[] {
  return jobs
    .filter(
      (job) =>
        DOING_VISIT_STATUS.has(job.status) ||
        (SETTLED_VISIT_STATUS.has(job.status) && isRecentlySettled(job)),
    )
    .map((job) => ({
      kind: "job" as const,
      key: `job:${job.id}`,
      href: JOB_HREF(job.id),
      // Both figures are server-calculated after commission and scoped to this
      // Partner. The ledger earning wins once settlement makes it authoritative;
      // before then, the immutable booked-scope estimate keeps the fare visible.
      amountPaise: job.earning?.net_paise ?? job.estimated_earning?.net_paise ?? null,
      amountLabel: job.earning === null ? "Est. payout" : "You earned",
      urgency: (SETTLED_VISIT_STATUS.has(job.status) ? "settled" : "doing") as WorkUrgency,
      respondsBy: null,
      whenIso: job.scheduled_start,
      // A real slot on the availability grid, unlike an enquiry's requested day.
      whenIsDay: false,
      durationMinutes: job.estimated_duration_minutes,
      areaLabel: blankToNull(job.approximate_area),
      // `display_title` names the booked scope before tasks exist. `jobTitle`
      // retains task labels only as compatibility for older projections.
      ...named(jobTitle(job), SETTLED_VISIT_STATUS.has(job.status) ? "done" : null),
    }));
}

/* --------------------------------------------------------------------------
   The merge
   -------------------------------------------------------------------------- */

/**
 * `answered` sits between the work in hand and the money already banked.
 *
 * The design's four states are "somebody asked → I answered → I'm doing it → I
 * got paid", and `answered` is the second of them. It briefly shared `settled`
 * with the fourth, which put a sent quote behind the padlock treatment that
 * means "your money is held" and rendered its amount as `₹ ?` — announcing that
 * the platform did not know a price for the one card whose entire content is a
 * price the vendor just sent. Nothing is owed on a sent quote and nothing is
 * held; the customer simply has not answered yet.
 */
const URGENCY_RANK: Record<WorkUrgency, number> = {
  live: 0,
  needs_price: 1,
  doing: 2,
  answered: 3,
  not_chosen: 4,
  closed: 5,
  settled: 6,
};

/**
 * Merges the six source lists into one sorted stack.
 *
 * Sort key is `(urgency rank, deadline-or-start ascending)`. Within "live"
 * this puts the offer closest to expiring first — the same ordering
 * `LiveOfferSheet` already relies on ("the server already orders by
 * responds_by, and the one about to lapse is the one worth interrupting
 * for"). Within "needs_price" and "doing" it is oldest-deadline/soonest-
 * start first. "settled" items sort newest-first since there is no
 * deadline to order by; `whenIso` is reused for that purpose there.
 *
 * A row with neither instant sorts last inside its own bucket. Two sources can
 * reach that: an engagement, which publishes no schedule at all, and an **A3
 * crew** offer whose `responds_by` and `requested_start` are both null — both
 * are nullable on `CrewOffer` (`schema.d.ts:6151,6154`) and `isOfferLive`
 * deliberately treats a null deadline as live rather than as lapsed. An A1
 * direct offer never reaches it: `Offer.expires_at` is non-nullable, so its
 * `respondsBy` is always set.
 */
export function toWorkItems(sources: {
  /** A3 rate-card crew offers. */
  offers: readonly CrewOffer[];
  offersServerNow: string | null;
  /** A1 unit-scoped direct offers. Judged by status alone — no clock needed. */
  directOffers: readonly Offer[];
  enquiries: readonly EnquirySummary[];
  engagements: readonly Engagement[];
  jobs: readonly PartnerVisit[];
}): WorkItem[] {
  const items: WorkItem[] = [
    // No `server_now` means the offers read has not landed — `CrewOfferList`
    // publishes it non-nullable (`schema.d.ts:6213`), so the only way it is
    // absent is an absent response. Judging a dispatch deadline against the
    // device clock is the one thing `isOfferLive` exists to refuse, so the
    // offers are dropped rather than filtered against a guess.
    //
    // An explicit null check rather than a truthiness one: the distinction being
    // drawn is "did the read land", not "is this string non-empty".
    ...(sources.offersServerNow !== null
      ? fromCrewOffers(sources.offers, sources.offersServerNow)
      : []),
    // Both offer sources land in `live` and interleave by deadline — an A1 offer
    // expiring in seconds should outrank an A3 one with a minute left, and the
    // comparator already does that on `respondsBy` without knowing which source
    // produced the row.
    ...fromDirectOffers(sources.directOffers),
    ...fromEnquiries(sources.enquiries),
    ...fromQuotedEnquiries(sources.enquiries),
    ...fromEngagements(sources.engagements),
    ...fromJobs(sources.jobs),
  ];

  return items.sort((a, b) => {
    const rankDiff = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (rankDiff !== 0) return rankDiff;

    const aTime = a.respondsBy ?? a.whenIso;
    const bTime = b.respondsBy ?? b.whenIso;
    if (aTime === null && bTime === null) return 0;
    if (aTime === null) return 1;
    if (bTime === null) return -1;

    const diff = new Date(aTime).getTime() - new Date(bTime).getTime();
    // Equal rank means equal urgency, so reading `a`'s is reading both.
    return a.urgency === "settled" ? -diff : diff;
  });
}
