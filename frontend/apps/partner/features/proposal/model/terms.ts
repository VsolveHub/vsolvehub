import type { TaxBasis } from "./proposal-draft";

/**
 * The commercial statements every quote carries — tax basis, commission
 * treatment and the wage floor.
 *
 * Closes what is buildable of `M2-FE-310` and `M2-FE-311`. Two of the three are
 * partly unreadable at contract 1.21.0, and this module is where that is stated
 * once instead of being worked around in three screens.
 */

export type { TaxBasis };

export interface TaxBasisOption {
  readonly value: TaxBasis;
  readonly label: string;
  /** What the customer will see, in the vendor's own terms. */
  readonly comparison: string;
}

/**
 * The only two bases, published as an enum and therefore read rather than
 * authored.
 *
 * The comparison line matters more than the label. `_required_tax_basis` forces
 * every quote on one requirement onto whichever basis arrived first, so a vendor
 * choosing here may be choosing for everyone — or may be about to be refused for
 * disagreeing with a vendor they cannot see.
 */
export const TAX_BASIS_OPTIONS: readonly TaxBasisOption[] = [
  {
    value: "INCLUSIVE",
    label: "My price already includes tax",
    comparison: "The customer compares the total you enter. Nothing is added at the end.",
  },
  {
    value: "EXCLUSIVE",
    label: "Tax is added on top of my price",
    comparison: "The customer compares your price plus the tax you state, so enter the tax as well.",
  },
];

/**
 * Why a vendor may be refused for picking a basis.
 *
 * **The required basis is not readable.** `_required_tax_basis` reads the first
 * non-withdrawn proposal on the requirement — another vendor's — and refuses a
 * mismatch with `m2_proposal_invalid_shape` and a message naming the required
 * basis. Nothing publishes that basis before submission, so this cannot be a
 * preselected value or a disabled option; it can only be a warning before, and
 * the server's own sentence after.
 *
 * Requested in `frontend-execution-plan.md` §7.
 */
export const TAX_BASIS_UNKNOWN_NOTICE =
  "If another vendor has already quoted on this request, Vsolve compares every quote the same way they did. We cannot see which way that is until you send yours — if it does not match, we will tell you which to use and nothing will have been sent to the customer.";

/* ---------------------------------------------------------------------------
   Commission
   --------------------------------------------------------------------------- */

/**
 * What this build can honestly say about commission: nothing specific.
 *
 * `Proposal.commission_treatment` is a `CharField(max_length=24)` with no
 * choices, no default and no server-published vocabulary, and there is no M2
 * commission policy to read — `ServicePricingPolicy.commission_basis_points`
 * exists for the A1 task lifecycle only and is not reachable from a proposal.
 *
 * Two options, and the field is deliberately left unsent. Authoring a 24-character
 * code would be this client inventing the vocabulary Operations and Finance
 * report on, and the string a vendor picked would be compared against strings
 * other clients invented differently. A blank field is a visible gap; a made-up
 * one is an invisible wrong answer.
 *
 * So the composer states what is true — that the number the customer compares is
 * the total as entered — and the gap is logged in
 * `frontend-execution-plan.md` §7.
 */
export const COMMISSION_TREATMENT_NOTICE =
  "The customer compares the total you enter here. Vsolve has not published how its commission is shown against a workforce or project quote, so nothing is added or taken off this figure on screen. Ask support before assuming a deduction.";

/* ---------------------------------------------------------------------------
   Wage floor (M2-FE-310)
   --------------------------------------------------------------------------- */

/**
 * The minimum-wage statement on the A3 composer.
 *
 * `M2-FE-310` asks for the floor shown inline. It cannot be: no endpoint
 * publishes a floor for a state and skill, so any figure on this screen would be
 * one this client made up about statutory pay.
 *
 * Worse, the guard is currently inert over HTTP. `assert_rate_meets_wage_floor`
 * runs only when `submit_proposal` is handed `wage_floor_skill` and
 * `wage_floor_state_code`, and `ProposalCreateSerializer` carries neither — so
 * `PartnerProposalCollectionView` never passes them and
 * `m2_proposal_below_wage_floor` cannot be returned by the API as it stands.
 *
 * Both are logged in `frontend-execution-plan.md` §7. Until they close, the
 * composer states the rule without a number and surfaces the refusal properly if
 * one ever arrives — `errors.ts` already routes the code to `fix_input`, so it
 * lands under the rate field rather than in a banner.
 */
export const WAGE_FLOOR_NOTICE =
  "Your daily rate has to be at or above the statutory minimum wage for this state and skill. Vsolve cannot show you that figure here yet — if your rate is below it, we will refuse the quote and say so before the customer sees anything.";

/** The two refusals the rate field must be able to explain. */
export const WAGE_FLOOR_ERROR_CODES = [
  "m2_proposal_below_wage_floor",
  /**
   * Not in the frozen 29 in `errors.ts`, so it currently falls through to the
   * generic refusal path. Requested in `frontend-execution-plan.md` §7.
   */
  "m2_wage_floor_unavailable",
] as const;

export function isWageFloorRefusal(code: string): boolean {
  return (WAGE_FLOOR_ERROR_CODES as readonly string[]).includes(code);
}
