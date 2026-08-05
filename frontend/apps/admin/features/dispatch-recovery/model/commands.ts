import { ApiRequestError, type Schemas } from "@vsolve/api-client";

/**
 * The three human overrides on autonomous dispatch, and what each one costs.
 *
 * Revoke, release and recover are the only commands in this console that reach
 * into work already in flight. Each takes the Fulfilment Unit's `version` as a
 * guard, a named reason that reaches an immutable `DispatchCommandAudit` row,
 * and an optional note.
 *
 * ## Why the version is never typed
 *
 * `expected_unit_version` comes from the dispatch explanation the operator is
 * looking at, and from nowhere else. A version an operator can enter is a
 * version they can enter wrongly, and the whole point of the guard is that the
 * command applies to the state that was actually read. A mismatch is a `409`
 * carrying the current version, and the recovery is to re-read and decide again
 * — never to resend with the number Django just quoted, which would defeat the
 * guard by automating around it.
 *
 * ## Why the reason is a closed list
 *
 * Django publishes `ReasonEnum` and refuses anything else. More to the point,
 * the reason is what an audit is *read by* later — "why did Operations pull this
 * Partner off the job" — so a free-text box would produce an audit trail nobody
 * can query.
 */

export type DispatchReason = Schemas["ReasonEnum"];
export type DispatchCommand = "revoke" | "release" | "recover";

/** Django's `max_length=500` on `note`. */
export const NOTE_MAX_LENGTH = 500;

export interface ReasonOption {
  value: DispatchReason;
  label: string;
  /** When this is the honest reason, in the operator's words. */
  when: string;
}

export const REASONS: readonly ReasonOption[] = [
  {
    value: "PARTNER_UNREACHABLE",
    label: "Partner unreachable",
    when: "They are not answering, and the visit cannot wait on them.",
  },
  {
    value: "CUSTOMER_REQUEST",
    label: "Customer asked for it",
    when: "The Customer asked for a different professional, on a call or in a case.",
  },
  {
    value: "SAFETY_CONCERN",
    label: "Safety concern",
    when: "Something about this pairing is not safe to go ahead with.",
  },
  {
    value: "DUPLICATE_DISPATCH",
    label: "Duplicate dispatch",
    when: "The same work was offered twice and one of them has to go.",
  },
  {
    value: "STUCK_DISPATCH",
    label: "Dispatch is stuck",
    when: "Nothing has moved and the automatic sweep has not picked it up.",
  },
  {
    value: "OPERATIONS_ERROR",
    label: "We made a mistake",
    when: "This dispatch was our error. Say what happened in the note.",
  },
];

export interface CommandDescription {
  /** What the operator presses. */
  label: string;
  /** What the command is addressed to — and what has to be pasted for it. */
  targetLabel: string;
  /** What changes in the world, so nobody presses it to find out. */
  consequence: string;
}

export const COMMANDS: Record<DispatchCommand, CommandDescription> = {
  revoke: {
    label: "Revoke this offer",
    targetLabel: "Offer id",
    consequence:
      "The Partner loses the offer immediately, any slot they were holding is freed, and the visit goes back out to the next candidate. They are not told why.",
  },
  release: {
    label: "Release this reservation",
    targetLabel: "Reservation id",
    consequence:
      "The Partner's held slot is freed and the visit goes back out to the next candidate. If the Customer has already been asked to pay, the whole Booking Group is unwound instead and has to be replanned — every other visit in it loses its professional too.",
  },
  recover: {
    label: "Run recovery on this visit",
    targetLabel: "Fulfilment unit id",
    consequence:
      "Runs the same reconciliation the automatic sweep runs, now, with your name on it. It does not force an outcome — a visit that is genuinely waiting on a Partner stays waiting.",
  },
};

/** Whether a note Django will accept has been written. Notes are optional. */
export function isNoteAcceptable(note: string): boolean {
  return note.trim().length <= NOTE_MAX_LENGTH;
}

/* -------------------------------------------------------------------------
   Reading Django's refusals
   ------------------------------------------------------------------------- */

export interface DispatchFailure {
  title: string;
  message: string;
  /** Whether the explanation must be re-read before the operator decides again. */
  refetchFirst: boolean;
  severity: "error" | "warning";
}

/**
 * The unit moved between the read and the command.
 *
 * Published as retryable, and it genuinely is — the operator's intent may still
 * be right against the new state. What must *not* happen is an automatic retry
 * carrying the version Django quoted back: that turns the guard into a rubber
 * stamp on a state nobody looked at.
 */
