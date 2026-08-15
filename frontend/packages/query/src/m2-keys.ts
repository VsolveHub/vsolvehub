/**
 * M2 query keys, freshness and invalidation — workforce (A3) and project (A5).
 *
 * Closes `M2-FE-010`.
 *
 * ## Why this is a separate module from `keys.ts`
 *
 * `keys.ts` carries a standing rule: *keys exist only for endpoints published in
 * `contracts/openapi/v1.yaml`*. That rule is what makes it trustworthy — reading
 * it tells you what the server can actually answer. No M2 endpoint is published
 * yet (`M2-BE-013` is unstarted), so folding these in would break the rule on its
 * first use and quietly turn the factory into a wish list.
 *
 * They live here instead, derived from two approved sources rather than guessed:
 * the state machines in `Django_Next.js_Plan/M2/07-state-machines-and-permissions.md`
 * and the reads requested in `contracts/proposals/0012-m2-capability-and-requirement-surface.md`.
 *
 * **No query may use a key from this module until its endpoint is published.**
 * When the contract lands, `m2QueryKeys` folds into `queryKeys.m2` and this note
 * goes away — a one-line change, and deliberately so.
 *
 * ## Naming follows the lifecycle, not the archetype
 *
 * There is no `workforce` or `project` branch anywhere below. A3 and A5 run on
 * one Engagement + EngagementStage spine (ADR-0007), and a cache split by
 * archetype would be the first step back towards the two parallel subsystems the
 * audit removed. The archetype is a field on the record, not a key segment.
 */

import type { QueryClient } from "@tanstack/react-query";

import {
  EXPIRING_STATE,
  SESSION_STATE,
  STATIC_CONTENT,
  VOLATILE_STATE,
  type FreshnessTier,
} from "./freshness";
import { queryKeys } from "./keys";

