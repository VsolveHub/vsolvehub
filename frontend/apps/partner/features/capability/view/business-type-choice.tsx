"use client";

import { Card, cn, useT } from "@vsolve/ui";

import type { BusinessType } from "../adapters/business-type";
import type { BusinessTypeChoice } from "../adapters/capability-options";

/**
 * Individual, workforce agency or project vendor — with what each one means.
 *
 * Closes the selection half of `M2-FE-103`.
 *
 * ## The consequence is the choice
 *
 * Nobody knows what "workforce agency" means as a category, and everybody knows
 * what "you send workers to a customer's site and the customer pays you
 * directly" means. So the consequence is not help text under the label — it is
 * the same size as the label and it is what a person actually reads. Getting
 * this wrong has real cost: business type decides tax treatment, who holds
 * liability and who the customer pays, and someone who guessed is discovering
 * that at their first invoice.
 *
 * The sentences come from the server (0013 §B1). A client-side copy table would
 * keep stating the old consequence after a policy change nobody remembered to
 * mirror here.
 *
 * ## Why a radio group and not a select
 *
 * Three options that must be compared before choosing. A `select` hides two of
 * them behind a tap and makes comparison impossible on a phone, which is where
 * this is being filled in.
 *
 * ## Never inferred
 *
 * Nothing in this app looks at a requested capability, a service name or a skill
 * and concludes a business type. That is the same inference the workspace
 * registry forbids, one step earlier and with more expensive consequences — it
 * is how a sole electrician gets filed as a labour contractor.
 */

export interface BusinessTypeChoiceProps {
  readonly choices: readonly BusinessTypeChoice[];
  readonly value: BusinessType | null;
  readonly onChange: (value: BusinessType) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function BusinessTypeChoiceGroup({
  choices,
  value,
  onChange,
  disabled = false,
  className,
}: BusinessTypeChoiceProps) {
  const t = useT();
  return (
    <fieldset className={cn("m-0 border-0 p-0", className)} disabled={disabled}>
      <legend className="text-base font-semibold text-text">{t("me.capability.businessChoice.legend")}</legend>
      <p className="mt-1 text-sm text-text-secondary">
        {t("me.capability.businessChoice.description")}
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {choices.map((choice) => {
          const isSelected = value === choice.value;

          return (
            <Card
              key={choice.value}
              className={cn(
                "p-0 transition-colors duration-fast",
                isSelected ? "ring-2 ring-action" : "hover:bg-surface-hover",
              )}
            >
              {/* The whole card is the label, so the tap target is the card
                  rather than a 16px circle — this is filled in one-handed. */}
              <label className="flex cursor-pointer items-start gap-3 p-4">
                <input
                  type="radio"
                  name="business_type"
                  value={choice.value}
                  checked={isSelected}
                  onChange={() => onChange(choice.value)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-action)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">{choice.label}</span>
                  {/* Server-authored. Same weight as the label because it is
                      what the decision is actually made on. */}
                  <span className="mt-1 block text-sm leading-6 text-text-secondary">
                    {choice.consequence}
                  </span>
                </span>
              </label>
            </Card>
          );
        })}
      </div>
    </fieldset>
  );
}
