/**
 * The M2 Operations surface — queues, the request timeline, recovery actions and
 * the revision-4 rate card. Contract 1.32.0 (Wave C6) plus 1.29.0's rate cards.
 *
 * Closes the domain half of `M2-FE-701..705`, `M2-FE-712` and `M2-FE-713`.
 * Everything here is pure: no React, no fetching. The hooks that call these
 * endpoints live in `apps/admin/features/m2-requests/queries.ts` and
 * `features/m2-rate-cards/queries.ts`, because exactly one application reads
 * this surface and a hook in a shared package would imply otherwise.
 *
 * ## Why the keys are here and not in `keys.ts`
 *
 * `queryKeys` is not this session's file, and `m2-keys.ts` is frozen for the
 * wave. The keys below **compose from** `queryKeys.operations.all` rather than
 * repeating the string, so a single `invalidateQueries({queryKey:
 * queryKeys.operations.all})` still clears them and the two factories cannot
 * disagree about the prefix. When the freeze lifts they move under
 * `m2QueryKeys` unchanged.
 *
 * ## The rule this module exists to hold
 *
 * **Nothing here decides a number, a membership or an actor.** Three specific
 * traps, all of which have already been paid for once on this project:
 *
 * 1. **No predicate decides membership by exclusion.** Gate 3 found a set of
 *    "is this still outstanding?" helpers written as `!== SOME_TERMINAL_VALUE`,
 *    which silently absorbed a new enum value as *outstanding*. 1.32.0 widened
 *    `OperationsCaseKindEnum` by four, `OperationsCase`'s subject by two and
 *    `OperationsCaseEventKindEnum` by six. Every classification below is a
 *    positive, enumerated statement, and anything unrecognised is reported as
 *    unrecognised rather than swept into the majority branch.
 * 2. **No money is computed from parts.** The rate card publishes its three
 *    components *and* the two totals derived from them. Summing the components
 *    here would produce a second answer to "what does the Customer pay", and the
 *    first time rounding or a levy landed between them the screen that decides
 *    every A3 price would be quietly wrong. {@link rateCardComponents} and
 *    {@link rateCardTotals} return published fields and nothing else.
 * 3. **No actor is inferred.** Only two timeline event types carry an actor at
 *    all. The other thirteen are assembled from aggregates that never recorded
 *    one, and a screen that guessed "Operations" from an event's *shape* would
 *    be putting a name next to a money decision on the strength of a `switch`.
 */

import type { Schemas } from "@vsolve/api-client";

import { EXPIRING_STATE, STATIC_CONTENT, VOLATILE_STATE, type FreshnessTier } from "./freshness";
import { queryKeys } from "./keys";

/* ---------------------------------------------------------------------------
   Wire types
   --------------------------------------------------------------------------- */

export type StuckQueue = Schemas["StuckQueue"];
export type StuckQueueList = Schemas["StuckQueueList"];
export type RequestTimeline = Schemas["RequestTimeline"];
export type RequestTimelineEvent = Schemas["TimelineEvent"];
export type OperationsTouch = Schemas["OperationsTouch"];
export type TouchMetric = Schemas["TouchMetric"];
export type TouchRollup = Schemas["TouchRollup"];
export type ReconciliationSummary = Schemas["ReconciliationSummary"];
export type RefundReviewDecision = Schemas["OperationsRefundReviewDecisionEnum"];
export type ReclassificationTarget = Schemas["ToArchetypeEnum"];
export type OperationsRateCard = Schemas["RateCard"];
export type OperationsRateCardList = Schemas["RateCardList"];
export type RateCardPublish = Schemas["RateCardPublishRequest"];
export type CrewVerificationRow = Schemas["CrewMembershipVerificationRow"];
export type CapturedProposal = Schemas["Proposal"];
export type CapturedQuestion = Schemas["RequirementQuestion"];
export type ProposalTaxBasis = Schemas["ProposalTaxBasisEnum"];
export type ServiceAreaOption = Schemas["PartnerServiceAreaOption"];

/* ---------------------------------------------------------------------------
   Keys and freshness
   --------------------------------------------------------------------------- */

const OPS = queryKeys.operations.all;

export const m2OpsKeys = {
  all: [...OPS, "m2"] as const,

  /** The eight stuck-state queues. One entry — the server returns them together. */
  queues: () => [...OPS, "m2", "queues"] as const,

  /**
   * One request's whole history.
   *
   * Keyed by requirement, and every recovery command returns a fresh copy of
   * exactly this shape — so the commands write the cache rather than invalidate
   * it. That is not an optimisation: `rematch` advances a cascade, and a screen
   * that refetched afterwards could show the state *before* the wave it just
   * started, which is the one moment an operator is deciding whether to press it
   * again.
   */
  timeline: (requirementId: string) => [...OPS, "m2", "timeline", requirementId] as const,

  /** One request's Operations cost. Separate from the timeline: it is a judgement, not a history. */
  touchMetric: (requirementId: string) => [...OPS, "m2", "touch-metric", requirementId] as const,

  /** Thirty days of touches across every request. */
  touchRollup: () => [...OPS, "m2", "touch-rollup"] as const,

  /**
   * Published rate cards, optionally narrowed to one city.
   *
   * The filter is in the key because it changes the server's answer, exactly as
   * it is on the M1 partner directory. A city-narrowed list and the full list
   * sharing one entry would show a reviewer a card they did not ask about at the
   * moment they are deciding a price.
   */
  rateCards: (serviceArea: string | null) => [...OPS, "m2", "rate-cards", serviceArea] as const,

  /**
   * Every live card's decline rate over the alarm window, armed or not.
   *
   * Its own key rather than nested under `rateCards`, and the difference is the
   * point: a card is immutable, but its decline rate moves every time a lead
   * answers an offer. Nesting would have put a live reading on the calm
   * `STATIC_CONTENT` tier the immutable cards sit on.
   */
  declineAlarm: () => [...OPS, "m2", "decline-alarm"] as const,

  /** Crew memberships whose documents have never been verified. */
  crewVerification: (partner: string | null) =>
    [...OPS, "m2", "crew-verification", partner] as const,

  /** Open financial exceptions. */
  reconciliation: () => [...OPS, "m2", "reconciliation"] as const,
} as const;

