import type { Schemas } from "@vsolve/api-client";

import { isUuid } from "@/features/shared/identifiers";

/**
 * What an Operations actor may do to a compatibility rule, and who may do it.
 *
 * ## Maker-checker is a property of the rule, not a permission
 *
 * A rule is proposed by one person and reviewed by another. Django enforces it
 * twice — `_validate_activation` refuses `created_by_id == actor.id`, and the
 * `carts_compatibility_maker_checker` database constraint refuses the row even
 * if the service is bypassed — and this module makes the console agree.
 *
 * The affordance is **absent**, not disabled. A disabled Approve button still
 * tells the proposer that approving is a thing they nearly did, and invites a
 * second attempt through a refresh or a stale tab. Separation of duties is not a
 * validation message; it is a decision that was never theirs to take.
 *
 * ## Retire is deliberately not gated
 *
 * `retire_compatibility_rule` performs no maker-checker check, and that is
 * correct rather than an oversight: a rule can only be retired once it is
 * ACTIVE, and it can only have become ACTIVE by a second person activating it.
 * The separation already happened. Hiding Retire from the proposer here would
 * make the console refuse something the server permits, which strands a rule
 * nobody can withdraw.
 *
 * ## Unknown actor means no actions
 *
 * When the signed-in user is not known yet, every reviewing action is withheld.
 * Failing closed costs a reviewer one render; failing open shows the proposer
 * their own Approve button.
 */

type Rule = Schemas["CompatibilityRule"];
type LifecycleStatus = Schemas["LifecycleStatusEnum"];

/** Django's `min_length=10, max_length=500` on every reason field. */
export const REASON_MIN_LENGTH = 10;
export const REASON_MAX_LENGTH = 500;

export type RuleCommand = "activate" | "reject" | "retire";

export interface RuleAction {
  command: RuleCommand;
  label: string;
  /** What changes in the world, so nobody presses this to find out. */
  consequence: string;
  /**
   * Whether this command may only be taken by someone other than the proposer.
   *
   * The maker-checker gate. Actions carrying it are removed for the proposer
   * rather than shown refused.
   */
  requiresSecondPerson: boolean;
  tone: "primary" | "neutral" | "danger";
}

const ACTIVATE: RuleAction = {
  command: "activate",
  label: "Activate",
  consequence:
    "The rule starts governing how these two services may be booked together, from its effective date. Any active rule for the same pair is closed off at that date.",
  requiresSecondPerson: true,
  tone: "primary",
};

const REJECT: RuleAction = {
  command: "reject",
  label: "Reject",
  consequence:
    "The draft is closed without ever taking effect. Proposing the pair again creates a new draft at the next version.",
  requiresSecondPerson: true,
  tone: "neutral",
};

const RETIRE: RuleAction = {
  command: "retire",
  label: "Retire",
  consequence:
    "The rule stops governing new bookings from now. Bookings already planned under it are not revisited.",
  requiresSecondPerson: false,
  tone: "danger",
};

const ACTIONS: Record<LifecycleStatus, readonly RuleAction[]> = {
  DRAFT: [ACTIVATE, REJECT],
  ACTIVE: [RETIRE],
  // Both are terminal. A retired rule is superseded rather than editable, and a
  // rejected one never took effect — the way back to either is a new draft.
  RETIRED: [],
  REJECTED: [],
};

export interface ActorContext {
  /** The signed-in Operations user, or null while the session is still loading. */
  actorId: string | null;
}

/**
 * True when this actor proposed this rule.
 *
 * `created_by_id` is nullable — a rule seeded before the lifecycle existed has
 * no proposer — and a rule nobody proposed is not a rule anybody is the proposer
 * of. Comparing `null === null` would make every such rule un-reviewable.
 */
export function isOwnProposal(rule: Rule, { actorId }: ActorContext): boolean {
  if (actorId === null || rule.created_by_id === null) return false;
  return rule.created_by_id === actorId;
}

/**
 * The commands this actor may take on this rule, right now.
 *
 * The single source of truth for what the console renders. A view that consults
 * `lifecycle_status` itself would be a second implementation of the rule that
 * matters most here, and the two would eventually disagree.
 */
export function availableActions(rule: Rule, context: ActorContext): readonly RuleAction[] {
  return ACTIONS[rule.lifecycle_status].filter((action) => {
    if (!action.requiresSecondPerson) return true;
    // Fail closed: an unknown actor cannot be shown to be a different person
    // from the proposer, so they are not offered the decision.
    if (context.actorId === null) return false;
    return !isOwnProposal(rule, context);
  });
}