export function isVersionConflict(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "dispatch_version_conflict";
}

/** The version Django says the unit is actually at, when it published one. */
export function currentVersionFrom(error: unknown): number | null {
  if (!isVersionConflict(error)) return null;
  const details = (error as ApiRequestError).details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const version = (details as { current_version?: unknown }).current_version;
  return typeof version === "number" ? version : null;
}

/** The command cannot apply to the dispatch state it found. */
export function isCommandInvalid(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "dispatch_command_invalid";
}

/** An identical command is still running; its outcome is not known yet. */
export function isInProgress(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "idempotency_in_progress";
}

export function isUnknownTarget(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

function forbidden(): DispatchFailure {
  return {
    title: "You do not have access to this",
    message:
      "Dispatch recovery is limited to Operations. Nothing was changed. If that is wrong, ask your team lead — access is granted per account.",
    refetchFirst: false,
    severity: "error",
  };
}

/**
 * Turns any failure on this surface into something an operator can act on.
 *
 * `dispatch_command_invalid` carries Django's own sentence — "This offer is no
 * longer live to revoke", "This reservation is already released" — and it is
 * both operator-safe and more specific than anything this module could author,
 * so it is shown rather than replaced with a guess.
 */
export function dispatchFailure(error: unknown): DispatchFailure | null {
  if (!error) return null;
  if (error instanceof ApiRequestError && error.status === 403) return forbidden();

  if (isVersionConflict(error)) {
    const current = currentVersionFrom(error);
    return {
      title: "This visit changed while you were reading it",
      message:
        `Nothing was changed. It has been reloaded${
          current === null ? "" : ` and is now at version ${current}`
        } — read what happened before deciding again.`,
      refetchFirst: true,
      severity: "warning",
    };
  }

  if (isCommandInvalid(error)) {
    return {
      title: "This command no longer applies",
      message: `${(error as ApiRequestError).message} Nothing was changed — the visit has been reloaded.`,
      refetchFirst: true,
      severity: "warning",
    };
  }

  if (isInProgress(error)) {
    return {
      title: "This command is still being processed",
      message:
        "An identical command has not finished. Wait, then reload the visit to see where it got to — do not send a second one.",
      refetchFirst: false,
      severity: "warning",
    };
  }

  if (isUnknownTarget(error)) {
    return {
      title: "We could not find that record",
      message:
        "Check the id against the case you are working. Nothing was changed. Offers and reservations are only addressable by id — this console publishes no search for them.",
      refetchFirst: false,
      severity: "error",
    };
  }

  if (error instanceof ApiRequestError && error.code === "idempotency_key_reused") {
    return {
      title: "Those details do not match the earlier attempt",
      message:
        "An earlier command for this visit and version used different details. Reload the visit and check what already happened rather than sending this again.",
      refetchFirst: true,
      severity: "error",
    };
  }

  if (error instanceof ApiRequestError && error.status === 400) {
    return {
      title: "That was not accepted",
      message: `${error.message} Nothing was changed.`,
      refetchFirst: false,
      severity: "error",
    };
  }

  return {
    title: "We could not reach the server",
    message: "Nothing was changed. Check your connection and try again.",
    refetchFirst: false,
    severity: "error",
  };
}

/* -------------------------------------------------------------------------
   Reading the explanation
   ------------------------------------------------------------------------- */

export type Explanation = Schemas["DispatchExplanation"];
export type Attempt = Schemas["DispatchAttempt"];

/**
 * Whether the ranking snapshot actually explains anything.
 *
 * `apps/assignments/ranking.py` still orders candidates by Partner UUID, and
 * older attempts predate the snapshot entirely, so `ranked` can be empty. An
 * empty list is not "there were no candidates" — it is "no snapshot was taken",
 * and rendering one as the other would tell an operator that dispatch found
 * nobody when it simply did not record who it found.
 */
export function hasRankingSnapshot(attempt: Attempt): boolean {
  return attempt.ranked.length > 0 || attempt.excluded.length > 0;
}

/** Eligibility checks, flattened for display without asserting a shape. */
export function eligibilityEntries(attempt: Attempt): { key: string; value: string }[] {
  return Object.entries(attempt.eligibility).map(([key, value]) => ({
    key,
    value:
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value),
  }));
}
