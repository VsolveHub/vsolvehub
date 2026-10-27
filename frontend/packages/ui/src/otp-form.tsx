"use client";

import { useEffect, useRef, type FormEvent, type ReactNode } from "react";

import { Button } from "./button";
import { cn } from "./cn";
import { ErrorState, type ErrorSeverity } from "./error-state";
import { Field } from "./field";
import { Input } from "./input";
import { useTOrDefault } from "./i18n";
import { formatDuration } from "./readout";

/**
 * The OTP login form.
 *
 * Presentational, like `ErrorState`: it takes plain props rather than importing
 * `@vsolve/query`, so the design system stays free of the data layer. Pair it
 * with `useOtpFlow`, whose return value is prop-shaped:
 *
 * ```tsx
 * <OtpForm {...useOtpFlow(getApiClient())} heading="Log in to continue" />
 * ```
 *
 * Three decisions worth keeping:
 *
 * One input for the code, not six boxes. Six boxes look like a login screen and
 * behave like a trap: SMS autofill fills one, paste fills one, and a screen
 * reader reads six unlabelled fields. A single `one-time-code` input autofills
 * whole on both iOS and Android.
 *
 * The phone number stays visible on the code step. The most common failure in
 * this flow is a mistyped number, and a customer who cannot see what they typed
 * has no way to notice.
 *
 * Countdowns are not live regions. A resend timer announced every second makes
 * the screen unusable with a screen reader, so the ticking text is hidden from
 * assistive technology and the remaining time is carried in the resend button's
 * own accessible name instead.
 */

export interface OtpFormProps {
  phase: "phone" | "code" | "authenticated";

  phone: string;
  onPhoneChange: (value: string) => void;
  code: string;
  onCodeChange: (value: string) => void;

  onRequestCode: () => void;
  onVerifyCode: () => void;
  onResendCode: () => void;
  onChangeNumber: () => void;
  onLogout?: () => void;

  canRequest: boolean;
  canVerify: boolean;
  isRequesting: boolean;
  isVerifying: boolean;
  isLoggingOut?: boolean;

  /** Seconds until another code may be requested. `0` enables resend. */
  resendInSeconds: number;
  /** Seconds until the issued code expires, or `null` before one is issued. */
  expiresInSeconds: number | null;
  isExpired: boolean;

  phoneError?: string | null;
  codeError?: string | null;
  failure?: {
    title: string;
    message: string;
    severity: ErrorSeverity;
    reference: string | null;
  } | null;

  signedInPhone?: string | null;
  /** Non-null only under Django's development OTP delivery. */
  developmentCode?: string | null;
  codeLength: number;

  heading?: string;
  /** Pick the level that fits the surrounding page outline. */
  headingLevel?: 1 | 2 | 3;
  /** Sentence under the heading explaining why a login is being asked for. */
  description?: string;
  /** Label for the verify action, e.g. "Verify and continue to payment". */
  verifyLabel?: string;
  /** Rendered under the form: consent text, a support link, a "why we ask" note. */
  footer?: ReactNode;
  /**
   * Digits a complete number has. When given, a part-typed number says how many
   * are left, because "Send code" stays disabled until then and a disabled
   * button on its own does not say why.
   */
  phoneDigits?: number;
  className?: string;
}

