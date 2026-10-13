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
}: {
  phone: string;
  onPhoneChange: (value: string) => void;
  phoneError?: string | null;
  codeLength?: number;
}) {
  return (
    <div className="flex flex-col">
      <label htmlFor="login-phone-input" className="sr-only">
        Mobile number
      </label>
      <div
        className={cn(
          "flex h-[50px] sm:h-[52px] items-stretch overflow-hidden rounded-xl border bg-white transition-all duration-200",
          phoneError
            ? "border-danger ring-2 ring-danger/20"
            : "border-[#E2E8F0] focus-within:border-[#EA580C] focus-within:ring-2 focus-within:ring-[#EA580C]/20",
        )}
      >
        <span
          className="flex items-center gap-1.5 border-r border-[#E2E8F0] bg-[#F8F6F2] px-3.5 select-none"
          title="India (+91)"
        >
          <span className="text-[13px] font-bold text-navy-900">IN</span>
          <span className="text-[14px] font-bold text-navy-900">+91</span>
          <svg viewBox="0 0 12 12" aria-hidden className="size-3 text-[#64748B]">
            <path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        <input
          id="login-phone-input"
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
          onChange={(event) => onPhoneChange(event.target.value.replace(/\D/g, ""))}
          aria-invalid={Boolean(phoneError)}
          aria-describedby={phoneError ? "login-phone-error" : undefined}
          className="flex-1 border-0 bg-transparent px-3.5 text-[16px] font-medium text-navy-900 placeholder:text-[#94A3B8] focus:outline-none"
        />
      </div>
      {phoneError ? (
        <p id="login-phone-error" role="alert" className="mt-1.5 text-xs font-semibold text-danger">
          {phoneError}
        </p>
      ) : null}
    </div>
  );
}

function CustomerLoginForm({
  flow,
  verifyLabel = "Verify and continue",
  mobileFocused = false,
}: {
  flow: OtpFlow;
  verifyLabel?: string;
  mobileFocused?: boolean;
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
        <form className="flex flex-col gap-4" onSubmit={submitPhone} noValidate>
          <LoginPhoneField
            phone={flow.phone}
            onPhoneChange={flow.onPhoneChange}
            phoneError={flow.phoneError}
          />

          {!mobileFocused && variant === "page" ? (
            <div className="hidden lg:block">
              <LoginReferralInput />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!flow.canRequest || flow.isRequesting}
            className={cn(
              "flex h-[50px] sm:h-[52px] w-full items-center justify-center rounded-xl text-[15px] sm:text-[16px] font-bold text-white transition-all duration-200",
              "bg-[#EA580C] hover:bg-[#D94E07] active:scale-[0.99] shadow-sm",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EA580C]",
              (!flow.canRequest || flow.isRequesting) &&
                "opacity-50 cursor-not-allowed hover:bg-[#EA580C] active:scale-100 shadow-none",
            )}
          >
            {flow.isRequesting ? (
              <span className="flex items-center gap-2">
                <svg className="size-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                <span>Sending code…</span>
              </span>
            ) : (
              <span>Send code →</span>
            )}
          </button>
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
            className="min-h-12 rounded-xl bg-[#EA580C] hover:bg-[#D94E07] text-white font-bold text-[15px] shadow-sm disabled:opacity-50 disabled:hover:bg-[#EA580C] transition-all"
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
  const isModal = variant === "modal";

  const formPanel = (
    <section
      aria-label="Login with mobile number"
      className={cn(
        "relative flex min-h-0 flex-col bg-white",
        mobileFocused || isModal
          ? "p-5 sm:p-7"
          : "min-h-0 flex-1 overflow-y-auto px-6 py-7 sm:px-8 sm:py-8 lg:w-1/2 lg:px-10 lg:py-10",
      )}
    >
      <header className="flex items-center justify-between">
        <h1 className="sr-only">Log in to V Solve Hub</h1>
        <Logo className="h-7 w-auto" />
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close login dialog"
            className="inline-flex size-8.5 shrink-0 items-center justify-center rounded-full bg-[#F4F1EC] text-[#64748B] hover:bg-[#EAE4DC] hover:text-navy-900 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EA580C]"
          >
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="size-4"
            >
              <path d="M5 5l10 10M15 5l-10 10" />
            </svg>
          </button>
        ) : null}
      </header>

      <div className="mt-6 mb-6">
        {flow.phase === "phone" ? (
          <>
            <h2 className="text-[22px] sm:text-[24px] font-bold tracking-tight text-navy-900 leading-tight">
              Enter your mobile number
            </h2>
            <p className="mt-1.5 text-[14px] text-[#64748B] leading-normal">
              We’ll send you a 6-digit code to continue.
            </p>
          </>
        ) : flow.phase === "code" ? (
          <>
            <h2 className="text-[22px] sm:text-[24px] font-bold tracking-tight text-navy-900 leading-tight">
              Verify your number
            </h2>
            <p className="mt-1.5 text-[14px] text-[#64748B] leading-normal">
              Enter the 6-digit code sent to{" "}
              <span data-numeric className="font-semibold text-navy-900">
                {flow.phone}
              </span>
              .
            </p>
          </>
        ) : (
          <>
            <h2 className="text-[22px] sm:text-[24px] font-bold tracking-tight text-navy-900 leading-tight">
              Signed in
            </h2>
            <p className="mt-1.5 text-[14px] text-[#64748B] leading-normal">
              You are currently signed in.
            </p>
          </>
        )}
      </div>

      <CustomerLoginForm flow={flow} mobileFocused={mobileFocused} />

      {footer && flow.phase === "phone" ? <div className="mt-4">{footer}</div> : null}
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
    </div>
  );
}
