/**
 * Why a vendor is turning an enquiry down.
 *
 * Closes the reason-capture half of `M2-FE-303`.
 *
 * ## This vocabulary is client-owned, and that is a gap, not a design
 *
 * `EnquiryDeclineRequest.reason_code` is an unconstrained `SlugField(max_length=80)`
 * at contract 1.21.0. Django stores whatever slug arrives and
 * `requirements_decline_needs_reason` only checks that it is non-empty, so there
 * is no server vocabulary to read and no server validation to fail against.
 *
 * The alternative — a free-text box — is worse in a specific way. `M2-FE-303`
 * captures a reason so replacement invitations stop being guesswork, and
 * "capacity" / "Capacity" / "no ppl" / "" are four different slugs for one fact.
 * Operations would be reading prose, and the matching pass that is supposed to
 * learn from a decline would learn nothing.
 *
 * So the list lives here, marked, and the request for a server-published
 * vocabulary is logged in `frontend-execution-plan.md` §7. When it lands this
 * file becomes a lookup against the server's list and the codes below are read,
 * not authored — which is the re-point §2 describes.
 *
 * ## Why these five
 *
 * Each maps to a decision Vsolve can act on, and to an exclusion reason the
 * matcher already names in `matching.ExclusionReason` where one exists. A sixth
 * reason nobody can act on is a dropdown item that only slows a decline down.
 */

export interface DeclineReason {
  /** The slug sent to Django. Stable — Operations reports group on it. */
  readonly code: string;
  /** What the vendor picks. Written from their side, not the platform's. */
  readonly label: string;
  /**
   * What Vsolve does with it, stated so the vendor knows the answer is used.
   * A reason box nobody explains is a reason box people click through.
   */
  readonly consequence: string;
}

export const DECLINE_REASONS: readonly DeclineReason[] = [
  {
    code: "no_capacity",
    label: "I am booked for these dates",
    consequence: "We stop offering you work on these dates and invite someone else.",
  },
  {
    code: "area_too_far",
    label: "This is too far from where I work",
    consequence: "We look at your service areas before inviting you to this area again.",
  },
  {
    code: "crew_too_small",
    label: "I cannot supply this many people",
    consequence: "We check your roster size against the headcount before inviting you.",
  },
  {
    code: "scope_unclear",
    label: "I cannot quote on what is described",
    consequence: "Operations is told the request needs more detail before it goes out again.",
  },
  {
    code: "rate_too_low",
    label: "The budget is below what I can work for",
    consequence: "The customer is told their budget may be short. Your rate is not shared.",
  },
];

const BY_CODE = new Map(DECLINE_REASONS.map((reason) => [reason.code, reason]));

export function findDeclineReason(code: string): DeclineReason | null {
  return BY_CODE.get(code) ?? null;
}

/**
 * A reason code Django returned that this build has no copy for.
 *
 * Reachable in two ways and both are ordinary: Operations withdrawing an
 * invitation writes `requirement_changed`, and a newer deployment can add codes
 * this bundle predates. Rendering the raw slug is honest — it is what the server
 * recorded — and it is de-slugged rather than dressed up, so nobody mistakes it
 * for copy somebody wrote.
 */
export function describeDeclineReason(code: string): string {
  const known = findDeclineReason(code);
  if (known) return known.label;
  if (!code) return "";
  const words = code.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