export const m2QueryKeys = {
  all: ["m2"] as const,

  /**
   * The Partner's authorized workspaces: `{workspace_key, actions[]}`.
   *
   * Beside the requirement domains rather than inside them, because it answers a
   * question about the *person*, not about any one record — the navigation is
   * built from it before a requirement has been read at all.
   *
   * Not nested under `queryKeys.session` either: Django re-grants roles on every
   * login, while a capability is approved once and can be suspended
   * independently. A session refetch must not be able to discard the answer to
   * "what am I approved to do", and a suspension must not require a re-login to
   * take effect on screen.
   */
  workspace: {
    all: ["m2", "workspace"] as const,
    grants: () => [...m2QueryKeys.workspace.all, "grants"] as const,
  },

  /**
   * The Customer's own requirements — free, and the root of everything else.
   *
   * `list()` is `My requests`; `detail(id)` is one request's own state. The
   * timeline is a child rather than part of the detail because it grows on its
   * own schedule: a vendor question arriving must be able to refresh the
   * timeline without discarding a requirement the Customer is mid-edit on.
   */
  requirements: {
    all: ["m2", "requirements"] as const,
    list: () => [...m2QueryKeys.requirements.all, "list"] as const,
    detail: (requirementId: string) =>
      [...m2QueryKeys.requirements.all, "detail", requirementId] as const,
    timeline: (requirementId: string) =>
      [...m2QueryKeys.requirements.detail(requirementId), "timeline"] as const,
    /**
     * Probable duplicates for a draft, keyed by the inputs that decide the answer.
     *
     * Customer, address, date and variant are what `M2-BE-206` matches on, so
     * all of them belong in the key: omitting the date would offer a merge with
     * last month's request.
     *
     * The three slots were named `serviceBy`/`categorySlug` before the endpoint
     * published. `GET /requirements/duplicate-check/` in fact matches on
     * `address_id`, `requested_start` (a date-*time*, within ±3 days) and
     * `variant_id`, so the cache was always keyed on the right three inputs
     * under two wrong labels. Renamed at the wave gate per the §7 request —
     * a key whose labels lie about what it caches is a trap for the next reader.
     */
    duplicates: (input: { addressId: string; requestedStart: string; variantId: string }) =>
      [...m2QueryKeys.requirements.all, "duplicates", input] as const,
  },

  /**
   * The Partner's invitation inbox and one invitation's detail.
   *
   * Deliberately *not* under `requirements`. A Partner and a Customer read
   * different projections of one requirement — the Partner sees a
   * `RequirementSnapshot` frozen at invitation, the Customer sees the live
   * record — and one shared key would let the Customer's answer render on the
   * Partner's screen, which is the cache-level version of the field leak the
   * separate serializers exist to prevent.
   *
   * The bucket is in the list key because "what must I answer today" and "what
   * did I decline" are different questions.
   */
  invitations: {
    all: ["m2", "invitations"] as const,
    list: (bucket: string) => [...m2QueryKeys.invitations.all, "list", bucket] as const,
    detail: (invitationId: string) =>
      [...m2QueryKeys.invitations.all, "detail", invitationId] as const,
  },

  /**
   * A3 crew offers (revision 4, ADR-0009) — a **bucket of the invitation inbox**,
   * not a namespace of its own.
   *
   * Landed at Gate 1 on Session B's §7 request, and deliberately promoted as an
   * alias rather than as a new root. 07 §2 defines a crew offer as an invitation,
   * and Session B built it that way on purpose: because the key stays under
   * `invitations.all`, every existing rule that clears the inbox clears crew
   * offers by prefix — which is what keeps an A5 capacity hold correctly dropping
   * the A3 offers that vendor can no longer serve. A separate `["m2",
   * "crew-offers"]` root would silently break that, and the breakage would look
   * like a vendor being offered work they are already booked against.
   *
   * The point of promoting it is the name, not the shape: a key composed at a
   * call site is a key nobody can check the invalidation of.
   */
  crewOffers: {
    inbox: () => m2QueryKeys.invitations.list("crew-offers"),
    detail: (invitationId: string) => m2QueryKeys.invitations.detail(invitationId),
  },

  /**
   * The in-app notification feed, published at contract 1.34.0.
   *
   * A root of its own rather than a branch of anything, because a feed is the
   * one read in M2 that is not about a single aggregate — one page can carry a
   * crew offer, a stage review and a cancellation at once. Hanging it under
   * `requirements` or `engagements` would mean every requirement invalidation
   * also refetched a list that has nothing to do with that requirement.
   *
   * `unreadCount` is separate from `feed` because they are polled on completely
   * different rhythms: the badge is live on every screen, the list is read when
   * somebody opens the panel. One key for both would make the cheap read pay
   * the expensive read's cost.
   */
  notifications: {
    all: ["m2", "notifications"] as const,
    feed: () => [...m2QueryKeys.notifications.all, "feed"] as const,
    unreadCount: () => [...m2QueryKeys.notifications.all, "unread-count"] as const,
  },

  /**
   * Proposals, from both sides.
   *
   * `mine(requirementId)` is the Partner's own submission history for one
   * requirement — append-only, so superseded rows stay readable and the list is
   * the record rather than a cache of the latest.
   *
   * `teasers` and `unlocked` are the Customer's two views of the same set, and
   * they are separate keys on purpose: a teaser carries a price band and a
   * verification badge, an unlocked quote carries scope, identity and totals.
   * One key for both is how a client ends up holding vendor identity it has not
   * paid to see, and rendering it from cache after the unlock is refunded.
   */
  proposals: {
    all: ["m2", "proposals"] as const,
    mine: (requirementId: string) =>
      [...m2QueryKeys.proposals.all, "mine", requirementId] as const,
    teasers: (requirementId: string) =>
      [...m2QueryKeys.proposals.all, "teasers", requirementId] as const,
    unlocked: (requirementId: string) =>
      [...m2QueryKeys.proposals.all, "unlocked", requirementId] as const,
    detail: (proposalId: string) => [...m2QueryKeys.proposals.all, "detail", proposalId] as const,
  },

  /**
   * The INR 149 unlock for one requirement.
   *
   * Keyed by requirement, not by unlock id: there is at most one unlock per
   * requirement, and after a lost payment redirect the client may hold no unlock
   * id at all — it has only the requirement it came from. Keying by an id the
   * recovery path cannot produce is how a paid customer ends up unable to find
   * what they bought.
   *
   * Payment attempts themselves stay on `queryKeys.payment`. The unlock is a
   * grant; the attempt is the money. They settle at different moments and a
   * grant refetch must not discard the attempt that is still resolving.
   */
  unlock: {
    all: ["m2", "unlock"] as const,
    forRequirement: (requirementId: string) =>
      [...m2QueryKeys.unlock.all, "requirement", requirementId] as const,
  },

  /**
   * The A3 rate-card booking and its booking fee (revision 4, ADR-0009).
   *
   * Landed at Gate 1 on Session A's §7 request, nested under
   * `requirements.detail` exactly as it was composed at the call site — the
   * promotion buys the name, not a new shape.
   *
   * **Keyed by requirement**, for the reason `unlock` and `visits.plan` give:
   * a Customer coming back from a lost UPI redirect holds a requirement id and
   * nothing else, and keying a purchase by an id the recovery path cannot
   * produce is how somebody who has paid ends up unable to find what they
   * bought.
   *
   * It is nested rather than rooted — unlike those two — because the rate-card
   * state is a *projection of the requirement* (the published rate, the cascade's
   * progress, the fee's phase) rather than a grant sold against it. Nesting means
   * `requirementScope` already clears it, so the cascade cannot go on showing
   * "still looking for a crew" after the requirement itself has moved on.
   */
  rateCard: {
    state: (requirementId: string) =>
      [...m2QueryKeys.requirements.detail(requirementId), "rate-card"] as const,
  },

  /**
   * The A5 visit plan, its slots and the grid a vendor books one from.
   *
   * Added at the Wave I gate on both frontend columns' §7 request — Session A
   * had nested the plan read under `requirements.detail` and Session B was
   * composing slot keys locally, which meant the two halves of one aggregate
   * were being invalidated by different rules.
   *
   * **`plan` is keyed by requirement**, exactly as `unlock` is and for the same
   * reason: there is at most one plan per requirement, and a customer returning
   * from a lost payment redirect holds a requirement id and nothing else. Keying
   * a purchase by an id the recovery path cannot produce is how somebody who has
   * paid ends up unable to find what they bought.
   *
   * **`slots` is keyed by invitation, and it is deliberately not nested under
   * the plan.** The grid belongs to one vendor's diary, not to the customer's
   * purchase: two vendors invited to the same plan see different grids, and a
   * plan-wide refetch must not reach into a competitor's slot cache. It also
   * expires on its own clock — every slot `id` is a signed token with a TTL, so
   * this is the one M2 read where a stale cache hands back a credential the
   * server will refuse.
   *
   * `visit` hangs off nothing: a site visit is addressable on its own routes
   * (arrival, completion, no-show), and those act on one visit without saying
   * anything about its siblings under the same plan.
   */
  visits: {
    all: ["m2", "visits"] as const,
    plan: (requirementId: string) =>
      [...m2QueryKeys.visits.all, "plan", requirementId] as const,
    slots: (invitationId: string) =>
      [...m2QueryKeys.visits.all, "slots", invitationId] as const,
    visit: (siteVisitId: string) =>
      [...m2QueryKeys.visits.all, "visit", siteVisitId] as const,
  },

  /**
   * Engagements and their stages — one spine, both archetypes.
   *
   * `stages()` is nested under the engagement because a stage never outlives it:
   * a cancelled engagement's stages are gone with it, and an engagement-wide
   * refetch has to be able to reach every one of them. The reverse does not
   * hold — approving one stage says nothing about its siblings, so
   * `stage(id)` invalidates only itself.
   *
   * `attendance` hangs off the stage rather than the engagement because A3 maps
   * a stage to a single shift-day. Today's `n of m` must not be able to
   * invalidate yesterday's settled count.
   */
  engagements: {
    all: ["m2", "engagements"] as const,
    list: (bucket: string) => [...m2QueryKeys.engagements.all, "list", bucket] as const,
    detail: (engagementId: string) =>
      [...m2QueryKeys.engagements.all, "detail", engagementId] as const,
    stages: (engagementId: string) =>
      [...m2QueryKeys.engagements.detail(engagementId), "stages"] as const,
    stage: (engagementId: string, stageId: string) =>
      [...m2QueryKeys.engagements.stages(engagementId), stageId] as const,
    attendance: (engagementId: string, stageId: string) =>
      [...m2QueryKeys.engagements.stage(engagementId, stageId), "attendance"] as const,
    /**
     * The immutable agreement — the frozen terms, versioned.
     *
     * It used to be documented as "the agreement **and its amendment history**",
     * and Session A's Wave A3 mounted the amendment list on it for exactly that
     * reason. The two were split at the Wave II gate on Session A's own §7 row:
     * they have opposite freshness. The agreement is written once and never
     * changes, which is what earns it `SESSION_STATE`; a **proposed** amendment
     * is a live change request with a deadline and a charge on it, and serving
     * one from a session-long cache is how a customer approves a delta that
     * expired an hour ago.
     */
    agreement: (engagementId: string) =>
      [...m2QueryKeys.engagements.detail(engagementId), "agreement"] as const,
    /** Proposed and accepted amendments. Live, deadlined — see `agreement` above. */
    amendments: (engagementId: string) =>
      [...m2QueryKeys.engagements.detail(engagementId), "amendments"] as const,
    /**
     * `GET /engagements/{id}/events/` — the transition record.
     *
     * Composed locally as `detail(id) + "events"` since Wave A3, which was
     * correct by construction and unreviewable: a key nobody can find in this
     * file is a key nobody can check the invalidation of. Promoted here on
     * Session A's §7 request. Still nested under the detail, so every existing
     * engagement invalidation clears it by prefix — the point of promoting it is
     * the name, not the shape.
     */
    events: (engagementId: string) =>
      [...m2QueryKeys.engagements.detail(engagementId), "events"] as const,
    /**
     * `GET /engagements/{id}/safety-incidents/` — read by **both** parties.
     *
     * Promoted at Gate 3 on Session B's request, for the reason that promoted
     * `events` above: composed at the call site it was correct by construction
     * and unreviewable, and a key nobody can find here is a key nobody can
     * check the invalidation of.
     *
     * The request argued it was "one key two columns compose independently".
     * That half is **not true today** and the correction is worth keeping:
     * Session A grepped its whole app at the Gate 3 re-point and found no
     * safety-incident read anywhere in it — `M2-FE-515` is a write-only cash
     * demand that posts and reads nothing. Only the Partner reads this list.
     * The key stays promoted on the naming argument alone, and is here for
     * whoever builds the Customer's incident list later.
     *
     * Nested under the detail, so `report_safety_incident`'s `stageScope`
     * already clears it by prefix. The promotion buys the name, not the shape.
     */
    safetyIncidents: (engagementId: string) =>
      [...m2QueryKeys.engagements.detail(engagementId), "safety-incidents"] as const,
    /**
     * The A5 project plan — milestones, retention, delay claims, the transfer.
     *
     * Promoted at Gate 4 on Session A's request, keyed by **engagement** and
     * nested under its detail, on the `rateCard` and `shiftDays` precedents.
     *
     * The nesting is load-bearing rather than tidy: accepting a transfer moves
     * the **engagement itself** back to `PENDING_START`, so a project cache the
     * engagement's own invalidations could not reach would survive the very
     * event that invalidates it.
     */
    project: (engagementId: string) =>
      [...m2QueryKeys.engagements.detail(engagementId), "project"] as const,
  },

  /**
   * The Operations reads published at 1.32.0 — **one namespace, both columns.**
   *
   * Promoted at Gate 5 on two §7 requests that arrived independently, and the
   * fold was not optional. Session B's recovery commands (`rematch`,
   * `extend_deadline`, `reclassify`) each answer with the refreshed
   * `RequestTimeline` and write it straight into the cache with `setQueryData`
   * rather than invalidating — deliberately, because a refetch races the cascade
   * the command just advanced. Session A's money screen reads the same endpoint.
   * Two keys for one endpoint meant a rematch would refresh one copy and leave
   * the other stale **on the screen where somebody decides who keeps the money.**
   * `touchMetric` had the identical shape and the identical risk.
   *
   * Rooted at `queryKeys.operations.all` rather than at `["m2"]`, exactly as both
   * columns built it: a broad Operations invalidation still reaches these, and
   * the M1 case cache is **shared rather than forked** — the case list and detail
   * hooks come from `features/cases/queries.ts`, so there is one cache of one
   * case, not an M1 copy and an M2 copy that can disagree.
   */
  operations: {
    all: [...queryKeys.operations.all, "m2"] as const,
    /** The read a money decision is made from; carries live case and fee state. */
    requestTimeline: (requirementId: string) =>
      [...m2QueryKeys.operations.all, "timeline", requirementId] as const,
    touchMetric: (requirementId: string) =>
      [...m2QueryKeys.operations.all, "touch-metric", requirementId] as const,
    /** The 30-day trend. Session A's surface; Session B deliberately dropped it. */
    touchRollup: () => [...m2QueryKeys.operations.all, "touch-rollup"] as const,
    queues: () => [...m2QueryKeys.operations.all, "queues"] as const,
    rateCards: (serviceArea: string) =>
      [...m2QueryKeys.operations.all, "rate-cards", serviceArea] as const,
    crewVerification: (partnerId: string) =>
      [...m2QueryKeys.operations.all, "crew-verification", partnerId] as const,
    reconciliation: () => [...m2QueryKeys.operations.all, "reconciliation"] as const,
  },

  /**
   * One A3 shift-day — crew, attendance and settlement in a single read.
   *
   * Landed at Gate 1 on the backend column's §7 request, once 1.30.0 published
   * ten shift-day paths that all hang off a **stage id**.
   *
   * One key per stage, not one per concern, because the server answers all three
   * in one call: splitting the key would mean three cache entries that can
   * disagree about the same day, and "4 of 4 present" rendering beside an unpaid
   * settlement is precisely the disagreement that matters.
   *
   * Nested under `engagements.stage`, so every engagement-level *and* stage-level
   * invalidation already reaches it. Note this is the one namespace where the
   * nesting is load-bearing in both directions: yesterday's settled count must
   * not be reachable by today's `n of m`, which is why it hangs off the stage and
   * not off the engagement.
   */
  shiftDays: {
    forStage: (engagementId: string, stageId: string) =>
      [...m2QueryKeys.engagements.stage(engagementId, stageId), "shift-day"] as const,
  },
} as const;