export const M2_OPS_FRESHNESS: Record<
  | "queues"
  | "timeline"
  | "touchMetric"
  | "touchRollup"
  | "rateCards"
  | "declineAlarm"
  | "crewVerification",
  FreshnessTier
> = {
  /**
   * Read to decide what to pick up next. A minute-old depth sends somebody to an
   * empty queue, and every member of every queue is defined by a deadline that
   * has already passed.
   */
  queues: EXPIRING_STATE,
  /** The read a support agent makes a money decision from. Never served stale. */
  timeline: EXPIRING_STATE,
  touchMetric: VOLATILE_STATE,
  /** Thirty days of history. It does not move while somebody looks at it. */
  touchRollup: VOLATILE_STATE,
  /**
   * `STATIC_CONTENT`, and this is the one row worth arguing about. A card is
   * **loaded, never edited** — publishing is one more row — so a list a few
   * minutes old is missing a card rather than misstating one. What it must never
   * do is re-render a *changed* price, and it cannot: the rows it holds are
   * immutable.
   */
  rateCards: STATIC_CONTENT,
  /**
   * `VOLATILE_STATE`, and pointedly **not** the `STATIC_CONTENT` its cards sit
   * on. The cards are immutable; the rate over them is not, and a five-minute
   * cache on an alarm is a five-minute delay on the one screen whose entire
   * argument is that somebody has to act today.
   */
  declineAlarm: VOLATILE_STATE,
  crewVerification: VOLATILE_STATE,
};

/* ---------------------------------------------------------------------------
   `M2-FE-701` — queues
   --------------------------------------------------------------------------- */

/**
 * The recovery this queue publishes, or `null` when only a person can decide.
 *
 * `recovery_action` is published rather than inferred from the queue code —
 * exactly as it is on M1 Booking Groups — so the console renders a real button
 * instead of guessing from a name. An **empty string is a deliberate value**,
 * not a missing one: `inactive` engagements and `case_response_overdue` cases
 * have no safe automatic recovery, and offering one would be the console
 * inventing a command.
 */
export function queueRecoveryAction(queue: StuckQueue): string | null {
  const action = queue.recovery_action.trim();
  return action === "" ? null : action;
}

/** Whether anything is actually in this queue. Depth is server-counted, never a page length. */
export function queueIsEmpty(queue: StuckQueue): boolean {
  return queue.depth === 0;
}

/**
 * Free-text search over the published queue rows.
 *
 * Filters what C6 already computed; it never re-derives a queue. The searchable
 * text is the label, the code and the recovery action, because an operator
 * looking for "the rematch ones" is searching by what they intend to do.
 */
export function searchQueues(queues: readonly StuckQueue[], term: string): StuckQueue[] {
  const needle = term.trim().toLowerCase();
  if (needle === "") return [...queues];
  return queues.filter((queue) =>
    `${queue.queue_label} ${queue.code} ${queue.recovery_action}`.toLowerCase().includes(needle),
  );
}

/** Deepest first, then oldest first. What is worst is what somebody should open. */
export function queuesByUrgency(queues: readonly StuckQueue[]): StuckQueue[] {
  return [...queues].sort((left, right) => {
    if (left.depth !== right.depth) return right.depth - left.depth;
    const leftAge = left.oldest_at ?? "";
    const rightAge = right.oldest_at ?? "";
    return leftAge.localeCompare(rightAge);
  });
}

/* ---------------------------------------------------------------------------
   `M2-FE-702` / `M2-FE-703` — the timeline, and who did what
   --------------------------------------------------------------------------- */

/**
 * How a timeline entry was produced, as a fact about the record rather than a
 * claim about a person.
 *
 * "Source" in `M2-FE-703` is this: which aggregate the event was assembled from.
 * It is a restatement of the published `type` and nothing more. It is
 * deliberately **not** an actor — `REQUIREMENT_TRANSITION` comes from the
 * transition log whether a Customer, a vendor or a sweep caused it.
 */
export type TimelineSource =
  | "requirement"
  | "matching"
  | "clarification"
  | "proposal"
  | "site_visit"
  | "money"
  | "engagement"
  | "case"
  | "cancellation"
  | "operations"
  | "unrecognised";