export function OtpForm({
  phase,
  phone,
  onPhoneChange,
  code,
  onCodeChange,
  onRequestCode,
  onVerifyCode,
  onResendCode,
  onChangeNumber,
  onLogout,
  canRequest,
  canVerify,
  isRequesting,
  isVerifying,
  isLoggingOut = false,
  resendInSeconds,
  expiresInSeconds,
  isExpired,
  phoneError,
  codeError,
  failure,
  signedInPhone,
  developmentCode,
  codeLength,
  heading,
  headingLevel = 2,
  description,
  verifyLabel,
  footer,
  phoneDigits,
  className,
}: OtpFormProps) {
  const tf = useTOrDefault();
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";
  const codeInputRef = useRef<HTMLInputElement>(null);
  const typedDigits = (phone.match(/\d/g) ?? []).length;
  const digitsLeft =
    phoneDigits !== undefined && typedDigits > 0 ? phoneDigits - typedDigits : 0;
  const resolvedHeading = heading ?? tf("ui.otpForm.heading", "Log in");
  const resolvedVerifyLabel = verifyLabel ?? tf("ui.otpForm.verifyLabel", "Verify and continue");

  // Focus follows the step. Without this, someone using a keyboard or a screen
  // reader is left on the "Send code" button after the screen has moved on.
  useEffect(() => {
    if (phase === "code") codeInputRef.current?.focus();
  }, [phase]);

  function submitPhone(event: FormEvent) {
    event.preventDefault();
    onRequestCode();
  }

  function submitCode(event: FormEvent) {
    event.preventDefault();
    onVerifyCode();
  }

  return (
    <div className={cn("w-full max-w-sm", className)}>
      <Heading className="text-xl font-bold text-text sm:text-2xl">{resolvedHeading}</Heading>
      {description ? (
        <p className="mt-1.5 text-sm text-text-secondary">{description}</p>
      ) : null}

      {failure ? (
        <ErrorState
          inline
          className="mt-4"
          title={failure.title}
          message={failure.message}
          severity={failure.severity}
          reference={failure.reference}
        />
      ) : null}

      {phase === "authenticated" ? (
        <div className="mt-4">
          <p className="text-sm text-text-secondary">{tf("ui.otpForm.loggedInAs", "Logged in as")}</p>
          <p data-numeric className="text-base font-semibold text-text">
            {signedInPhone}
          </p>
          {onLogout ? (
            <Button
              variant="outline"
              className="mt-3"
              onClick={onLogout}
              loading={isLoggingOut}
              loadingLabel={tf("ui.otpForm.loggingOut", "Logging out")}
            >
              {tf("ui.otpForm.useDifferentNumber", "Use a different number")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {phase === "phone" ? (
        <form className="mt-5 flex flex-col gap-4" onSubmit={submitPhone} noValidate>
          <Field
            required
            label={tf("ui.otpForm.mobileNumber", "Mobile number")}
            description={
              digitsLeft > 0
                ? tf(
                    "ui.otpForm.digitsLeft",
                    digitsLeft === 1 ? "{count} more digit to go." : "{count} more digits to go.",
                    { count: digitsLeft },
                  )
                : tf("ui.otpForm.willSendCode", "We will send a {codeLength}-digit code by SMS.", {
                    codeLength,
                  })
            }
            error={phoneError ?? undefined}
          >
            <Input
              name="phone"
              type="tel"
              // `numeric` rather than `tel`: the telephone keypad hides the `+`
              // that an international number needs.
              inputMode="numeric"
              autoComplete="tel"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="9876543210"
              value={phone}
              onChange={(event) => onPhoneChange(event.target.value)}
            />
          </Field>

          <Button
            type="submit"
            size="lg"
            block
            disabled={!canRequest}
            loading={isRequesting}
            loadingLabel={tf("ui.otpForm.sendingCode", "Sending code")}
          >
            {tf("ui.otpForm.sendCode", "Send code")}
          </Button>
        </form>
      ) : null}

      {phase === "code" ? (
        <form className="mt-5 flex flex-col gap-4" onSubmit={submitCode} noValidate>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-sm text-text-secondary">
              {tf("ui.otpForm.codeSentTo", "Code sent to")}{" "}
              <span data-numeric className="font-semibold text-text">
                {phone}
              </span>
            </p>
            {/* `px-0!`, not `px-0`: `cn` does not merge, so the size's own
                `px-3.5` used to win and indent this under the line it belongs to.
                `min-h-11` lifts the 36px `sm` button to a phone-sized target. */}
            <Button variant="ghost" size="sm" className="min-h-11 px-0!" onClick={onChangeNumber}>
              {tf("ui.otpForm.changeNumber", "Change number")}
            </Button>
          </div>

          {developmentCode ? (
            // Django only returns this when it is configured for development
            // delivery. In every deployed environment the field is null and
            // this does not render.
            <p className="rounded-control border border-dashed border-line-strong px-3 py-2 text-sm text-text-secondary">
              {tf("ui.otpForm.developmentDelivery", "Development delivery is on. Code:")}{" "}
              <span data-numeric className="font-semibold tracking-[0.2em] text-text">
                {developmentCode}
              </span>
            </p>
          ) : null}

          <Field
            required
            label={tf("ui.otpForm.digitCode", "{codeLength}-digit code", { codeLength })}
            error={codeError ?? undefined}
          >
            <Input
              ref={codeInputRef}
              name="one-time-code"
              type="text"
              inputMode="numeric"
              // Lets iOS and Android fill the whole code from the SMS.
              autoComplete="one-time-code"
              autoCorrect="off"
              spellCheck={false}
              maxLength={codeLength}
              value={code}
              onChange={(event) => onCodeChange(event.target.value)}
              className="text-center text-lg font-semibold tracking-[0.4em]"
            />
          </Field>

          {isExpired ? (
            <p role="status" className="text-sm font-medium text-warning-text">
              {tf("ui.otpForm.expired", "This code has expired. Request a new one to continue.")}
            </p>
          ) : expiresInSeconds !== null ? (
            <p aria-hidden className="text-sm text-text-secondary">
              {tf("ui.otpForm.expiresIn", "Code expires in")}{" "}
              <span data-numeric className="font-semibold">
                {formatDuration(expiresInSeconds * 1000)}
              </span>
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            block
            disabled={!canVerify}
            loading={isVerifying}
            loadingLabel={tf("ui.otpForm.verifyingCode", "Verifying code")}
          >
            {resolvedVerifyLabel}
          </Button>

          <div className="flex justify-center">
            {resendInSeconds > 0 ? (
              <Button variant="ghost" size="sm" className="min-h-11" disabled>
                <span aria-hidden>
                  {tf("ui.otpForm.resendIn", "Resend code in {duration}", {
                    duration: formatDuration(resendInSeconds * 1000),
                  })}
                </span>
                <span className="sr-only">
                  {tf("ui.otpForm.resendInSr", "Resend code, available in {seconds} seconds", {
                    seconds: resendInSeconds,
                  })}
                </span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11"
                onClick={onResendCode}
                loading={isRequesting}
                loadingLabel={tf("ui.otpForm.sendingNewCode", "Sending a new code")}
              >
                {tf("ui.otpForm.resendCode", "Resend code")}
              </Button>
            )}
          </div>
        </form>
      ) : null}

      {footer ? <div className="mt-5 text-sm text-text-secondary">{footer}</div> : null}
    </div>
  );
}
