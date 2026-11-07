// Ported from frontend/apps/customer/features/requirement/model/request-state.ts
/**
 * What a submitted requirement is *doing*, as the tracking screens read it.
 *
 * `M2-FE-215` asks for honest empty, no-supply, delayed-match, SLA-breached and
 * service-by-expired states with a truthful next step and no fabricated
 * progress. Four of those five are server statuses. One — delayed match — is
 * not, and that is the whole reason this module exists.
 *
 * ## The unions are re-declared, not imported
 *
 * Same rule as `LifecycleVerdict` in `./state.ts`. `contract-pending/types.ts`
 * declares `RequirementStatus` as *a field the server sends*; this declares it
 * as *a state the client renders*. They are the same words and different facts,
 * and the quarantine boundary test enforces that the model cannot reach across
 * to borrow the other one. The adapter maps between them, and when the contract
 * publishes only the adapter changes.
 */

export type RequestStatus =
  | "DRAFT"
  | "MATCHING"
  /**
   * A5 only, and missing from this union until Wave A2 — a real defect rather
   * than a new value.
   *
   * `RequirementStatusEnum` has carried `VISITS_BOOKED` since 1.21.0 and
   * revision 3 made it the state most A5 requests sit in: a vendor has confirmed
   * a visit slot and the plan is charged, before any estimate exists. An
   * unrecognised status is dropped by `toRequestRow`, so an A5 Customer whose
   * first professional had confirmed watched their request **disappear from `My
   * requests`** until an estimate landed. Nothing failed; a filter did its job.
   */
  | "VISITS_BOOKED"
  | "QUOTES_READY"
  | "UNLOCKED"
  | "SELECTED"
  | "ENGAGED"
  | "CLOSED_NO_SUPPLY"
  | "CLOSED_SLA_BREACH"
  | "CLOSED_EXPIRED"
  | "CLOSED_ABANDONED"
  | "CLOSED_COMPLETE"
  | "CLOSED_CANCELLED";

export type RequestClosureReason =
  | "NO_SUPPLY"
  | "SLA_BREACH"
  | "EXPIRED"
  | "ABANDONED"
  | "COMPLETE"
  | "CANCELLED";

/**
 * The rendered state: every status, plus the one thing a status cannot say.
 *
 * ## Why `MATCHING_DELAYED` is derived and not a status
 *
 * The quote-delivery deadline (`GAP-002`) is a promise with a clock on it. When
 * it passes and the requirement is still `MATCHING`, the server has not yet run
 * whatever closes it as `CLOSED_SLA_BREACH` — and the Customer can see the
 * deadline has gone, because it is printed on their screen.
 *
 * Rendering plain "Finding professionals" then is the fabricated progress
 * `M2-FE-215` forbids: a reassuring label on a promise already broken. Rendering
 * "SLA breached" is the opposite failure — asserting a *server* transition that
 * has not happened, and with it a refund nobody has authorised.
 *
 * `MATCHING_DELAYED` is the only honest third thing: our own deadline has
 * passed, we are still looking, nothing has been decided. It claims no
 * transition and promises no remedy.
 */
export type RequestState = RequestStatus | "MATCHING_DELAYED";

export interface RequestStateInput {
  status: RequestStatus;
  /**
   * Milliseconds until the quote-delivery deadline, or null when there is none.
   *
   * Passed in rather than computed, for the reason `isServiceDateUsable` gives:
   * a function that reads a clock cannot be tested at its boundary. And the
   * clock that matters here is the *server's* — the caller gets this from
   * `serverClock` via `useServerCountdown`, never from `Date.now()`.
   */
  quoteDeadlineRemainingMs: number | null;
}

export function requestState({
  status,
  quoteDeadlineRemainingMs,
}: RequestStateInput): RequestState {
  if (
    status === "MATCHING" &&
    quoteDeadlineRemainingMs !== null &&
    quoteDeadlineRemainingMs <= 0
  ) {
    return "MATCHING_DELAYED";
  }
  return status;
}

const CLOSED_STATES: readonly RequestState[] = [
  "CLOSED_NO_SUPPLY",
  "CLOSED_SLA_BREACH",
  "CLOSED_EXPIRED",
  "CLOSED_ABANDONED",
  "CLOSED_COMPLETE",
  "CLOSED_CANCELLED",
];

/** True when nothing more will happen without the Customer starting something new. */
export function isClosedState(state: RequestState): boolean {
  return CLOSED_STATES.includes(state);
}

/**
 * Whether a countdown to the quote-delivery deadline is worth showing.
 *
 * Only while the promise is live. A ticking clock on a closed requirement is a
 * screen still counting down to something that already failed to happen, and on
 * `MATCHING_DELAYED` a negative countdown reads as a debt we are paying off.
 */
export function showsQuoteDeadline(state: RequestState): boolean {
  return state === "MATCHING";
}

/**
 * Whether this state means the Customer is owed an explanation from support.
 *
 * `M2-FE-213` puts a support action on the list. It is offered everywhere, but
 * it *leads* here — these are the two states where we, not the Customer and not
 * the market, are the reason there is nothing to show. `CLOSED_NO_SUPPLY` is
 * deliberately not one of them: nobody covering the work yet is a fact about
 * the market, and routing it to support would waste the Customer's call.
 */
export function isOurFailure(state: RequestState): boolean {
  return state === "CLOSED_SLA_BREACH" || state === "MATCHING_DELAYED";
}

/**
 * The first sentence of a state's explanation, and whatever is left.
 *
 * ## The bug this exists to make impossible
 *
 * The detail screen wants two things: one sentence somebody can read at a
 * glance, and the full account underneath for whoever wants it. That was
 * briefly two hand-written strings per state — a `headline` beside the
 * `explanation` — and three of the fourteen were written identically to their
 * own explanation, so the card printed the same sentence twice, once in
 * 20px bold and once in 14px grey. Four more repeated it as a prefix.
 *
 * Two strings that must agree will eventually disagree. So there is one
 * string, and the split is computed: the lede is the explanation's first
 * sentence, and `rest` is what follows it — empty when the explanation *is*
 * one sentence, which is exactly the case that was being rendered twice.
 *
 * The consequence worth stating: **no state can ever say the same thing
 * twice**, because `rest` is a suffix of the text `lede` was taken from and
 * cannot contain it.
 *
 * Abbreviations are why this is not `split(". ")`. "Rs. 500" and "e.g." would
 * both cut mid-sentence; the boundary has to be a full stop followed by a
 * space and a capital, which is the shape every sentence in the state table
 * actually has.
 */
export function splitLede(explanation: string): { lede: string; rest: string } {
  const text = explanation.trim();
  const boundary = /(?<=\.)\s+(?=[A-Z])/;
  const match = boundary.exec(text);
  if (match === null || match.index === undefined) {
    return { lede: text, rest: "" };
  }
  return {
    lede: text.slice(0, match.index),
    rest: text.slice(match.index + match[0].length).trim(),
  };
}