export interface TimelineDescriptor {
  /** Plain language. "A vendor was invited", not "VENDOR_INVITED". */
  readonly title: string;
  readonly source: TimelineSource;
  /**
   * A privileged or commercial state change, in `M2-FE-703`'s sense: something a
   * party is owed an account of. These are the entries that must show an actor
   * or say plainly that none was published.
   */
  readonly accountable: boolean;
  /** The `detail` key holding an actor id, or `null` when the record has none. */
  readonly actorKey: string | null;
  /** `detail` keys carrying a reason or reason code, in the order to show them. */
  readonly reasonKeys: readonly string[];
  /** `detail` keys carrying server-sent paise. Formatted, never combined. */
  readonly moneyKeys: readonly string[];
}

/**
 * Every event type `operations.request_timeline` can produce, stated positively.
 *
 * Fifteen rows against fifteen `"type": "..."` literals in
 * `backend/apps/requirements/operations.py`. `TimelineEvent.type` is published as
 * a bare `string` rather than an enum, so this table **cannot** be checked by
 * `tsc` — which is exactly why {@link describeTimelineEvent} answers
 * `unrecognised` for anything absent instead of falling through to a default
 * row. A sixteenth event kind will show up as a visibly unrecognised entry with
 * its raw type and its whole detail on screen; it will never show up as a blank
 * row, and it will never quietly borrow another kind's copy.
 */
export const TIMELINE_DESCRIPTORS: Record<string, TimelineDescriptor> = {
  REQUIREMENT_TRANSITION: {
    title: "Request changed state",
    source: "requirement",
    accountable: true,
    actorKey: "actor_id",
    reasonKeys: ["reason_code", "reason"],
    moneyKeys: [],
  },
  SNAPSHOT_TAKEN: {
    title: "Snapshot taken of what vendors were shown",
    source: "matching",
    accountable: false,
    actorKey: null,
    reasonKeys: [],
    moneyKeys: [],
  },
  VENDOR_INVITED: {
    title: "Vendor invited",
    source: "matching",
    accountable: true,
    actorKey: null,
    reasonKeys: [],
    moneyKeys: [],
  },
  VENDOR_RESPONDED: {
    title: "Vendor answered",
    source: "matching",
    accountable: true,
    actorKey: null,
    reasonKeys: ["reason_code"],
    moneyKeys: [],
  },
  QUESTION: {
    title: "Clarification",
    source: "clarification",
    accountable: false,
    actorKey: null,
    reasonKeys: [],
    moneyKeys: [],
  },
  PROPOSAL: {
    title: "Quote submitted",
    source: "proposal",
    accountable: true,
    actorKey: null,
    reasonKeys: [],
    moneyKeys: ["total_paise"],
  },
  SITE_VISIT: {
    title: "Site visit",
    source: "site_visit",
    accountable: false,
    actorKey: null,
    reasonKeys: [],
    moneyKeys: [],
  },
  BOOKING_FEE: {
    title: "Booking fee",
    source: "money",
    accountable: true,
    actorKey: null,
    reasonKeys: ["settlement_reason_code"],
    // `amount_paise` is deliberately absent: a `WAIVED` fee carries a published
    // amount and collected nothing, so it is read through
    // `bookingFeeStatement` rather than formatted as money paid.
    moneyKeys: ["travel_compensation_paise", "platform_share_paise"],
  },
  QUOTE_UNLOCK: {
    title: "Quote unlock",
    source: "money",
    accountable: true,
    actorKey: null,
    reasonKeys: [],
    moneyKeys: ["amount_paise"],
  },
  VISIT_PLAN: {
    title: "Visit plan",
    source: "money",
    accountable: true,
    actorKey: null,
    reasonKeys: [],
    moneyKeys: ["amount_paise"],
  },
  VISIT_PLAN_SHARE: {
    title: "Visit share",
    source: "money",
    accountable: true,
    actorKey: null,
    reasonKeys: [],
    moneyKeys: ["amount_paise", "vendor_payout_paise", "platform_share_paise"],
  },
  ENGAGEMENT_OPENED: {
    title: "Engagement opened",
    source: "engagement",
    accountable: true,
    actorKey: null,
    reasonKeys: [],
    moneyKeys: ["total_paise"],
  },
  ENGAGEMENT_STAGE: {
    title: "Stage",
    source: "engagement",
    accountable: true,
    actorKey: null,
    reasonKeys: ["cancellation_reason_code"],
    moneyKeys: ["amount_paise"],
  },
  CASE_OPENED: {
    title: "Case opened",
    source: "case",
    accountable: true,
    actorKey: null,
    reasonKeys: ["resolution"],
    moneyKeys: [],
  },
  CANCELLATION: {
    title: "Cancellation",
    source: "cancellation",
    accountable: true,
    actorKey: null,
    reasonKeys: ["reason_code", "remedy_code"],
    moneyKeys: [],
  },
  OPERATIONS_TOUCH: {
    title: "Operations acted",
    source: "operations",
    accountable: true,
    actorKey: "actor_id",
    reasonKeys: ["reason"],
    moneyKeys: [],
  },
};

const UNRECOGNISED: TimelineDescriptor = {
  title: "Unrecognised event",
  source: "unrecognised",
  accountable: true,
  actorKey: null,
  reasonKeys: [],
  moneyKeys: [],
};