/**
 * Why a draft shows no review actions, when the reason is separation of duties.
 *
 * Distinct from "there is nothing to do here". The reviewer needs to know the
 * draft is waiting on somebody else, or it looks stuck.
 */
export function isAwaitingAnotherReviewer(rule: Rule, context: ActorContext): boolean {
  return rule.lifecycle_status === "DRAFT" && isOwnProposal(rule, context);
}

/** Whether the actor has written a reason Django will accept. */
export function isReasonAcceptable(reason: string): boolean {
  const length = reason.trim().length;
  return length >= REASON_MIN_LENGTH && length <= REASON_MAX_LENGTH;
}

export interface DraftInput {
  leftVariantId: string;
  rightVariantId: string;
  mode: Schemas["ModeEnum"] | "";
  dependency: Schemas["DependencyEnum"];
  effectiveFrom: string;
  effectiveTo: string;
  changeReason: string;
}

export function isVariantId(value: string): boolean {
  return isUuid(value);
}

/**
 * Field-addressable problems with a proposed draft.
 *
 * Only the checks the client can make honestly. Whether a variant exists, is
 * active, or already has an overlapping active rule are all server facts, and
 * guessing at them here would produce a console that refuses valid proposals.
 * Those arrive as named refusal reasons instead — see `ruleFailureMessage`.
 */
export function validateDraft(input: DraftInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!isVariantId(input.leftVariantId)) {
    errors.leftVariantId = "Paste the variant's id from the catalog.";
  }
  if (!isVariantId(input.rightVariantId)) {
    errors.rightVariantId = "Paste the variant's id from the catalog.";
  }
  if (
    isVariantId(input.leftVariantId) &&
    input.leftVariantId.trim().toLowerCase() === input.rightVariantId.trim().toLowerCase()
  ) {
    errors.rightVariantId = "A rule describes two different services. Choose another variant.";
  }
  if (input.mode === "") {
    errors.mode = "Choose how these two services may be booked together.";
  }
  // Django refuses this pairing outright: parallel work has no ordering to
  // depend on. Saying so here saves a round trip that can only ever fail.
  if (input.mode === "PARALLEL_ALLOWED" && input.dependency !== "NONE") {
    errors.dependency = "Work that runs in parallel cannot also have an order. Choose None.";
  }
  if (input.effectiveFrom.trim() === "") {
    errors.effectiveFrom = "Say when this rule starts applying.";
  }
  if (
    input.effectiveTo.trim() !== "" &&
    input.effectiveFrom.trim() !== "" &&
    new Date(input.effectiveTo) <= new Date(input.effectiveFrom)
  ) {
    errors.effectiveTo = "The end has to come after the start.";
  }
  if (!isReasonAcceptable(input.changeReason)) {
    errors.changeReason = `Say why this rule is needed, in at least ${REASON_MIN_LENGTH} characters.`;
  }

  return errors;
}

const MODE_LABELS: Record<Schemas["ModeEnum"], string> = {
  SAME_PARTNER_SEQUENTIAL: "One partner, one after the other",
  PARALLEL_ALLOWED: "May run at the same time",
  MUST_BE_SEPARATE: "Must be booked separately",
};

const DEPENDENCY_LABELS: Record<Schemas["DependencyEnum"], string> = {
  NONE: "No required order",
  LEFT_BEFORE_RIGHT: "First service before second",
  RIGHT_BEFORE_LEFT: "Second service before first",
};

const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  DRAFT: "Awaiting review",
  ACTIVE: "Active",
  RETIRED: "Retired",
  REJECTED: "Rejected",
};

export function describeMode(mode: Schemas["ModeEnum"]): string {
  return MODE_LABELS[mode];
}

export function describeDependency(dependency: Schemas["DependencyEnum"]): string {
  return DEPENDENCY_LABELS[dependency];
}

export function describeLifecycle(status: LifecycleStatus): string {
  return LIFECYCLE_LABELS[status];
}

export function lifecycleTone(
  status: LifecycleStatus,
): "success" | "info" | "neutral" | "danger" {
  if (status === "ACTIVE") return "success";
  if (status === "DRAFT") return "info";
  if (status === "REJECTED") return "danger";
  return "neutral";
}

export { MODE_LABELS, DEPENDENCY_LABELS };
