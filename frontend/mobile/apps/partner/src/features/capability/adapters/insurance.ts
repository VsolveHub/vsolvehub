// Ported from frontend/apps/partner/features/capability/adapters/insurance.ts
import type { InsuranceDeclaration, InsuranceDeclarationInput } from "./wire";

/**
 * The worker insurance and liability declaration.
 *
 * Closes `M2-FE-106` / `GAP-022`. Required for workforce capabilities because a
 * Partner sending people onto someone else's site is sending people who can be
 * hurt there, and who carries that is not a detail either party should discover
 * afterwards.
 *
 * ## Declared is not insured
 *
 * `verified_at` is set by Operations and by nobody else. Until it is, this is a
 * Partner's statement about a policy nobody has checked — so the view model
 * carries `isVerified` as its own field and the copy never collapses the two.
 * Rendering an unverified declaration as "insured" would put a claim in front of
 * a customer that Vsolve has not stood behind.
 *
 * ## Expiry is the state that actually bites
 *
 * A policy that lapses mid-engagement is the common failure, not a missing one:
 * a Partner declares a valid policy in April, works through the year, and the
 * cover ends in March while a crew is on site. So the view model reports
 * `isExpired` and `expiresSoon` against the **server clock**, and the screen can
 * warn before the refusal rather than after it.
 */

/** How long before expiry the Partner is warned. A month is time to renew. */
const EXPIRY_WARNING_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export interface InsuranceView {
  readonly insurerName: string;
  readonly policyReference: string;
  /** Paise. Formatted by the view with the shared money readout. */
  readonly coveragePaise: number;
  readonly coversWorkmenCompensation: boolean;
  readonly validFrom: string;
  readonly validTo: string;
  /** Operations checked it. Never inferred from the declaration existing. */
  readonly isVerified: boolean;
  readonly isExpired: boolean;
  /** Within the warning window and not yet expired. */
  readonly expiresSoon: boolean;
  readonly daysUntilExpiry: number | null;
}

export function describeInsurance(
  declaration: InsuranceDeclaration,
  serverNow: string,
): InsuranceView {
  const validTo = Date.parse(`${declaration.valid_to}T23:59:59Z`);
  const now = Date.parse(serverNow);
  const readable = !Number.isNaN(validTo) && !Number.isNaN(now);

  const days = readable ? Math.floor((validTo - now) / MS_PER_DAY) : null;

  return {
    insurerName: declaration.insurer_name,
    policyReference: declaration.policy_reference,
    coveragePaise: declaration.coverage_paise,
    coversWorkmenCompensation: declaration.covers_workmen_compensation,
    validFrom: declaration.valid_from,
    validTo: declaration.valid_to,
    isVerified: declaration.verified_at !== null,
    // An unreadable date is reported as *not* expired. The server enforces
    // validity; showing a live policy as expired because a timestamp failed to
    // parse would send a Partner to renew cover they already hold.
    isExpired: readable ? validTo <= now : false,
    expiresSoon: days !== null && days >= 0 && days <= EXPIRY_WARNING_DAYS,
    daysUntilExpiry: days,
  };
}

export type InsuranceField =
  | "insurer_name"
  | "policy_reference"
  | "coverage_paise"
  | "valid_from"
  | "valid_to";

export interface InsuranceProblem {
  readonly field: InsuranceField;
  readonly message: string;
}

/**
 * The refusals the database is certain to make.
 *
 * Both are check constraints — `partners_insurance_valid_range` and
 * `partners_insurance_coverage_positive` — so a round-trip would teach nobody
 * anything. Everything else is Django's to judge, including whether the insurer
 * is one Vsolve recognises, which no client can know.
 */
export function insuranceProblems(input: InsuranceDeclarationInput): InsuranceProblem[] {
  const problems: InsuranceProblem[] = [];

  if (input.insurer_name.trim() === "") {
    problems.push({ field: "insurer_name", message: "Add the name of your insurer." });
  }

  if (input.policy_reference.trim() === "") {
    problems.push({
      field: "policy_reference",
      message: "Add the policy number, exactly as it appears on the document.",
    });
  }

  if (!Number.isFinite(input.coverage_paise) || input.coverage_paise <= 0) {
    problems.push({
      field: "coverage_paise",
      message: "Add how much the policy covers.",
    });
  }

  const from = Date.parse(input.valid_from);
  const to = Date.parse(input.valid_to);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    problems.push({ field: "valid_to", message: "Add the dates the policy runs between." });
  } else if (to <= from) {
    problems.push({
      field: "valid_to",
      message: "The policy has to end after it starts. Check the two dates.",
    });
  }

  return problems;
}
