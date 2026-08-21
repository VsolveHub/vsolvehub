import type { GateList, GateName, GateNextAction, GateStatus } from "./wire";

/**
 * Progressive gates: which one stands in front of an action, and why *now*.
 *
 * Closes `M2-FE-102` and the decision half of `M2-FE-114`.
 *
 * ## The rule this module exists to protect
 *
 * A gate blocks an **action**, never a screen. `assert_kyc_complete` guards
 * accepting a first enquiry; it does not guard reading the enquiry list, and
 * nothing here may be used to hide demand. Supply is the scarce side of this
 * marketplace: a Partner browses masked leads after phone, name, one service and
 * one city, and a gate that runs earlier than the action it protects is the
 * flow-weight regression `FLOW-06` and `FLOW-07` exist to prevent.
 *
 * `blockingGate` therefore takes an action, and there is deliberately no
 * `isPartnerBlocked()` — a whole-person verdict is exactly the shape that gets
 * reached for on a list screen.
 *
 * ## Why this is advisory and the server is not
 *
 * Django enforces these at the moment of the command
 * (`assert_kyc_complete`, `assert_payout_details_present`,
 * `assert_crew_roster_present`), and it can refuse for reasons this read never
 * saw — a document that expired between the two calls, a suspension thirty
 * seconds old. So this decides what the UI *explains before the attempt*, and
 * every command still handles `m2_kyc_required`, `m2_payout_details_required`
 * and `m2_crew_roster_required` arriving anyway.
 *
 * The inverse matters more. A satisfied gate here must never be read as
 * permission: `describeGate` returns copy, `blockingGate` returns which
 * explanation to show, and neither returns a boolean anyone can mistake for
 * authorization.
 *
 * ## Why the copy is the server's
 *
 * `reason` and `next_action` come from the payload. 0013 §D1 requires the same
 * strings on the refusal, so a Partner who reads "we check identity before your
 * first job" on the button sees that sentence again if they get there first —
 * rather than one explanation before the attempt and a different one after it,
 * which is how a person concludes something changed.
 */

/**
 * Where each next action leads. Routes are the frontend's, per the registry split.
 *
 * Three entries, not the four proposal 0013 §D1 proposed: `CONTACT_SUPPORT` was
 * not published at 1.22.0, and that is the right call — every live gate has a
 * screen that clears it, and a gate whose only recovery is "message us" is one
 * nobody can pass. The difference is logged in `frontend-execution-plan.md` §7
 * rather than papered over with a fourth route nothing can name.
 */
const ACTION_ROUTES: Record<GateNextAction, { href: string; label: string }> = {
  SUBMIT_APPLICATION: { href: "/apply/review", label: "Finish your application" },
  ADD_PAYOUT_ACCOUNT: { href: "/money", label: "Add your bank details" },
  // Points at the roster, which the Partner reaches from the assignment they
  // were trying to make. Not at registration — `FLOW-07` is explicit that a crew
  // list is asked for at first assignment and never before.
  ADD_CREW_MEMBER: { href: "/me/crew", label: "Add your crew" },
};

export interface GateExplanation {
  readonly gate: GateName;
  /** The server's sentence. Never rewritten here. */
  readonly reason: string;
  readonly actionHref: string | null;
  readonly actionLabel: string | null;
}

/**
 * The gate standing in front of one action, or null.
 *
 * Only unsatisfied gates are considered, and `blocks` is matched exactly. An
 * exact match rather than a prefix on purpose: `crew.assign` and `crew.manage`
 * share a namespace and only one of them needs a roster, so a prefix test would
 * block a Partner from *building* the roster the gate is asking for.
 */
export function blockingGate(
  gates: readonly GateStatus[],
  action: string,
): GateStatus | null {
  return (
    gates.find((gate) => !gate.is_satisfied && gate.blocks.includes(action)) ?? null
  );
}

/**
 * The gate as something a screen can render.
 *
 * A satisfied gate has no explanation and returns null — there is nothing
 * truthful to say about a requirement that has been met, and a green tick beside
 * every unmet obligation is how a checklist becomes the screen instead of the
 * work being the screen.
 */
export function describeGate(gate: GateStatus): GateExplanation | null {
  if (gate.is_satisfied) return null;

  const route = gate.next_action === null ? null : ACTION_ROUTES[gate.next_action];

  return {
    gate: gate.gate,
    // An unsatisfied gate with no reason is a server contract violation (0013
    // §D1 acceptance criterion 6). Saying so beats rendering an empty paragraph
    // that reads as a UI bug the Partner cannot act on.
    reason:
      gate.reason.trim() ||
      "We need one more thing before you can do this. Contact support and we will tell you what.",
    actionHref: route?.href ?? null,
    actionLabel: route?.label ?? null,
  };
}

/** The explanation to show against one action, or null when nothing stands in the way. */
export function explainBlock(
  gates: readonly GateStatus[],
  action: string,
): GateExplanation | null {
  const gate = blockingGate(gates, action);
  return gate === null ? null : describeGate(gate);
}

/**
 * Every unsatisfied gate, for the profile screen that legitimately lists them.
 *
 * The one place a whole-person view is correct: "what is outstanding on my
 * account" is a question the Partner asked. It is still never used to decide
 * whether a control renders.
 */
export function outstandingGates(gates: readonly GateStatus[]): GateStatus[] {
  return gates.filter((gate) => !gate.is_satisfied);
}

/**
 * Reads a gate list payload, dropping rows the build does not recognise.
 *
 * Total, like `parseWorkspaceGrants`, and unknown-tolerant for the same reason:
 * a newer deployment can add a fourth gate, and this build has no copy, no route
 * and no control for it. Dropping it means the Partner is not shown a demand for
 * something they cannot act on — and the command still refuses server-side, so
 * nothing is authorized by the omission.
 *
 * That is the opposite of how the requirement timeline treats an unknown event
 * (0012 §B7 renders it as a neutral dated row), and deliberately: there the
 * record is the point, here it is a control the bundle cannot offer.
 */
const KNOWN_GATES: readonly GateName[] = ["KYC", "PAYOUT_DETAILS", "CREW_ROSTER"];
const KNOWN_ACTIONS: readonly GateNextAction[] = [
  "SUBMIT_APPLICATION",
  "ADD_PAYOUT_ACCOUNT",
  "ADD_CREW_MEMBER",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseGates(payload: unknown): GateStatus[] {
  const rows = isRecord(payload) && Array.isArray(payload.gates) ? payload.gates : [];

  return rows.flatMap((row): GateStatus[] => {
    if (!isRecord(row)) return [];
    const gate = row.gate;
    if (typeof gate !== "string" || !KNOWN_GATES.includes(gate as GateName)) return [];

    const nextAction = row.next_action;
    const known =
      typeof nextAction === "string" && KNOWN_ACTIONS.includes(nextAction as GateNextAction);

    return [
      {
        gate: gate as GateName,
        // Fails closed. A payload that omitted the flag is treated as blocking:
        // over-explaining an obligation costs a sentence, and wrongly reporting
        // one as met invites a Partner to press a control that will refuse.
        is_satisfied: row.is_satisfied === true,
        blocks: Array.isArray(row.blocks)
          ? row.blocks.filter((entry): entry is string => typeof entry === "string")
          : [],
        reason: typeof row.reason === "string" ? row.reason : "",
        next_action: known ? (nextAction as GateNextAction) : null,
      },
    ];
  });
}

/** Convenience for the query seam: the gates out of a whole response. */
export function gatesOf(payload: GateList | undefined): readonly GateStatus[] {
  return payload?.gates ?? [];
}