/* ---------------------------------------------------------------------------
   Freshness
   --------------------------------------------------------------------------- */

/**
 * Which freshness tier each M2 read takes.
 *
 * Reusing the M1 tiers rather than inventing M2 ones: the question "may this be
 * served stale" has the same three answers here it has everywhere, and a fourth
 * set of thresholds would drift from the first.
 *
 * The judgement worth recording is which reads are `EXPIRING_STATE`. An
 * invitation, an unlock and a proposal all carry a deadline the server enforces,
 * and rendering an expired one as actionable is not a stale screen — it is an
 * invitation to click something that will be refused. Requirements and
 * agreements have no such clock and sit a tier down.
 */
export const M2_FRESHNESS = {
  /** Approved capabilities. Changes only when Operations acts. */
  workspaceGrants: SESSION_STATE,
  requirementList: VOLATILE_STATE,
  requirementDetail: VOLATILE_STATE,
  /** Carries the SLA deadline and the matching state behind it. */
  requirementTimeline: EXPIRING_STATE,
  duplicates: VOLATILE_STATE,
  /** Response deadline and slot ownership both expire server-side. */
  invitationList: EXPIRING_STATE,
  invitationDetail: EXPIRING_STATE,
  /** Validity elapses; a quote shown after it is a price nobody stands behind. */
  proposals: EXPIRING_STATE,
  /** Payment in flight, then a grant that can be refunded out from under it. */
  unlock: EXPIRING_STATE,
  /** Shares settle and refund on server clocks the customer cannot see. */
  visitPlan: EXPIRING_STATE,
  /**
   * The unread badge. `VOLATILE_STATE` rather than `EXPIRING_STATE`: nothing
   * about a count expires server-side, so refetching on focus and treating it
   * as immediately stale is enough, and the tighter tier would only shorten the
   * cache window on a read that every authenticated screen holds open.
   */
  notificationCount: VOLATILE_STATE,
  /** Read when the panel opens, so focus refetch matters more than a short gc. */
  notificationFeed: VOLATILE_STATE,
  /**
   * The strictest tier in the table, and the only read where staleness hands
   * back a **credential**: every slot `id` is a signed token with a TTL, so a
   * cached grid does not merely look wrong, it offers times the server will
   * refuse to book.
   */
  visitSlots: EXPIRING_STATE,
  engagementList: VOLATILE_STATE,
  engagementDetail: VOLATILE_STATE,
  /** Review timeouts auto-approve; the clock is the point. */
  stage: EXPIRING_STATE,
  attendance: EXPIRING_STATE,
  /** Immutable once written. */
  agreement: SESSION_STATE,
  /**
   * Not `SESSION_STATE`, and the distinction from `agreement` above is the whole
   * reason this row exists: a proposed amendment carries a deadline and a money
   * delta, and both parties act on it from two devices.
   */
  amendments: EXPIRING_STATE,
  /** Transitions land whenever the other party or a sweep acts. */
  engagementEvents: VOLATILE_STATE,
  /**
   * The A5 project plan. `EXPIRING_STATE` for `amendments`' reason, not by
   * borrowing its name: a live transfer proposal and a `SUBMITTED` delay claim
   * both carry a server deadline the Customer acts on, and a delay claim
   * **expires on silence** — serving one from a session-long cache is how
   * somebody watches a window close that closed an hour ago.
   */
  project: EXPIRING_STATE,

  /* Operations, 1.32.0. Tiers copied from the two §7 requests, not re-decided. */

  /** The read a money decision is made from, carrying live case and fee state. */
  operationsTimeline: EXPIRING_STATE,
  /** Every member is already past a deadline. */
  operationsQueues: EXPIRING_STATE,
  /**
   * Read to decide whether a Customer has been paid back. A minute-old "no
   * failed refunds" is a claim about money made from a stale count.
   */
  operationsReconciliation: VOLATILE_STATE,
  operationsTouchMetric: VOLATILE_STATE,
  /**
   * Deliberately the calmest of these: a trend over a server-chosen window that
   * nobody makes a per-request decision from.
   */
  operationsTouchRollup: SESSION_STATE,
  /**
   * The one row worth arguing about, and safe for a reason peculiar to this
   * surface: a rate card is **loaded, never edited**, and every row it holds is
   * immutable — so a stale list is missing a card rather than misstating one.
   * Revising a card publishes a new effective-dated row; it does not mutate this
   * one. If that ever stops being true, this tier is wrong.
   */
  operationsRateCards: STATIC_CONTENT,
} as const satisfies Record<string, FreshnessTier>;

