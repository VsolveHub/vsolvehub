"use client";

import type { OtpFlow } from "@vsolve/query";
import { Button, ErrorState, Field, Input, Logo, cn, formatDuration } from "@vsolve/ui";
import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { LoginReferralInput } from "./login-referral-input";

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <path
        d="M10 2.5 4 5v5c0 3.5 2.6 6.8 6 7.5 3.4-.7 6-4 6-7.5V5l-6-2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m7.5 10 1.75 1.75L12.5 8.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h7A2.5 2.5 0 0 1 16 5.5v5A2.5 2.5 0 0 1 13.5 13H8l-3.5 2.5V13H6.5A2.5 2.5 0 0 1 4 10.5v-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <circle cx="10" cy="7" r="2.75" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 16.5c.8-2.4 2.6-3.75 5-3.75s4.2 1.35 5 3.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LoginBenefits() {
  const items = [
    { icon: ShieldIcon, label: "Secure & Safe" },
    { icon: MessageIcon, label: "OTP via SMS" },
    { icon: UserIcon, label: "No Password Required" },
  ] as const;

  return (
    <ul className="grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-3">
      {items.map(({ icon: Icon, label }) => (
        <li key={label} className="flex min-w-0 items-center justify-center gap-2 sm:justify-start">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-action-surface text-action">
            <Icon className="size-4" />
          </span>
          <span className="text-[11px] font-semibold leading-tight text-navy-900">{label}</span>
        </li>
      ))}
    </ul>
  );
}

function LoginPromoPanel() {
  return (
    <aside
      aria-hidden
      className="relative hidden overflow-hidden bg-[#F7F3ED] lg:flex lg:w-1/2 lg:min-h-0 lg:shrink-0 lg:self-stretch lg:items-center lg:justify-center"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/login-promo-panel.png"
        alt=""
        loading="eager"
        decoding="sync"
        draggable={false}
        className="pointer-events-none max-h-full max-w-full select-none object-contain"
      />
    </aside>
  );
}

function LoginPhoneField({
  phone,
  onPhoneChange,
  phoneError,
  codeLength,
}: {
  phone: string;
  onPhoneChange: (value: string) => void;
  phoneError?: string | null;
  codeLength: number;
}) {
  return (
    <Field
      required
      label="Mobile number"
      description={`We will send a ${codeLength}-digit code by SMS.`}
      error={phoneError ?? undefined}
    >
      <div
        className={cn(
          "flex min-h-12 items-stretch overflow-hidden rounded-control border bg-white transition-colors",
          phoneError ? "border-danger" : "border-line focus-within:border-navy-300 focus-within:ring-2 focus-within:ring-focus-ring/20",
        )}
      >
        <span className="flex items-center gap-1.5 border-r border-line bg-surface-sunken px-3 text-sm font-semibold text-navy-900">
          <span aria-hidden>🇮🇳</span>
          <span data-numeric>+91</span>
          <svg viewBox="0 0 12 12" aria-hidden className="size-3 text-text-muted">
            <path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        <Input
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="9876543210"
          maxLength={10}
          value={phone}
          onChange={(event) => onPhoneChange(event.target.value)}
          className="min-h-12 flex-1 border-0 bg-transparent px-3 py-2 shadow-none focus:ring-0"
        />
      </div>
    </Field>
  );
}

