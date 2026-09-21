"use client";

import type { InputHTMLAttributes, Ref } from "react";

import { cn } from "./cn";
import { controlChrome, useFieldContext } from "./field";

/**
 * A mobile number control for a country whose code we already know.
 *
 * Indian users should never type `+91`. It is not that they cannot, it is that
 * asking for it produces four wrong shapes in practice: with the plus, without
 * it, with a leading zero, and with spaces in three different places. So the
 * code is a fixture of the control rather than something the user supplies, and
 * this component strips it back out of anything pasted in.
 *
 * The country is a prop with a default rather than a constant, because this
 * package is shared by the customer, partner and Operations apps. Baking the
 * dial code into a generic kit would make the next country a refactor of all
 * three; a prop makes it one argument at each call site.
 *
 * What this control does NOT do is decide whether a number is valid. It strips
 * formatting and returns national digits; the server stays the authority
 * (`apps/identity/phone.py`, E.164 with an IN default region). Two validators
 * that disagree is how the `+91` problem started.
 */

export interface PhoneCountry {
  /** ISO 3166-1 alpha-2. Also the default region the server parses against. */
  code: string;
  /** Spoken name, used in the screen-reader description. */
  name: string;
  /** E.164 calling code, rendered with the plus. */
  dialCode: string;
  /** How many digits a national number holds, used to recognise a pasted code. */
  nationalLength: number;
}

export const PHONE_COUNTRIES = {
  IN: { code: "IN", name: "India", dialCode: "+91", nationalLength: 10 },
} as const satisfies Record<string, PhoneCountry>;

/**
 * Reduce anything a user types or pastes to national digits.
 *
 * ```
 * "9900000077"        -> "9900000077"    already national
 * "+91 99000 00077"   -> "9900000077"    dial code stripped
 * "919900000077"      -> "9900000077"    dial code without the plus
 * "0 99000 00077"     -> "9900000077"    domestic trunk prefix
 * "9199000077"        -> "9199000077"    a 10-digit number that *starts* with 91
 * ```
 *
 * That last case is why the length check is `> nationalLength` and not
 * `>=`: a ten-digit national number beginning `91` is a real number, not a
 * pasted country code, and stripping it would silently corrupt the input.
 *
 * Anything still too long is returned as-is rather than truncated. A truncated
 * number looks valid and fails later, which is the failure mode this whole
 * component exists to remove.
 */
export function toNationalDigits(raw: string, country: PhoneCountry): string {
  const digits = raw.replace(/\D/g, "");
  const dial = country.dialCode.replace(/\D/g, "");

  if (digits.length > country.nationalLength) {
    if (digits.startsWith(dial)) return digits.slice(dial.length);
    if (digits.startsWith("0")) return digits.slice(1);
  }

  return digits;
}

/** The wire format the server parses. Send this rather than the raw field value. */
export function toE164(raw: string, country: PhoneCountry): string {
  return `${country.dialCode}${toNationalDigits(raw, country)}`;
}

export interface PhoneFieldProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "id" | "type" | "inputMode" | "value" | "onChange" | "maxLength"
  > {
  /** Overrides the id from Field. Only needed for a control outside a Field. */
  id?: string;
  /** National digits without the country code. Normalise through `toNationalDigits`. */
  value: string;
  /**
   * Receives already-normalised national digits, so a call site cannot forget
   * to strip a pasted `+91`. Deliberately not `onChange`: the value the caller
   * stores is not the value the DOM held.
   */
  onValueChange: (national: string) => void;
  defaultCountry?: PhoneCountry;
  /**
   * Whether to paint the input with the kit's control chrome. Pass `false` when
   * embedding into a surface that still styles its own controls, so this field
   * does not arrive looking different from the inputs beside it. Call sites that
   * pass `false` style the input through `className`.
   */
  chrome?: boolean;
  /** React 19 passes `ref` as an ordinary prop; declared so focus can be moved between steps. */
  ref?: Ref<HTMLInputElement>;
}

export function PhoneField({
  id,
  ref,
  value,
  onValueChange,
  defaultCountry = PHONE_COUNTRIES.IN,
  chrome = true,
  className,
  ...props
}: PhoneFieldProps) {
  const field = useFieldContext();
  const country = defaultCountry;
  const controlId = id ?? field?.controlId;
  // The dial code is conveyed by a visually hidden span rather than by the
  // visible chip, because the chip is not part of the input's accessible name
  // and a screen reader user tabbing here would otherwise never learn that the
  // country code is already applied.
  const codeId = `${controlId ?? "phone"}-country-code`;
  const describedBy =
    [field?.descriptionId, field?.errorId, codeId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex items-stretch">
      {/* The chip must not carry `w-full` from the control chrome, or it takes the
          whole row and squeezes the input to nothing. Heights come from
          `items-stretch`, so it follows whatever height the input resolves to. */}
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center rounded-l-control rounded-r-none border border-r-0 px-3",
          "text-base select-none",
          chrome
            ? "border-line-strong bg-surface text-text-secondary"
            : "border-slate-200 bg-white text-slate-500",
          field?.invalid && (chrome ? "border-danger-text bg-danger-surface" : "border-rose-300"),
        )}
      >
        {country.dialCode}
      </span>
      <span id={codeId} className="sr-only">
        {country.name} country code {country.dialCode}
      </span>
      <input
        ref={ref}
        id={controlId}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={value}
        onChange={(event) => onValueChange(toNationalDigits(event.target.value, country))}
        aria-invalid={field?.invalid || undefined}
        aria-describedby={describedBy}
        required={field?.required}
        // No `maxLength`: the browser applies it to pastes too, which would cut
        // "+91 99000 00088" down to "+91 99000" before this component ever sees
        // it. Length is enforced by normalising here and validating upstream.
        className={cn(
          chrome ? controlChrome : "w-full bg-white",
          "rounded-l-none py-2.5",
          className,
        )}
        {...props}
      />
    </div>
  );
}