/* ---------------------------------------------------------------------------
   Invalidation
   --------------------------------------------------------------------------- */

/**
 * Every M2 domain command, and what its success makes untrue.
 *
 * One table rather than an `invalidateQueries` call at each mutation site. The
 * M1 lesson is in `keys.ts`: keys built inline are how invalidation silently
 * stops working. The same is true of invalidation itself — a command whose
 * cache effects live at its call site is a command whose effects nobody can
 * review, and the failure mode is a screen that is confidently wrong rather than
 * one that errors.
 *
 * Commands are named exactly as in `07-state-machines-and-permissions.md` §6, so
 * the two can be diffed. A command added there and missing here is a gap this
 * type will not catch — the table is checked by review, not by the compiler.
 *
 * ## Reading a row
 *
 * Each entry takes the ids the command was issued against and returns the key
 * prefixes to invalidate. Prefixes, not exact keys: `requirements.detail(id)`
 * also clears the timeline nested under it, which is what should happen when the
 * requirement itself moved.
 */
export interface M2CommandContext {
  requirementId?: string;
  invitationId?: string;
  proposalId?: string;
  engagementId?: string;
  stageId?: string;
  siteVisitId?: string;
}

type KeyPrefix = readonly unknown[];

export type M2Command =
  | "submit_requirement"
  | "reclassify_requirement"
  | "merge_duplicate_requirement"
  | "accept_invitation"
  | "decline_invitation"
  | "submit_proposal"
  | "supersede_proposal"
  | "withdraw_proposal"
  | "ask_question"
  | "answer_question"
  | "request_site_visit"
  | "schedule_site_visit"
  | "create_unlock_checkout"
  // The A5 visit plan, revision 3. `complete_visit_plan` and
  // `refund_unfilled_visit_shares` are absent on purpose: both are system
  // commands — a verified webhook and a sweep — and no client issues them, so a
  // row here would describe an invalidation that never fires from this side.
  | "choose_visit_plan"
  | "confirm_visit_slot"
  | "create_visit_plan_checkout"
  | "confirm_visit_arrival"
  | "complete_site_visit"
  | "report_visit_no_show"
  // The A3 rate card, revision 4. `complete_booking_fee` is absent for the same
  // reason `complete_visit_plan` is: it is the verified provider callback, and
  // 07 §4c is explicit that the engagement opens on that callback and on nothing
  // a client sends. Session A asked for it; the customer screen resolves the
  // outcome from the aggregate's own state read instead, which is what makes the
  // row unnecessary rather than merely unused. `forfeit_booking_fee` and
  // `refund_booking_fee` ARE here, unlike their visit-plan cousins: Operations
  // issues both by hand from the admin app (Wave C6/B4), so they are client
  // commands with a real caller.
  | "book_at_published_rate"
  | "create_booking_fee_checkout"
  | "forfeit_booking_fee"
  | "refund_booking_fee"
  | "accept_crew_offer"
  | "decline_crew_offer"
  | "request_revalidation"
  | "reject_proposal"
  | "select_proposal"
  | "reconfirm_selection"
  | "fund_stage"
  | "assign_crew"
  | "confirm_attendance"
  | "respond_attendance"
  | "submit_stage_evidence"
  | "approve_stage"
  | "request_correction"
  | "dispute_stage"
  | "propose_amendment"
  | "accept_amendment"
  | "report_safety_incident"
  // A3 workforce fulfilment, Wave C4. `report_safety_incident` above already
  // existed and now has a shift-day scope rather than an engagement one.
  | "confirm_day_settled"
  | "report_cash_demand"
  // Wave B3W's four §7 rows, landed at Gate 3. Each was being invalidated by
  // hand at its call site, which is not a workaround for a broken row but the
  // absence of one — and the point of this table is that every money-moving or
  // state-moving command is reviewable in one place.
  | "start_stage"
  | "confirm_shift_arrival"
  | "report_crew_no_show"
  // A5 projects, Wave C5 — the two commands the Customer can issue.
  | "accept_handover"
  | "decide_project_transfer"
  | "request_cancellation";

