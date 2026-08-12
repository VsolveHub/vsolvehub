"use client";

import { Field, Input, Select } from "@vsolve/ui";

import {
  COMMISSION_TREATMENT_NOTICE,
  TAX_BASIS_OPTIONS,
  TAX_BASIS_UNKNOWN_NOTICE,
  type TaxBasis,
} from "../model/terms";
import { paiseToRupeeInput, rupeesToPaise } from "../model/proposal-draft";

/**
 * The commercial statements every quote carries.
 *
 * Closes what is buildable of `M2-FE-311`, shared by both composers because the
 * rules are the requirement's, not the archetype's: `_required_tax_basis` forces
 * one basis across every quote on a requirement whether it is workforce or
 * project.
 *
 * ## The basis is a real choice with an invisible constraint
 *
 * Whoever quotes first fixes the basis for everyone. A vendor quoting second is
 * refused for disagreeing with a vendor they cannot see, and nothing publishes
 * which basis is required — so this cannot preselect, cannot disable an option,
 * and must not guess. It states the constraint before submission and shows
 * Django's own sentence after, which names the required basis.
 *
 * ## Commission is stated as unknown rather than invented
 *
 * `Proposal.commission_treatment` is a 24-character free field with no
 * vocabulary and no M2 policy behind it. See `model/terms.ts` for why nothing is
 * sent rather than something authored.
 */

export interface ProposalTermsProps {
  readonly taxBasis: TaxBasis | null;
  readonly onTaxBasisChange: (basis: TaxBasis | null) => void;
  readonly taxPaise: number;
  readonly onTaxPaiseChange: (paise: number) => void;
  readonly errors: Readonly<Record<string, string>>;
  readonly disabled?: boolean;
}

export function ProposalTerms({
  taxBasis,
  onTaxBasisChange,
  taxPaise,
  onTaxPaiseChange,
  errors,
  disabled = false,
}: ProposalTermsProps) {
  const chosen = TAX_BASIS_OPTIONS.find((option) => option.value === taxBasis) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <Field label="Tax" required error={errors.taxBasis} description={chosen?.comparison}>
        <Select
          placeholder="Does your price include tax?"
          value={taxBasis ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            onTaxBasisChange(value === "" ? null : (value as TaxBasis));
            if (value !== "EXCLUSIVE") onTaxPaiseChange(0);
          }}
          disabled={disabled}
        >
          {TAX_BASIS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      {taxBasis === "EXCLUSIVE" ? (
        <Field
          label="Tax you will add"
          description="In rupees. The customer compares your price plus this."
          error={errors.taxPaise}
        >
          <Input
            type="text"
            inputMode="decimal"
            value={paiseToRupeeInput(taxPaise === 0 ? null : taxPaise)}
            onChange={(event) => onTaxPaiseChange(rupeesToPaise(event.target.value) ?? 0)}
            placeholder="0"
            disabled={disabled}
          />
        </Field>
      ) : null}

      <p className="text-xs leading-5 text-text-muted">{TAX_BASIS_UNKNOWN_NOTICE}</p>
      <p className="text-xs leading-5 text-text-muted">{COMMISSION_TREATMENT_NOTICE}</p>
    </div>
  );
}
