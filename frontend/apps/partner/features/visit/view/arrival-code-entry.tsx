"use client";

import { Button, Field, Input } from "@vsolve/ui";
import { useState, type FormEvent } from "react";

/**
 * The code the customer reads out, typed in on the vendor's own phone.
 *
 * ## Why this is the primary way to start a visit
 *
 * Arrival used to be a button either party could press from anywhere, which
 * proved nothing — and the A5 plan is money the customer already paid for
 * somebody to travel, so "did they turn up" is a financial question. The code
 * only moves between two people standing together, and that is the whole point
 * of it. There is no tap-only bypass: the code is the proof that both people
 * are at the site together.
 *
 * ## Why it is not the shared `OtpForm`
 *
 * That component is the login flow: a phone step, a resend timer, a change-number
 * affordance and an authenticated phase. None of it applies here. The vendor
 * requests nothing — the customer holds the code — so the only thing this needs
 * is one field and one button, and reusing a login form would put four controls
 * on screen that do nothing.
 *
 * ## Why the field is not cleared on a wrong code
 *
 * A vendor standing in somebody's hallway who mistypes one digit should fix that
 * digit, not retype six. The attempt budget is small and spent server-side, so
 * making them start over is how a typo costs them one of five tries and then
 * another.
 */

export interface ArrivalCodeEntryProps {
  onSubmit: (code: string) => void;
  isSubmitting: boolean;
  /** The server's refusal for the last attempt, already turned into a sentence. */
  error?: string | null;
  /** Matches the server's `OTP_CODE_LENGTH`. */
  codeLength?: number;
}

export function ArrivalCodeEntry({
  onSubmit,
  isSubmitting,
  error = null,
  codeLength = 6,
}: ArrivalCodeEntryProps) {
  const [code, setCode] = useState("");
  // Digits only, and trimmed to length as they type. A vendor reading a code
  // aloud from across a room pastes and fat-fingers in equal measure, and the
  // server refuses anything that is not the right shape anyway — refusing it
  // here costs one of their five attempts less.
  const cleaned = code.replace(/\D/g, "").slice(0, codeLength);
  const canSubmit = cleaned.length === codeLength && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(cleaned);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field
        label="Arrival code"
        showOptional={false}
        description={`Ask the customer for the ${codeLength}-digit code on their screen. Entering it starts the visit.`}
        error={error ?? undefined}
      >
        <Input
          value={cleaned}
          onChange={(event) => setCode(event.target.value)}
          // `inputMode` rather than `type="number"`, which brings spinners, drops
          // leading zeros and lets a code be scrolled up and down by accident.
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={codeLength}
          placeholder={"0".repeat(codeLength)}
          // Read aloud digit by digit, so it is set that way too.
          className="text-lg tracking-[0.3em]"
          aria-invalid={error !== null ? true : undefined}
        />
      </Field>

      <Button
        type="submit"
        disabled={!canSubmit}
        loading={isSubmitting}
        loadingLabel="Starting the visit"
      >
        I&rsquo;ve arrived
      </Button>
    </form>
  );
}