const K = m2QueryKeys;

/**
 * The requirement plus everything hanging off it that a state change can move.
 *
 * `visits.plan` joined this at the Wave I gate, and the A5 rejection path is why:
 * a `NON_RESPONSIVE` rejection does not merely close a quote, it sends that
 * vendor's plan **share** back to owing a free replacement visit. A scope that
 * refetched the quotes and left the plan cached would show the customer a
 * settled share against a quote they had just rejected. `reclassify_requirement`
 * moves plan money too (`M2-BE-427`), and `select_proposal` can consume it.
 */
/**
 * One stage's cache, from whatever ids the caller actually holds.
 *
 * A stage route carries a stage id; a list route carries an engagement id;
 * neither reliably carries both. Returning the narrowest reachable prefix rather
 * than demanding the pair is what stops a money-moving command from invalidating
 * nothing — which is exactly what the four rows below did until this existed.
 */
function stageScope(ctx: M2CommandContext): KeyPrefix[] {
  if (ctx.engagementId) {
    // Both ids used to return `engagements.stage(e, s)` alone, and that cleared
    // **nothing any screen reads**. React Query matches by prefix, and the stage
    // key is *deeper* than the detail key — so a command that moved a stage left
    // the engagement detail, its embedded `stages[]` (which is how every stage
    // screen in both apps actually reads a stage) and the list buckets all
    // serving pre-command data. Session B reported it on 2026-08-13 and the
    // backend column hit the same thing building C4's shift-days; only the
    // no-id branch below had been fixed.
    //
    // `detail` covers the stage, attendance and shift-day keys nested under it.
    // `all` covers the sibling list buckets, which move when a stage moves — an
    // engagement leaves "needs you" the moment its last stage is approved.
    // `all` is a prefix of `detail` and so subsumes it today; both are listed
    // because they are here for different reasons, and narrowing one must not
    // silently drop the other.
    //
    // This is deliberately broader than the `attendance` key's doc comment
    // ("today's n of m must not invalidate yesterday's settled count") would
    // suggest. That preference still holds for a *targeted* refetch; it loses to
    // correctness for a command, because the cost of the broad prefix is one
    // refetch and the cost of the narrow one was a settled day that never
    // appeared.
    return [K.engagements.detail(ctx.engagementId), K.engagements.all];
  }
  // No engagement id at all: the stage screens reach the record by stage id
  // alone, so the only prefix guaranteed to contain it is the domain root.
  // Broad, and correct — an unreachable narrow key is worse than a wide one.
  return ctx.stageId ? [K.engagements.all] : [];
}

