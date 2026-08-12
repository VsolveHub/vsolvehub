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

import { EXPIRING_STATE, SESSION_STATE, VOLATILE_STATE, type FreshnessTier } from "./freshness";

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
    /** The immutable agreement and its amendment history, readable by both parties. */
    agreement: (engagementId: string) =>
      [...m2QueryKeys.engagements.detail(engagementId), "agreement"] as const,
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
  engagementList: VOLATILE_STATE,
  engagementDetail: VOLATILE_STATE,
  /** Review timeouts auto-approve; the clock is the point. */
  stage: EXPIRING_STATE,
  attendance: EXPIRING_STATE,
  /** Immutable once written. */
  agreement: SESSION_STATE,
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
  | "request_cancellation";

const K = m2QueryKeys;

/** The requirement plus everything hanging off it that a state change can move. */
function requirementScope(requirementId: string): KeyPrefix[] {
  return [
    K.requirements.detail(requirementId),
    K.requirements.list(),
    K.proposals.teasers(requirementId),
    K.proposals.unlocked(requirementId),
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
  ask_question: (c) => (c.requirementId ? [K.requirements.timeline(c.requirementId)] : []),
  answer_question: (c) => (c.requirementId ? [K.requirements.timeline(c.requirementId)] : []),
  request_site_visit: (c) => (c.requirementId ? [K.requirements.timeline(c.requirementId)] : []),
  schedule_site_visit: (c) => (c.requirementId ? [K.requirements.timeline(c.requirementId)] : []),

  // The checkout is created but nothing is granted yet. Only the unlock record
  // moves; the teasers stay teasers until a verified callback says otherwise.
  create_unlock_checkout: (c) => (c.requirementId ? [K.unlock.forRequirement(c.requirementId)] : []),

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
  assign_crew: (c) =>
    c.engagementId && c.stageId ? [K.engagements.stage(c.engagementId, c.stageId)] : [],
  confirm_attendance: (c) =>
    c.engagementId && c.stageId ? [K.engagements.stage(c.engagementId, c.stageId)] : [],
  respond_attendance: (c) =>
    c.engagementId && c.stageId ? [K.engagements.stage(c.engagementId, c.stageId)] : [],
  submit_stage_evidence: (c) =>
    c.engagementId && c.stageId ? [K.engagements.stage(c.engagementId, c.stageId)] : [],
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
  report_safety_incident: (c) => (c.engagementId ? [K.engagements.detail(c.engagementId)] : []),
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