function CustomerLoginForm({
  flow,
  verifyLabel = "Verify and continue",
}: {
  flow: OtpFlow;
  verifyLabel?: string;
}) {
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (flow.phase === "code") codeInputRef.current?.focus();
  }, [flow.phase]);

  function submitPhone(event: FormEvent) {
    event.preventDefault();
    flow.onRequestCode();
  }

  function submitCode(event: FormEvent) {
    event.preventDefault();
    flow.onVerifyCode();
  }

  return (
    <div className="flex min-w-0 flex-col">
      {flow.failure ? (
        <ErrorState
          inline
          className="mb-4"
          title={flow.failure.title}
          message={flow.failure.message}
          severity={flow.failure.severity}
          reference={flow.failure.reference}
        />
      ) : null}

      {flow.phase === "authenticated" ? (
        <div className="py-2">
          <p className="text-sm text-text-secondary">Logged in as</p>
          <p data-numeric className="text-base font-semibold text-text">
            {flow.signedInPhone}
          </p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={flow.onLogout}
            loading={flow.isLoggingOut}
            loadingLabel="Logging out"
          >
            Use a different number
          </Button>
        </div>
      ) : null}

      {flow.phase === "phone" ? (
        <form className="flex flex-col gap-5" onSubmit={submitPhone} noValidate>
          <div className="rounded-[0.85rem] border border-[#FDE6D5] bg-[#FFF7F0] px-4 py-3.5">
            <div className="flex items-start gap-2.5">
              <ShieldIcon className="mt-0.5 size-4 shrink-0 text-action" />
              <div>
                <p className="text-sm font-bold text-navy-900">Quick &amp; Secure Login</p>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                  {/* The field below already says the code comes by SMS; saying it twice
                      made two instructions out of one. */}
                  Use the mobile number you book with. No password needed.
                </p>
              </div>
            </div>
          </div>

          <LoginPhoneField
            phone={flow.phone}
            onPhoneChange={flow.onPhoneChange}
            phoneError={flow.phoneError}
            codeLength={flow.codeLength}
          />

          <LoginReferralInput />

          <Button
            type="submit"
            size="lg"
            block
            disabled={!flow.canRequest}
            loading={flow.isRequesting}
            loadingLabel="Sending code"
            className="min-h-12 rounded-control bg-navy-900 text-white hover:bg-navy-800"
          >
            Send code →
          </Button>

          <p className="flex items-center justify-center gap-2 text-center text-xs text-text-secondary">
            <ShieldIcon className="size-3.5 shrink-0 text-text-muted" />
            Your number is safe with us. We never share it with anyone.
          </p>
        </form>
      ) : null}

      {flow.phase === "code" ? (
        <form className="flex flex-col gap-4" onSubmit={submitCode} noValidate>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-sm text-text-secondary">
              Code sent to{" "}
              <span data-numeric className="font-semibold text-text">
                {flow.phone}
              </span>
            </p>
            <Button variant="ghost" size="sm" className="px-0" onClick={flow.onChangeNumber}>
              Change number
            </Button>
          </div>

          {flow.developmentCode ? (
            <p className="rounded-control border border-dashed border-line-strong px-3 py-2 text-sm text-text-secondary">
              Development delivery is on. Code:{" "}
              <span data-numeric className="font-semibold tracking-[0.2em] text-text">
                {flow.developmentCode}
              </span>
            </p>
          ) : null}

          <Field
            required
            label={`${flow.codeLength}-digit code`}
            error={flow.codeError ?? undefined}
          >
            <Input
              ref={codeInputRef}
              name="one-time-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCorrect="off"
              spellCheck={false}
              maxLength={flow.codeLength}
              value={flow.code}
              onChange={(event) => flow.onCodeChange(event.target.value)}
              className="text-center text-lg font-semibold tracking-[0.4em]"
            />
          </Field>

          {flow.isExpired ? (
            <p role="status" className="text-sm font-medium text-warning-text">
              This code has expired. Request a new one to continue.
            </p>
          ) : flow.expiresInSeconds !== null ? (
            <p aria-hidden className="text-sm text-text-secondary">
              Code expires in{" "}
              <span data-numeric className="font-semibold">
                {formatDuration(flow.expiresInSeconds * 1000)}
              </span>
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            block
            disabled={!flow.canVerify}
            loading={flow.isVerifying}
            loadingLabel="Verifying code"
            className="min-h-12 rounded-control bg-navy-900 text-white hover:bg-navy-800"
          >
            {verifyLabel}
          </Button>

          <div className="flex justify-center">
            {flow.resendInSeconds > 0 ? (
              <Button variant="ghost" size="sm" disabled>
                <span aria-hidden>
                  Resend code in {formatDuration(flow.resendInSeconds * 1000)}
                </span>
                <span className="sr-only">
                  Resend code, available in {flow.resendInSeconds} seconds
                </span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={flow.onResendCode}
                loading={flow.isRequesting}
                loadingLabel="Sending a new code"
              >
                Resend code
              </Button>
            )}
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function CustomerLoginExperience({
  flow,
  onClose,
  variant = "page",
  mobileFocused = false,
  footer,
}: {
  flow: OtpFlow;
  onClose?: () => void;
  variant?: "page" | "modal";
  /** Dedicated single-column mobile auth shell — no promo panel or benefit strip. */
  mobileFocused?: boolean;
  footer?: ReactNode;
}) {
  const formPanel = (
    <section
      className={cn(
        "relative flex min-h-0 flex-col",
        mobileFocused
          ? "px-5 py-5"
          : "min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8 lg:w-1/2 lg:px-10 lg:py-9",
      )}
    >
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line/70 bg-white text-text-secondary shadow-2xs hover:bg-surface-hover hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:right-5 sm:top-5 lg:right-6 lg:top-6"
        >
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            className="size-5"
          >
            <path d="M6 6l8 8M14 6l-8 8" />
          </svg>
        </button>
      ) : null}

      <header
        className={cn(
          "flex flex-col",
          onClose ? "items-center text-center pr-12" : "items-start",
          mobileFocused ? "pt-1" : onClose ? "pt-2 lg:pt-4" : "",
        )}
      >
        <h1 className="sr-only">Log in to V Solve Hub</h1>
        <Logo className="mb-3 h-7 w-auto" />
        <p className="text-sm leading-relaxed text-text-secondary">
          Verify your mobile number to view bookings and checkout
        </p>
      </header>

      <div className={cn("h-px bg-line", mobileFocused ? "my-4" : "my-5 lg:my-6")} aria-hidden />

      <CustomerLoginForm flow={flow} />

      {footer ? <div className="mt-4 text-sm leading-relaxed text-text-secondary">{footer}</div> : null}
    </section>
  );

  if (mobileFocused) {
    return formPanel;
  }

  return (
    <div
      className={cn(
        "flex w-full min-h-0 flex-col overflow-hidden bg-white",
        "lg:max-h-[calc(100dvh-2rem)] lg:flex-row lg:items-stretch",
        variant === "page" && "rounded-[2rem] shadow-xl",
      )}
    >
      <LoginPromoPanel />
      {formPanel}
      {!mobileFocused ? (
        <div className="mt-6 px-5 pb-6 lg:hidden">
          <LoginBenefits />
        </div>
      ) : null}
    </div>
  );
}
