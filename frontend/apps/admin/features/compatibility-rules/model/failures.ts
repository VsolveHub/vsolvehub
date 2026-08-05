import { ApiRequestError } from "@vsolve/api-client";

/**
 * Reading Django's refusals for compatibility-rule commands.
 *
 * ## Why the status is not enough
 *
 * Every refusal on this surface is a `409`. `apps/carts/exceptions.py` raises
 * two error codes and puts the discriminator in `details.reason`, so classifying
 * on status alone would collapse "somebody else edited this" and "you cannot
 * approve your own proposal" into one message — and only one of them is fixed by
 * refetching.
 *
 * ## Why every reason is named
 *
 * A named reason is a different recovery. `variant_inactive` means fix the
 * catalog; `effective_window_overlap` means change the date; `maker_checker_
 * required` means it was never yours to approve. A generic "could not activate"
 * sends a reviewer to guess between them, and the most likely guess is to press
 * the button again.
 *
 * Unknown reasons degrade to a safe message rather than being rendered raw: a
 * newer deployment adding a reason must not put an untranslated identifier in
 * front of an operator.
 */

const CONFLICT_CODE = "compatibility_rule_conflict";
const ACTIVATION_CODE = "compatibility_rule_activation_invalid";

export interface RuleFailure {
  title: string;
  message: string;
  /** Whether the rule has to be reloaded before the operator decides again. */
  refetchFirst: boolean;
  severity: "error" | "warning";
}

/** The `reason` Django put in the error envelope, when it published one. */
export function failureReason(error: unknown): string | null {
  if (!(error instanceof ApiRequestError)) return null;
  if (error.code !== CONFLICT_CODE && error.code !== ACTIVATION_CODE) return null;
  const details = error.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const reason = (details as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}

/**
 * The refusal that must never be reachable from the console.
 *
 * The proposer is not offered Activate or Reject at all, so seeing this means
 * the client was acting on a rule whose proposer it had not yet loaded — a
 * stale tab, or a session that resolved after the queue did. It is handled
 * rather than ignored, because "the button did nothing" is the worst possible
 * answer to a separation-of-duties refusal.
 */
export function isMakerCheckerRefusal(error: unknown): boolean {
  return failureReason(error) === "maker_checker_required";
}

/** The rule moved underneath the operator; the recovery is always to reload. */
export function isStaleRule(error: unknown): boolean {
  const reason = failureReason(error);
  return (
    reason === "version_changed" ||
    reason === "rule_is_not_draft" ||
    reason === "rule_is_not_current_draft" ||
    reason === "rule_is_not_current_active" ||
    reason === "concurrent_version_created"
  );
}

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 403;
}

const FAILURES: Record<string, RuleFailure> = {
  maker_checker_required: {
    title: "This one is not yours to decide",
    message:
      "You proposed this rule, so another Operations reviewer has to activate or reject it. Nothing was changed.",
    refetchFirst: true,
    severity: "warning",
  },
  version_changed: {
    title: "Someone else acted first",
    message:
      "This rule changed while you had it open. It has been reloaded — check what changed before deciding again. Your decision was not applied.",
    refetchFirst: true,
    severity: "warning",
  },
  rule_is_not_draft: {
    title: "This rule has already been reviewed",
    message:
      "It is no longer a draft, so it cannot be activated. The reloaded rule shows where it ended up.",
    refetchFirst: true,
    severity: "warning",
  },
  rule_is_not_current_draft: {
    title: "This rule has already been reviewed",
    message:
      "It is no longer the current draft for this pair. The reloaded rule shows where it ended up.",
    refetchFirst: true,
    severity: "warning",
  },
  rule_is_not_current_active: {
    title: "This rule is not active",
    message: "Only an active rule can be retired. It has been reloaded so you can see its state.",
    refetchFirst: true,
    severity: "warning",
  },
  concurrent_version_created: {
    title: "Someone proposed for this pair at the same time",
    message:
      "Your draft was not saved. Reload the list, read the other proposal, and propose again if it is still needed.",
    refetchFirst: true,
    severity: "warning",
  },
  variants_must_differ: {
    title: "A rule needs two different services",
    message: "Both sides name the same variant. Nothing was saved.",
    refetchFirst: false,
    severity: "error",
  },
  variant_not_found: {
    title: "One of those variants does not exist",
    message: "Check both ids against the catalog. Nothing was saved.",
    refetchFirst: false,
    severity: "error",
  },
  variant_inactive: {
    title: "One of these services is not active",
    message:
      "A rule cannot be activated over an inactive variant. Reactivate it in the catalog first, then activate this rule. Nothing was changed.",
    refetchFirst: false,
    severity: "error",
  },
  conditions_not_supported: {
    title: "Conditional rules cannot be activated yet",
    message:
      "This draft carries conditions, which the platform does not evaluate. Reject it and propose an unconditional rule. Nothing was changed.",
    refetchFirst: false,
    severity: "error",
  },
  parallel_dependency_invalid: {
    title: "Parallel work cannot have an order",
    message:
      "This draft allows the services to run at the same time and also requires one before the other. Reject it and propose again with no required order. Nothing was changed.",
    refetchFirst: false,
    severity: "error",
  },
  effective_window_overlap: {
    title: "Another rule already covers this period",
    message:
      "An active rule for this pair starts on or after this one's effective date, so activating would leave two rules governing the same time. Retire that rule first, or propose this one with a later effective date. Nothing was changed.",
    refetchFirst: false,
    severity: "error",
  },
};

const UNKNOWN_CONFLICT: RuleFailure = {
  title: "This rule cannot be changed right now",
  message: "Nothing was changed. Reload the rule and check its current state before trying again.",
  refetchFirst: true,
  severity: "warning",
};

const FORBIDDEN: RuleFailure = {
  title: "You do not have access to this",
  message:
    "Compatibility rules are limited to Operations. Nothing was changed. If that is wrong, ask your team lead — access is granted per account.",
  refetchFirst: false,
  severity: "error",
};

const UNAVAILABLE: RuleFailure = {
  title: "We could not reach the server",
  message: "Nothing was changed. Check your connection and try again.",
  refetchFirst: false,
  severity: "error",
};

/**
 * Turns any failure from this surface into something an operator can act on.
 *
 * Returns null when there is no error, so a caller can render conditionally
 * without a second null check.
 */
export function ruleFailure(error: unknown): RuleFailure | null {
  if (!error) return null;
  if (isForbidden(error)) return FORBIDDEN;

  const reason = failureReason(error);
  if (reason !== null) return FAILURES[reason] ?? UNKNOWN_CONFLICT;

  if (error instanceof ApiRequestError && error.status === 409) return UNKNOWN_CONFLICT;
  if (error instanceof ApiRequestError && error.status === 400) {
    return {
      title: "That was not accepted",
      message: `${error.message} Nothing was changed.`,
      refetchFirst: false,
      severity: "error",
    };
  }

  return UNAVAILABLE;
}