/**
 * What the reader is allowed to be told about who caused an event.
 *
 * Three states, and the middle one is the whole reason this type exists.
 * `not_published` is not an error and not an absence of an actor — it means the
 * aggregate this event was assembled from never recorded one. Collapsing it into
 * "system" would be the client asserting that nobody was involved.
 */
export type TimelineActor =
  | { readonly kind: "actor"; readonly actorId: string }
  | { readonly kind: "not_published" }
  | { readonly kind: "not_applicable" };

function readString(detail: Record<string, unknown>, key: string): string | null {
  const value = detail[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function readInteger(detail: Record<string, unknown>, key: string): number | null {
  const value = detail[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/** One timeline event, normalised for rendering. Nothing here is invented. */
export interface TimelineEntry {
  readonly at: string;
  readonly type: string;
  readonly descriptor: TimelineDescriptor;
  readonly recognised: boolean;
  readonly actor: TimelineActor;
  /** `{label, value}` pairs from the descriptor's reason keys that were present. */
  readonly reasons: readonly { readonly key: string; readonly value: string }[];
  /** `{key, paise}` pairs. Server-sent integers; the view formats, never adds. */
  readonly money: readonly { readonly key: string; readonly paise: number }[];
  /** The published status on this event's own record, when it carries one. */
  readonly status: string | null;
  readonly detail: Record<string, unknown>;
}

function readDetail(event: RequestTimelineEvent): Record<string, unknown> {
  const detail: unknown = event.detail;
  return typeof detail === "object" && detail !== null && !Array.isArray(detail)
    ? (detail as Record<string, unknown>)
    : {};
}

/**
 * Normalises one published event without deciding anything about it.
 *
 * An unrecognised `type` gets {@link UNRECOGNISED} — which is marked
 * `accountable`, so it renders with the "no actor published" line rather than
 * silently as a low-importance row. That is the fail-closed direction: a new
 * event kind is over-reported until somebody adds it here.
 */
export function describeTimelineEvent(event: RequestTimelineEvent): TimelineEntry {
  const descriptor = TIMELINE_DESCRIPTORS[event.type];
  const recognised = descriptor !== undefined;
  const resolved = descriptor ?? UNRECOGNISED;
  const detail = readDetail(event);

  const actorId = resolved.actorKey === null ? null : readString(detail, resolved.actorKey);
  const actor: TimelineActor =
    actorId !== null
      ? { kind: "actor", actorId }
      : resolved.actorKey !== null
        ? // The record has an actor column and this row's is empty — a sweep or a
          // migration wrote it. Still "not published" to the reader: what they
          // must not be given is a name, and "system" would be one.
          { kind: "not_published" }
        : resolved.accountable
          ? { kind: "not_published" }
          : { kind: "not_applicable" };

  return {
    at: event.at,
    type: event.type,
    descriptor: resolved,
    recognised,
    actor,
    reasons: resolved.reasonKeys.flatMap((key) => {
      const value = readString(detail, key);
      return value === null ? [] : [{ key, value }];
    }),
    money: resolved.moneyKeys.flatMap((key) => {
      const paise = readInteger(detail, key);
      return paise === null ? [] : [{ key, paise }];
    }),
    status: readString(detail, "status"),
    detail,
  };
}

/** Oldest first, which is how a history reads. The server already sorted; this is explicit. */
export function timelineEntries(timeline: RequestTimeline): TimelineEntry[] {
  return timeline.events.map(describeTimelineEvent);
}

/** Every distinct source present, for the timeline's own filter chips. */
export function timelineSources(entries: readonly TimelineEntry[]): TimelineSource[] {
  const seen = new Set<TimelineSource>();
  for (const entry of entries) seen.add(entry.descriptor.source);
  return [...seen];
}

/**
 * The booking-fee trap, contract 1.32.0 §"The four traps" #3.
 *
 * `BookingFeeStatusEnum` gained `WAIVED`, and **it is not a charge**. A waived
 * fee carries the published amount and collected nothing — it is the free
 * re-dispatch after a vendor no-show. Rendering `amount_paise` beside it as
 * money the Customer paid is wrong in the one place it matters most.
 *
 * Written as a positive enumeration of the five published statuses rather than
 * `status !== "WAIVED"`, because the next status added would inherit "this is
 * money the Customer paid" by default under the negative form.
 */
export type BookingFeeStatement =
  /** Nothing was collected. The published amount is not shown as money paid. */
  | { readonly kind: "no_charge"; readonly sentence: string }
  /** Collected and kept. */
  | { readonly kind: "charged"; readonly paise: number; readonly sentence: string }
  /** Collected and returned. */
  | { readonly kind: "returned"; readonly paise: number; readonly sentence: string }
  /** In flight with the provider. Not yours yet, and not theirs. */
  | { readonly kind: "in_flight"; readonly paise: number; readonly sentence: string }
  | { readonly kind: "unrecognised"; readonly status: string };

type FeeMoneyKind = "no_charge" | "charged" | "returned" | "in_flight";

/**
 * What each published fee status says about money the Customer actually parted
 * with, and the sentence that says it.
 *
 * A `Record` over the **generated union** rather than a `switch` on a string, so
 * a ninth `BookingFeeStatusEnum` member is a `tsc` failure here rather than a
 * silent default branch — which is precisely how `WAIVED` would have arrived.
 * Writing this table is what caught that `SETTLED`, `FORFEITED` and `EXPIRED`
 * (three plausible-sounding statuses) do not exist and `OFFER_ACCEPTED`,
 * `EARNED`, `FORFEIT_SPLIT` and `FAILED` do; a hand-written `switch` would have
 * compiled with all six wrong and sent four real statuses to the default.
 */
const FEE_MONEY: Record<
  Schemas["BookingFeeStatusEnum"],
  { kind: FeeMoneyKind; sentence: string }
> = {
  OFFER_ACCEPTED: {
    kind: "no_charge",
    sentence: "A lead accepted. The customer has not paid the fee yet.",
  },
  PENDING: { kind: "in_flight", sentence: "Awaiting the provider — not yet collected." },
  ACTIVE: { kind: "charged", sentence: "Paid; the crew is confirmed." },
  EARNED: { kind: "charged", sentence: "Earned — the crew arrived on day one." },
  FORFEIT_SPLIT: {
    kind: "charged",
    sentence: "Forfeited on a customer no-show and split with the lead.",
  },
  REFUNDED: { kind: "returned", sentence: "Refunded in full." },
  FAILED: { kind: "no_charge", sentence: "The payment failed. Nothing was collected." },
  // The trap: a waived fee carries the published amount and collected nothing.
  WAIVED: { kind: "no_charge", sentence: "Replacement crew, no charge." },
};

export function bookingFeeStatement(detail: Record<string, unknown>): BookingFeeStatement {
  const status = readString(detail, "status");
  if (status === null) return { kind: "unrecognised", status: "" };
  if (!Object.hasOwn(FEE_MONEY, status)) return { kind: "unrecognised", status };

  const row = FEE_MONEY[status as Schemas["BookingFeeStatusEnum"]];
  if (row.kind === "no_charge") return { kind: "no_charge", sentence: row.sentence };

  const paise = readInteger(detail, "amount_paise");
  if (paise === null) return { kind: "unrecognised", status };
  return { kind: row.kind, paise, sentence: row.sentence };
}

/* ---------------------------------------------------------------------------
   `M2-FE-711`-adjacent: the touch metric, and the null that is not false
   --------------------------------------------------------------------------- */

/**
 * The fourth trap: `within_budget` is nullable and **`null` is not `false`**.
 *
 * A null budget means the owner has not set one. `false` reads as a breach and
 * `true` as a pass; neither is known. The count is real and the judgement is
 * not, so the verdict is its own third value and the copy says "no budget set".
 */
export type TouchVerdict = "within_budget" | "over_budget" | "no_budget_set";

export function touchVerdict(metric: TouchMetric): TouchVerdict {
  if (metric.budget === null || metric.within_budget === null) return "no_budget_set";
  return metric.within_budget ? "within_budget" : "over_budget";
}

/* ---------------------------------------------------------------------------
   `M2-FE-712` — the rate card
   --------------------------------------------------------------------------- */

/**
 * One published component of a day rate, labelled.
 *
 * Returned as three separate entries, never as a total, and the order is the
 * order they are argued about in: what the worker earns, what the lead earns for
 * supervising, what the platform charges for the match. `07 §7` forbids
 * publishing a wage component below the statutory floor, and a screen that
 * showed one blended number could not be reviewed against a floor at all — which
 * is the reason `RateCard`'s docstring gives for publishing the split on this
 * surface and nowhere else.
 */
export interface RateCardComponent {
  readonly key: "worker_day_wage" | "supervision_margin" | "booking_fee";
  readonly label: string;
  readonly explanation: string;
  readonly paise: number;
}

export function rateCardComponents(card: OperationsRateCard): RateCardComponent[] {
  return [
    {
      key: "worker_day_wage",
      label: "Worker day wage",
      explanation:
        "What one worker is paid for a standard day. Checked against the statutory floor at publish; wages are paid directly by the customer to the lead and are never held by the platform.",
      paise: card.worker_day_wage_paise,
    },
    {
      key: "supervision_margin",
      label: "Lead supervision margin",
      explanation: "What the lead earns for supervising the crew for the day.",
      paise: card.supervision_margin_paise,
    },
    {
      key: "booking_fee",
      label: "Platform booking fee",
      explanation:
        "Charged when a vendor accepts. This is the platform's entire A3 revenue on the booking.",
      paise: card.booking_fee_paise,
    },
  ];
}

/**
 * The two totals, **as published**.
 *
 * Deliberately a separate function from {@link rateCardComponents}, and
 * deliberately not derived from it. `customer_day_rate_paise` and
 * `lead_day_receipt_paise` are computed server-side and frozen onto every
 * booking made against the card; recomputing them here would create a second
 * answer that agrees today and cannot be relied on to agree tomorrow.
 */
export function rateCardTotals(card: OperationsRateCard): {
  readonly customerPaysPaise: number;
  readonly leadReceivesPaise: number;
} {
  return {
    customerPaysPaise: card.customer_day_rate_paise,
    leadReceivesPaise: card.lead_day_receipt_paise,
  };
}

/** Add-on rates as published: an untyped object narrowed to `{name → paise}`. */
export function rateCardAddOns(card: OperationsRateCard): { name: string; paise: number }[] {
  const raw: unknown = card.add_on_rates;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [];
  const rows: { name: string; paise: number }[] = [];
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    // Dropped rather than coerced. A non-integer here means the column holds
    // something this build cannot price, and rendering `NaN` beside a rupee sign
    // on the screen that sets every A3 price is worse than one missing row.
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
      rows.push({ name, paise: value });
    }
  }
  return rows;
}

/** The printed inclusion list as published. Strings only; anything else is dropped. */
export function rateCardInclusions(card: OperationsRateCard): string[] {
  const raw: unknown = card.inclusions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

/** A card grouped by the pair it is keyed on. `service_area` and `skill` are ids. */
export function rateCardGroupKey(card: OperationsRateCard): string {
  return `${card.service_area}::${card.skill}`;
}

/**
 * Cards for one city+skill, newest effective date first, with the live one named.
 *
 * "Live" is decided against the server's own `server_now` from the same
 * response, never a device clock. An operator on a laptop running a day fast
 * would otherwise be told a future card is already pricing bookings — on the
 * screen where that mistake is priced into every booking until someone notices.
 */
export interface RateCardHistory {
  readonly groupKey: string;
  readonly serviceArea: string;
  readonly skill: string;
  readonly cards: readonly OperationsRateCard[];
  /** The card a booking made right now would be priced at, or null when none is effective yet. */
  readonly live: OperationsRateCard | null;
  /** Cards whose `effective_from` is still in the future. Scheduled, not live. */
  readonly scheduled: readonly OperationsRateCard[];
}

function serverDate(serverNow: string): string {
  // `server_now` is an ISO datetime; the card's `effective_from` is a date. The
  // comparison is a string prefix on purpose — parsing to a `Date` would apply
  // the browser's timezone to a decision the server already made in its own.
  return serverNow.slice(0, 10);
}

export function rateCardHistories(list: OperationsRateCardList): RateCardHistory[] {
  const today = serverDate(list.server_now);
  const groups = new Map<string, OperationsRateCard[]>();
  for (const card of list.rate_cards) {
    const key = rateCardGroupKey(card);
    const bucket = groups.get(key);
    if (bucket) bucket.push(card);
    else groups.set(key, [card]);
  }

  const histories: RateCardHistory[] = [];
  for (const [groupKey, cards] of groups) {
    const ordered = [...cards].sort((left, right) =>
      right.effective_from.localeCompare(left.effective_from),
    );
    // A group only exists because a card was pushed into it, so this cannot be
    // empty — narrowed rather than asserted, because a non-null assertion here
    // would be the one place a malformed payload became a runtime crash on the
    // screen that prices every A3 booking.
    const first = ordered[0];
    if (first === undefined) continue;
    histories.push({
      groupKey,
      serviceArea: first.service_area,
      skill: first.skill,
      cards: ordered,
      live: ordered.find((card) => card.effective_from <= today) ?? null,
      scheduled: ordered.filter((card) => card.effective_from > today),
    });
  }
  return histories;
}

/**
 * Whole days between a card's effective date and the server's today.
 *
 * Both halves are server-sent. Used only to show how long a price has stood —
 * the monthly review calendar `M2-FE-713` names as the alarm's backstop — and
 * never to decide anything.
 */
export function daysEffective(card: OperationsRateCard, serverNow: string): number {
  const from = Date.parse(`${card.effective_from}T00:00:00Z`);
  const now = Date.parse(`${serverDate(serverNow)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(now)) return 0;
  return Math.round((now - from) / 86_400_000);
}

/**
 * The refusals `m2_rate_card_publish` exists to produce, named.
 *
 * `M2-FE-712` requires that a card whose wage component sits below the statutory
 * floor cannot publish **and that the refusal names why**. The generic error
 * banner would say "check your details", which is true of a typo and useless
 * here: the operator needs to know it was the *wage* component, against a floor
 * *for that state and skill*, and that raising the other two will not help.
 */
export type PublishRefusal =
  | "below_wage_floor"
  | "no_floor_loaded"
  | "backdated_under_live_booking"
  | "other";

export function publishRefusalFor(code: string, status: number): PublishRefusal {
  switch (code) {
    case "m2_proposal_below_wage_floor":
      return "below_wage_floor";
    case "m2_wage_floor_unavailable":
      return "no_floor_loaded";
    case "m2_requirement_transition_not_allowed":
      // 409 only. The same code answers other things on other endpoints; on this
      // one the contract names exactly one cause.
      return status === 409 ? "backdated_under_live_booking" : "other";
    default:
      return "other";
  }
}

/* ---------------------------------------------------------------------------
   `M2-FE-713` — the decline-rate alarm
   --------------------------------------------------------------------------- */

export type DeclineAlarmReading = Schemas["RateCardDeclineAlarm"];
export type DeclineAlarmBoard = Schemas["RateCardDeclineAlarmList"];

/**
 * What one card's reading means, as four named states rather than a colour.
 *
 * Contract 1.33.0 published `GET /operations/rate-cards/decline-alarm/`, and the
 * panel is built around **`armed`**, which is published rather than inferred.
 * Until then this module carried a single hard-typed "unreadable" statement,
 * because the alarm existed, paged by email, and had no read — so the honest
 * screen could not show a green state at all. That was right for a missing
 * endpoint. It is now unnecessary, and keeping it would be its own dishonesty.
 *
 * What survives the change is the reason it was written. **`unarmed` is not
 * `quiet`.** An unarmed card is measured and published — measurement never waits
 * on the owner, only the judgement does — so it has a real rate and no alarm
 * that can ever fire on it. Rendering that as green because `breached` is
 * `false` would be exactly the lie the old panel refused to tell, now with
 * numbers behind it to make it convincing.
 *
 * Ordered by what an operator should look at first. Written as a positive
 * enumeration in one place, so no screen re-derives it from `breached` alone.
 */
export type DeclineAlarmState =
  /** A threshold is set and the rate is over it. Somebody acts today. */
  | "breached"
  /** No threshold for this card's skill: **no alarm can ever fire**. Not green. */
  | "unarmed"
  /** Armed, but too few offers have gone out for the rate to mean anything yet. */
  | "insufficient_offers"
  /** Armed, enough offers, under the threshold. The only green. */
  | "quiet";

export function declineAlarmState(reading: DeclineAlarmReading): DeclineAlarmState {
  // `armed` first, and before `breached`. The server can only set `breached` on
  // an armed card, but reading them in the other order would make an unarmed
  // card fall through to "quiet" the day that stopped being true.
  if (!reading.armed) return "unarmed";
  if (reading.breached) return "breached";
  if (reading.minimum_offers !== null && reading.offers < reading.minimum_offers) {
    return "insufficient_offers";
  }
  return "quiet";
}

/** Basis points as a percentage string. Server-sent integer, formatted, never recomputed. */
export function basisPointsPercent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(basisPoints % 100 === 0 ? 0 : 1)}%`;
}

/**
 * Worst first: breached, then unarmed, then insufficient, then quiet.
 *
 * **Unarmed outranks insufficient-offers deliberately.** A card nothing is
 * watching is a standing hole in the supply-side alarm; a card with too few
 * offers is a temporary absence of evidence, and it at least has something
 * watching it when the offers arrive.
 */
const STATE_RANK: Record<DeclineAlarmState, number> = {
  breached: 0,
  unarmed: 1,
  insufficient_offers: 2,
  quiet: 3,
};

export function declineAlarmsByUrgency(board: DeclineAlarmBoard): DeclineAlarmReading[] {
  return [...board.readings].sort((left, right) => {
    const byState = STATE_RANK[declineAlarmState(left)] - STATE_RANK[declineAlarmState(right)];
    if (byState !== 0) return byState;
    return right.rate_basis_points - left.rate_basis_points;
  });
}

/**
 * The one sentence the whole board reduces to, for the panel's headline.
 *
 * Three states, and two of them are not "fine". An empty `readings` means **no
 * card is published at all**, which the contract is explicit is a different and
 * worse thing than every card being quiet — so it gets its own answer rather
 * than falling into "nothing is breached".
 */
export type DeclineAlarmVerdict = "no_cards" | "breached" | "gaps_in_cover" | "all_clear";

export function declineAlarmVerdict(board: DeclineAlarmBoard): DeclineAlarmVerdict {
  if (board.readings.length === 0) return "no_cards";
  if (board.breached_cards > 0) return "breached";
  // `armed_cards` is published as a count precisely so this question does not
  // need a filter: if any card is unarmed, something is unwatched.
  if (board.armed_cards < board.readings.length) return "gaps_in_cover";
  return "all_clear";
}

/* ---------------------------------------------------------------------------
   `M2-FE-705` — assisted capture
   --------------------------------------------------------------------------- */

/** One vendor on this request, read off the timeline's own invitation events. */
export interface InvitedVendor {
  readonly invitationId: string;
  readonly partnerId: string;
  readonly partnerName: string;
  readonly status: string;
  readonly wave: number | null;
  readonly invitedAt: string;
}

/**
 * The vendors on this request, for the assisted-capture picker.
 *
 * Read from `VENDOR_INVITED` events, which are the one place M2 names a vendor
 * beside a requirement before the Customer has paid — safe here because the
 * audience is Operations, and deliberately a different projection from the
 * Customer's own timeline.
 *
 * **Not filtered by status.** Which invitations may still carry a proposal is a
 * domain rule (`proposals.submit_proposal`), and a copy of it here would offer
 * or withhold the wrong vendor the first time the two drifted. Every invited
 * vendor is listed with its published status; the server decides.
 */
export function invitedVendors(timeline: RequestTimeline): InvitedVendor[] {
  const rows: InvitedVendor[] = [];
  for (const event of timeline.events) {
    if (event.type !== "VENDOR_INVITED") continue;
    const detail = readDetail(event);
    const invitationId = readString(detail, "invitation_id");
    const partnerId = readString(detail, "partner_id");
    if (invitationId === null || partnerId === null) continue;
    rows.push({
      invitationId,
      partnerId,
      partnerName: readString(detail, "partner_name") ?? "Name not published",
      status: readString(detail, "status") ?? "",
      wave: readInteger(detail, "wave"),
      invitedAt: event.at,
    });
  }
  return rows;
}

/** Site visits on this request, for the A5 estimate's required `site_visit_id`. */
export interface RequestSiteVisit {
  readonly siteVisitId: string;
  readonly status: string;
  readonly at: string;
}

export function requestSiteVisits(timeline: RequestTimeline): RequestSiteVisit[] {
  const rows: RequestSiteVisit[] = [];
  for (const event of timeline.events) {
    if (event.type !== "SITE_VISIT") continue;
    const detail = readDetail(event);
    const siteVisitId = readString(detail, "site_visit_id");
    if (siteVisitId === null) continue;
    rows.push({ siteVisitId, status: readString(detail, "status") ?? "", at: event.at });
  }
  return rows;
}

/**
 * How a captured quote must be described, and it is never "the vendor's own".
 *
 * `capture_assisted_proposal` writes `vendor_confirmed_at: null` and every
 * Customer-facing read filters on it, so a captured quote is invisible to the
 * Customer until the vendor confirms it themselves. There is no way to skip that
 * state and no route that would let Operations skip it — `07 §7` puts "author a
 * proposal without vendor confirmation" in the *may never* column, and the
 * enforcement is that no endpoint exists.
 */
export type CaptureAttribution = "awaiting_vendor_confirmation" | "vendor_confirmed";

export function captureAttribution(proposal: CapturedProposal): CaptureAttribution {
  return proposal.vendor_confirmed_at === null
    ? "awaiting_vendor_confirmation"
    : "vendor_confirmed";
}

/**
 * Whether a captured clarification is published as Operations-assisted.
 *
 * `asked_by_role` is derived server-side by identity comparison rather than
 * inferred, and `OPERATIONS` is its own value precisely so an assisted question
 * cannot arrive looking like a vendor's. Read, never guessed: this client has no
 * way to tell an assisted question from a typed one apart from this field, and
 * guessing from the presence of an answer would mislabel every question a vendor
 * asked and a Customer answered.
 */
export function isAssistedQuestion(question: CapturedQuestion): boolean {
  return question.asked_by_role === "OPERATIONS";
}

/**
 * The A3 composer's total, which the contract requires the **client** to send.
 *
 * The one place in this module that does arithmetic on money, and it is not a
 * display value: `_assert_a3_shape` refuses any A3 proposal whose `total_paise`
 * is not exactly `rate x workers x days`, so the field is a required part of the
 * request rather than a number the screen invented. It is labelled on screen as
 * the total the entries compose to, awaiting the server's own check — never as a
 * price anybody has agreed.
 *
 * Returns `null` on any non-positive input rather than a zero, so an incomplete
 * form cannot submit a total at all.
 */
export function composeWorkforceTotalPaise(input: {
  ratePaisePerWorkerDay: number;
  workerCount: number;
  minimumDays: number;
}): number | null {
  const { ratePaisePerWorkerDay, workerCount, minimumDays } = input;
  if (
    !Number.isSafeInteger(ratePaisePerWorkerDay) ||
    !Number.isSafeInteger(workerCount) ||
    !Number.isSafeInteger(minimumDays) ||
    ratePaisePerWorkerDay <= 0 ||
    workerCount <= 0 ||
    minimumDays <= 0
  ) {
    return null;
  }
  const total = ratePaisePerWorkerDay * workerCount * minimumDays;
  return Number.isSafeInteger(total) ? total : null;
}

/**
 * The A5 composer's total: stages plus material lines.
 *
 * Same standing as {@link composeWorkforceTotalPaise} — `_assert_a5_shape`
 * refuses a mismatch, so this is the request field rather than a display figure.
 * A material-only estimate composes fine here and is refused by the server,
 * which is the right division: "we will buy you materials and do no work" is a
 * domain judgement, not an arithmetic one.
 */
export function composeProjectTotalPaise(
  stages: readonly { amountPaise: number }[],
  materials: readonly { amountPaise: number }[],
): number | null {
  let total = 0;
  for (const row of [...stages, ...materials]) {
    if (!Number.isSafeInteger(row.amountPaise) || row.amountPaise < 0) return null;
    total += row.amountPaise;
  }
  return Number.isSafeInteger(total) ? total : null;
}

/**
 * The archetypes this console can compose a quote for, stated positively.
 *
 * An archetype outside this pair means the request is running a lifecycle this
 * build has no composer for, and the screen refuses to offer one rather than
 * defaulting to the workforce shape — which would send `rate x workers x days`
 * at a request whose domain expects stages and get one refusal per attempt.
 */
export type ComposableArchetype = ReclassificationTarget;

/**
 * Derived from `ToArchetypeEnum` rather than written out, so a third archetype
 * is a `tsc` failure here rather than a request quietly composed in the wrong
 * shape. `RequestTimeline.archetype` is a bare `string` on the wire, which is
 * why the narrowing has to happen at all.
 */
const COMPOSERS: Record<ComposableArchetype, true> = {
  A3_TIME_BLOCK: true,
  A5_CUSTOM_PROJECT: true,
};

export function composerFor(archetype: string): ComposableArchetype | null {
  return Object.hasOwn(COMPOSERS, archetype) ? (archetype as ComposableArchetype) : null;
}