function requirementScope(requirementId: string): KeyPrefix[] {
  return [
    K.requirements.detail(requirementId),
    K.requirements.list(),
    K.proposals.teasers(requirementId),
    K.proposals.unlocked(requirementId),
    K.visits.plan(requirementId),
  ];
}

export const M2_INVALIDATION: Record<M2Command, (ctx: M2CommandContext) => KeyPrefix[]> = {
  submit_requirement: () => [K.requirements.all],
  // Reclassification changes the inferred lifecycle and voids open invitations,
  // so the Partner side moves too — but the unlock is preserved by design and
  // must not be refetched into a "pay again" state.
  reclassify_requirement: (c) => [
    ...(c.requirementId ? requirementScope(c.requirementId) : [K.requirements.all]),
    K.invitations.all,
  ],
  merge_duplicate_requirement: () => [K.requirements.all],

  // Acceptance takes a capacity hold, which changes what *other* invitations the
  // Partner can still accept — so the whole inbox, not just this row.
  accept_invitation: () => [K.invitations.all],
  decline_invitation: () => [K.invitations.all],

  submit_proposal: (c) => [
    ...(c.requirementId ? [K.proposals.mine(c.requirementId)] : [K.proposals.all]),
    K.invitations.all,
  ],
  supersede_proposal: (c) =>
    c.requirementId ? [K.proposals.mine(c.requirementId)] : [K.proposals.all],
  withdraw_proposal: (c) =>
    c.requirementId ? [K.proposals.mine(c.requirementId)] : [K.proposals.all],

  // A question or an answer is a timeline event and nothing else. Invalidating
  // the requirement detail here would refetch the whole record on every message.
  //
  // Both rows return the **caller's own** projection of one conversation, which
  // is why each names two keys rather than one. Until 1.26.0 clarification ran
  // one way — the vendor asked, the Customer answered — so `requirements.timeline`
  // was the only surface either command could move, and the Partner app issued
  // neither. Two-way clarification made `answer_question` a command **both**
  // columns send, and the Partner app mounts no requirement timeline: the row
  // was invalidating a key that app has never held. A Partner therefore answered
  // a Customer's question and watched the row keep saying it was unanswered.
  //
  // The fix is to key off the ids the caller actually holds, on `stageScope`'s
  // precedent. The counterparty is deliberately NOT invalidated: one client
  // cannot reach the other's cache, and each side learns through its own read.
  ask_question: (c) => [
    ...(c.requirementId ? [K.requirements.timeline(c.requirementId)] : []),
    ...(c.invitationId ? [K.invitations.detail(c.invitationId)] : []),
  ],
  answer_question: (c) => [
    ...(c.requirementId ? [K.requirements.timeline(c.requirementId)] : []),
    ...(c.invitationId ? [K.invitations.detail(c.invitationId)] : []),
  ],
  request_site_visit: (c) => (c.requirementId ? [K.requirements.timeline(c.requirementId)] : []),
  schedule_site_visit: (c) => (c.requirementId ? [K.requirements.timeline(c.requirementId)] : []),

  // The checkout is created but nothing is granted yet. Only the unlock record
  // moves; the teasers stay teasers until a verified callback says otherwise.
  create_unlock_checkout: (c) => (c.requirementId ? [K.unlock.forRequirement(c.requirementId)] : []),

  // The A3 rate card, revision 4. `rateCard.state` is nested under
  // `requirements.detail`, so `requirementScope` reaches it without naming it.
  //
  // Booking at the published rate moves the requirement itself — it leaves
  // capture and enters the cascade — and it is the moment the quote flow stops
  // being the A3 front door for this request, so the teaser and unlock reads in
  // `requirementScope` have to move with it or the fallback surface goes on
  // offering itself underneath a booking that already happened.
  book_at_published_rate: (c) => (c.requirementId ? requirementScope(c.requirementId) : []),

  // Only the fee record moves, on `create_unlock_checkout`'s precedent above:
  // starting a checkout grants nothing, and the engagement opens on the verified
  // callback rather than on this.
  create_booking_fee_checkout: (c) => (c.requirementId ? [K.rateCard.state(c.requirementId)] : []),

  // Both are terminal money outcomes issued by Operations, and both can land on a
  // booking whose engagement never opened (a customer no-show forfeits before any
  // crew arrives), so neither may assume an engagement id. `engagements.all` is
  // added when there is one: a refund re-dispatches, which moves the vendor's
  // list as well as this customer's booking.
  forfeit_booking_fee: (c) => [
    ...(c.requirementId ? requirementScope(c.requirementId) : []),
    ...(c.engagementId ? [K.engagements.all] : []),
  ],
  refund_booking_fee: (c) => [
    ...(c.requirementId ? requirementScope(c.requirementId) : []),
    ...(c.engagementId ? [K.engagements.all] : []),
  ],

  // A crew offer IS an invitation (07 §2), so these specialise
  // `accept_invitation` / `decline_invitation` and clear the whole inbox for the
  // same reason: first accept wins, so every other offer this lead is holding may
  // have moved too. Note the consequence Session B had to design around — the
  // server filters the inbox to INVITED, so accepting removes the card that
  // issued the command. The answer has to be held above the list, not inside it.
  accept_crew_offer: () => [K.invitations.all],
  decline_crew_offer: () => [K.invitations.all],

  // Choosing charges nothing and bounds the invitation wave, so the plan moves
  // and the requirement's own read moves with it — `submit_requirement` refuses
  // an A5 requirement without a plan, so the Send button's enabled state is a
  // function of this command.
  choose_visit_plan: (c) =>
    c.requirementId
      ? [K.visits.plan(c.requirementId), K.requirements.detail(c.requirementId)]
      : [],

  // The vendor's side of the same fact, and the one row that moves BOTH columns.
  // It takes a quote slot (so the whole inbox moves, exactly as `accept_invitation`
  // does), consumes a plan share, and its own grid is now a slot short. The
  // customer's plan read is deliberately NOT invalidated from here — a vendor's
  // client cannot reach it, and the customer learns through their own poll.
  confirm_visit_slot: (c) => [
    K.invitations.all,
    ...(c.invitationId ? [K.visits.slots(c.invitationId)] : []),
  ],

  // Same shape as `create_unlock_checkout`: an attempt exists, nothing is
  // granted. The plan hardens only on the verified callback.
  create_visit_plan_checkout: (c) => (c.requirementId ? [K.visits.plan(c.requirementId)] : []),

  // Arrival, completion and a no-show all move one visit. Completion
  // additionally opens the estimate window, which the plan read carries per
  // share — so when the caller knows the requirement, refetch the plan too.
  confirm_visit_arrival: (c) => (c.siteVisitId ? [K.visits.visit(c.siteVisitId)] : []),
  complete_site_visit: (c) => [
    ...(c.siteVisitId ? [K.visits.visit(c.siteVisitId)] : []),
    ...(c.requirementId ? [K.visits.plan(c.requirementId)] : []),
  ],
  // A no-show settles a share — refunded, or owed a free replacement — so the
  // money on the plan read changes, not only the visit's status.
  report_visit_no_show: (c) => [
    ...(c.siteVisitId ? [K.visits.visit(c.siteVisitId)] : []),
    ...(c.requirementId ? [K.visits.plan(c.requirementId)] : []),
  ],

  // Re-validation stamps the request on the proposal and charges nothing. The
  // vendor answers by superseding, which is a separate command — so only the
  // quote list moves here, and the unlock or plan is deliberately untouched.
  request_revalidation: (c) =>
    c.requirementId ? [K.proposals.unlocked(c.requirementId)] : [K.proposals.all],

  // A non-responsive rejection releases a slot and triggers a replacement, so
  // the teaser list changes shape, not just one row's status.
  reject_proposal: (c) => (c.requirementId ? requirementScope(c.requirementId) : []),
  select_proposal: (c) => (c.requirementId ? requirementScope(c.requirementId) : []),
  // Reconfirmation is what turns a selection into an engagement, so both the
  // requirement and the engagement list move.
  reconfirm_selection: (c) => [
    ...(c.requirementId ? requirementScope(c.requirementId) : []),
    K.engagements.all,
  ],

  fund_stage: (c) =>
    c.engagementId ? [K.engagements.detail(c.engagementId), K.engagements.list("active")] : [],

  // These four were no-ops until the Wave II gate, and the reason is worth
  // keeping: they returned `engagements.stage(engagementId, stageId)` — a key
  // **deeper than anything either app mounts**. A stage route carries a stage id
  // and nothing else, so `engagementId` was absent, the guard fell through to
  // `[]`, and a command that moves money invalidated nothing at all. Session B
  // found it by noticing its own hook could not compose the key.
  //
  // The fix is to fall back rather than to flatten the key. `engagements.stage`
  // stays nested — a cancelled engagement's stages go with it, and an
  // engagement-wide refetch must still reach every one — but when the caller
  // cannot name the engagement, invalidating the detail is both correct and
  // reachable, because every stage read hangs beneath it.
  assign_crew: (c) => stageScope(c),
  confirm_attendance: (c) => stageScope(c),
  respond_attendance: (c) => stageScope(c),
  submit_stage_evidence: (c) => stageScope(c),
  // Approval releases money, which moves the engagement's own totals as well as
  // the stage — and the Partner's list, since the stage leaves their queue.
  approve_stage: (c) => (c.engagementId ? [K.engagements.detail(c.engagementId)] : []),
  request_correction: (c) => (c.engagementId ? [K.engagements.detail(c.engagementId)] : []),
  dispute_stage: (c) => (c.engagementId ? [K.engagements.detail(c.engagementId)] : []),

  // Amendments change the agreement, which every stage total reconciles to.
  propose_amendment: (c) => (c.engagementId ? [K.engagements.detail(c.engagementId)] : []),
  accept_amendment: (c) => (c.engagementId ? [K.engagements.detail(c.engagementId)] : []),

  // A safety incident is never a cancellation and never changes scope or money.
  // It is a timeline record, and invalidating the engagement here would imply
  // the work itself moved.
  // Re-scoped at Gate 1 on the backend column's request. A safety incident is
  // reported against a shift-day, not against the engagement as a whole, and
  // `stageScope` now reaches the engagement anyway — so this keeps the stage
  // context when the caller has it and loses nothing when it does not. It stays
  // a first-class record and never a cancellation reason: nothing here touches
  // `request_cancellation`'s scope.
  report_safety_incident: (c) => stageScope(c),

  // A3 workforce fulfilment, Wave C4. Both are shift-day facts.
  //
  // `confirm_day_settled` is the evening tap. It moves no money — the platform
  // never holds wages — but it does move what the other side sees, and both
  // sides read the day through the engagement's stages, so the stage scope is
  // the whole of it.
  //
  // `report_cash_demand` invalidates the same scope and deliberately nothing on
  // the vendor's standing: a Customer's client cannot read a vendor's standing
  // record, and inventing a prefix for it here would describe an invalidation
  // that fires into an empty cache.
  confirm_day_settled: (c) => stageScope(c),
  report_cash_demand: (c) => stageScope(c),

  // Wave B3W's rows, landed at Gate 3.
  //
  // `start_stage` is the plain stage scope — the same prefix its hand-written
  // invalidation already used, so the two could not have drifted meanwhile.
  //
  // `confirm_shift_arrival` shipped at Gate 3 with `rateCard.state` bolted on,
  // reasoning that arrival earns the booking fee so "both sides should refetch".
  // **Reverted at Gate 4: that half could never fire.** Arrival is a vendor-only
  // command, the Partner app mounts no `rateCard` read, and the rule this file
  // already states on `ask_question` is the general case — one client cannot
  // reach the other's cache, and each side learns through its own read. Session
  // B declined to supply the requirement id for exactly that reason and was
  // right to. A prefix that clears nothing reads as intent and misleads the next
  // person, which is worse than the omission it was trying to fix.
  start_stage: (c) => stageScope(c),
  confirm_shift_arrival: (c) => stageScope(c),

  // The A3 twin of `report_visit_no_show`, and it settles the booking fee the
  // same way that one settles a visit share — forfeited and split, or refunded
  // with a free re-dispatch. So it moves the requirement's own money read, not
  // just the vendor's list. The asymmetry with the A5 row was bookkeeping, not
  // design. The Partner app holds no requirement-scoped cache and reaches only
  // `engagements.all`; both prefixes are listed because each app can supply a
  // different half of the context.
  // Note for anyone swapping a hand-written call for this row: `requirementScope`
  // contains **no engagements prefix**, so with a requirement id alone this
  // returns nothing the Partner app mounts. Session B caught that at Gate 3 and
  // threaded both ids through rather than dropping the vendor's booking list.
  report_crew_no_show: (c) => [
    ...(c.requirementId ? requirementScope(c.requirementId) : []),
    ...(c.engagementId ? [K.engagements.all] : []),
  ],

  // A5 projects. Both are the Customer's, and both move the engagement itself —
  // accepting a handover advances it toward `COMPLETED`, and accepting a
  // transfer sends it back to `PENDING_START` with every transferable milestone
  // refunded, dropped to `REQUIRED` and repriced. `stageScope` reaches the
  // engagement detail (and so `engagements.project`, nested under it) plus the
  // lists, which is the whole of what either one moves.
  accept_handover: (c) => stageScope(c),
  decide_project_transfer: (c) => stageScope(c),

  request_cancellation: (c) => (c.engagementId ? [K.engagements.all] : []),
};

/**
 * Applies a command's invalidation.
 *
 * Call after the mutation resolves, never optimistically: an M2 command can be
 * refused for a reason the client cannot predict (slot exhausted, capability
 * suspended, wage floor), and discarding cache on a refusal shows the user a
 * loading state on the way to the same screen they were already on.
 */
export function invalidateForM2Command(
  client: QueryClient,
  command: M2Command,
  context: M2CommandContext = {},
): Promise<void> {
  const prefixes = M2_INVALIDATION[command](context);
  return Promise.all(
    prefixes.map((queryKey) => client.invalidateQueries({ queryKey })),
  ).then(() => undefined);
}
