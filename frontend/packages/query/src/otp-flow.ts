"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiNetworkError, ApiRequestError, type ApiClient } from "@vsolve/api-client";

import { getTabChannel } from "./cross-tab";
import {
  useLogout,
  useRequestOtp,
  useVerifyOtp,
  type AuthenticatedSession,
} from "./session";

/**
 * The OTP login flow, without any markup.
 *
 * Django owns every authentication decision here; this hook owns only the three
 * things a screen cannot get from a single mutation:
 *
 *   1. Which step the person is on, and what they are allowed to do on it.
 *   2. The two countdowns the server authored — resend cooldown and code expiry.
 *   3. Honest failure copy for a backend that deliberately refuses to say which
 *      OTP condition failed.
 *
 * Split from the markup for the same reason `ErrorState` is: the design system
 * must not depend on the data layer. The returned object is deliberately
 * prop-shaped, so a screen composes the two halves with a spread:
 *
 * ```tsx
 * const flow = useOtpFlow(getApiClient(), { onAuthenticated: resumeBooking });
 * return <OtpForm {...flow} heading="Log in to continue" />;
 * ```
 *
 * Nothing about the code is persisted. The code, the challenge id and the
 * development code live in component state for the lifetime of the attempt and
 * are never written to storage or logged.
 */

export type OtpPhase = "phone" | "code" | "authenticated";

/** A failure that belongs in a banner rather than under a field. */
export interface OtpFailure {
  kind: "rate_limited" | "delivery_unavailable" | "no_account_for_role" | "network" | "unexpected";
  title: string;
  message: string;
  severity: "error" | "warning";
  /** Backend correlation id, when Django produced one. */
  reference: string | null;
}

export interface OtpFlowOptions {
  /**
   * Stable per-install identifier, when the app has one. Django uses it to name
   * the device in the session list. Never a fingerprint the person cannot clear.
   */
  deviceIdentifier?: string;
  /** Human-readable device name shown in "your devices". */
  deviceLabel?: string;
  /**
   * Digits required before this hook will spend a request.
   *
   * Django validates with libphonenumber against region IN and remains the only
   * authority; this exists so an obviously incomplete number does not consume
   * one of the five OTPs a phone number is allowed per window.
   */
  minimumPhoneDigits?: number;
  /**
   * Code length to assume *before* Django has issued a challenge.
   *
   * Contract 1.3.0 publishes `OtpIssued.code_length`, so once a code has been
   * requested the server's value is used and this is ignored. It only covers the
   * phone step, where no challenge exists yet and the description still has to
   * say how many digits are coming.
   */
  codeLength?: number;
  /**
   * Asks Django to refuse the request up front when this number holds no such
   * account, instead of sending a code nobody can use to sign in anywhere.
   *
   * Omit for self-service sign-in (the Customer app): there, "no account yet"
   * is not a failure, it is the first login. Only pass this where an account
   * can only exist because someone already applied — today, `"partner"`.
   */
  intendedRole?: "partner";
  /** Called once Django has established the session cookie. */
  onAuthenticated?: (session: AuthenticatedSession) => void;
  /**
   * Pre-filled phone number (e.g. from hero input or query string).
   */
  initialPhone?: string;
}

function countDigits(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

const INDIAN_MOBILE_DIGITS = 10;

function capIndianMobileDigits(digitsOnly: string, hasLeadingPlus = false): string {
  if (hasLeadingPlus && digitsOnly.startsWith("91")) {
    return digitsOnly.slice(2, 2 + INDIAN_MOBILE_DIGITS);
  }
  if (digitsOnly.startsWith("91") && digitsOnly.length > INDIAN_MOBILE_DIGITS) {
    return digitsOnly.slice(2, 2 + INDIAN_MOBILE_DIGITS);
  }
  return digitsOnly.slice(0, INDIAN_MOBILE_DIGITS);
}

/** Keeps only what a phone field can legally contain, so paste is forgiving. */
export function sanitizePhoneInput(value: string): string {
  const compact = value.replace(/[^\d+\s-]/g, "").trimStart();
  const normalized = compact.startsWith("+")
    ? `+${compact.slice(1).replace(/\+/g, "")}`
    : compact.replace(/\+/g, "");

  const digitsOnly = (normalized.match(/\d/g) ?? []).join("");
  const cappedDigits = capIndianMobileDigits(digitsOnly, normalized.startsWith("+"));

  if (normalized.startsWith("+")) {
    return cappedDigits;
  }

  let digits = 0;
  let out = "";
  for (const ch of normalized) {
    if (/\d/.test(ch)) {
      if (digits >= INDIAN_MOBILE_DIGITS) continue;
      digits += 1;
    }
    out += ch;
  }
  return out;
}

/** Codes are digits only. Autofill from an SMS often arrives with spaces. */
export function sanitizeCodeInput(value: string, codeLength: number): string {
  return (value.match(/\d/g) ?? []).join("").slice(0, codeLength);
}

/**
 * Turns a thrown error into the OTP screen's own copy.
 *
 * Deliberately not `describeError`. Django's error envelope sets `message` to
 * the HTTP status phrase, so the generic path would show a customer the words
 * "Bad Request" during login. Until the contract publishes customer-safe
 * messages (see the handoff note), authentication copy is authored here.
 */
export function describeOtpFailure(error: unknown): OtpFailure {
  if (error instanceof ApiRequestError) {
    const code = error.code.toLowerCase();
    const reference = error.requestId;

    if (error.status === 429 || code === "throttled") {
      return {
        kind: "rate_limited",
        title: "Too many code requests",
        message:
          "Too many codes have been requested for this number. " +
          "Wait a little before trying again.",
        severity: "warning",
        reference,
      };
    }

    if (code === "no_account_for_role") {
      return {
        kind: "no_account_for_role",
        title: "No Partner account found",
        message:
          "We could not find a Partner account for this number. Apply to " +
          "become a Partner, or sign in with the number your Partner " +
          "account uses.",
        severity: "error",
        reference,
      };
    }

    if (error.status === 503 || code === "otp_unavailable") {
      return {
        kind: "delivery_unavailable",
        title: "We could not send a code",
        message:
          "Sending codes is temporarily unavailable. Nothing has been created " +
          "for you. Please try again shortly.",
        severity: "error",
        reference,
      };
    }

    return {
      kind: "unexpected",
      title: "That did not go through",
      message: "We could not complete that step. Please try again.",
      severity: "error",
      reference,
    };
  }

  if (error instanceof ApiNetworkError) {
    return {
      kind: "network",
      title: "Connection lost",
      message:
        "We could not reach Vsolve Hub. Nothing was submitted. " +
        "Check your connection and try again.",
      severity: "error",
      reference: null,
    };
  }

  return {
    kind: "unexpected",
    title: "Something went wrong",
    message: "We could not complete that step. Please try again.",
    severity: "error",
    reference: null,
  };
}

/**
 * Pulls a field message out of the envelope, tolerating both shapes Django
 * emits: a plain string list, and DRF's `{message, code}` objects.
 */
function fieldMessage(error: unknown, field: string): string | null {
  if (!(error instanceof ApiRequestError)) return null;
  const messages = error.fieldErrors[field];
  return messages?.[0] ?? null;
}

/** Seconds left until `deadlineMs`, never negative. */
function secondsUntil(deadlineMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
}

/**
 * Ticks a deadline down to zero.
 *
 * The value is derived from the deadline on every render rather than
 * decremented on every tick, so a tab the browser stopped scheduling catches up
 * the moment it is foregrounded instead of reporting a countdown that is
 * minutes behind. The interval exists only to force the re-render.
 *
 * The deadlines are server-authored *durations*, so no clock calibration is
 * involved — an offset between the device clock and Django cannot distort a
 * relative countdown.
 */
function useCountdown(deadlineMs: number | null): number {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (deadlineMs === null || deadlineMs <= Date.now()) return;

    const timer = setInterval(() => {
      setTick((tick) => tick + 1);
      if (Date.now() >= deadlineMs) clearInterval(timer);
    }, 1000);

    return () => clearInterval(timer);
  }, [deadlineMs]);

  return deadlineMs === null ? 0 : secondsUntil(deadlineMs);
}

export interface OtpFlow {
  phase: OtpPhase;

  phone: string;
  onPhoneChange: (value: string) => void;
  code: string;
  onCodeChange: (value: string) => void;

  onRequestCode: () => void;
  onVerifyCode: () => void;
  onResendCode: () => void;
  onChangeNumber: () => void;
  onLogout: () => void;

  canRequest: boolean;
  canVerify: boolean;
  isRequesting: boolean;
  isVerifying: boolean;
  isLoggingOut: boolean;

  /** Seconds until another code may be requested. `0` means resend is allowed. */
  resendInSeconds: number;
  /** Seconds until the issued code expires, or `null` before one is issued. */
  expiresInSeconds: number | null;
  isExpired: boolean;

  phoneError: string | null;
  codeError: string | null;
  failure: OtpFailure | null;

  /** The phone number Django confirmed, once authenticated. */
  signedInPhone: string | null;
  /**
   * Only ever non-null when Django is running with development OTP delivery.
   * In production the field is `null` and nothing is rendered.
   */
  developmentCode: string | null;
  codeLength: number;

  /** Returns to a clean, unauthenticated phone step. */
  reset: () => void;
}

export function useOtpFlow(apiClient: ApiClient, options: OtpFlowOptions = {}): OtpFlow {
  const {
    deviceIdentifier,
    deviceLabel,
    minimumPhoneDigits = 10,
    codeLength: fallbackCodeLength = 6,
    intendedRole,
    onAuthenticated,
    initialPhone = "",
  } = options;

  const [phase, setPhase] = useState<OtpPhase>("phone");
  /**
   * The length Django published with the current challenge.
   *
   * Server value beats the local default: a deployment that changes
   * `OTP_CODE_LENGTH` must not silently truncate a pasted code or leave the
   * Verify button disabled on a complete one.
   */
  const [issuedCodeLength, setIssuedCodeLength] = useState<number | null>(null);
  const [phone, setPhone] = useState(initialPhone);

  useEffect(() => {
    if (initialPhone && phase === "phone") {
      setPhone((current) => current || initialPhone);
    }
  }, [initialPhone, phase]);
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null);
  const [signedInPhone, setSignedInPhone] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [failure, setFailure] = useState<OtpFailure | null>(null);

  // Deadlines, not remaining seconds: state that survives a re-render without
  // being recomputed, and the only thing the countdowns read.
  const [resendDeadlineMs, setResendDeadlineMs] = useState<number | null>(null);
  const [expiryDeadlineMs, setExpiryDeadlineMs] = useState<number | null>(null);

  /**
   * The number the current cooldown belongs to. Django rate-limits per phone
   * number, so editing to a different number is not subject to the previous
   * number's cooldown and must not be blocked by it.
   */
  const cooldownPhoneRef = useRef<string | null>(null);

  const requestOtp = useRequestOtp(apiClient);
  const verifyOtp = useVerifyOtp(apiClient);
  const logout = useLogout(apiClient);

  const codeLength = issuedCodeLength ?? fallbackCodeLength;

  const resendInSeconds = useCountdown(resendDeadlineMs);
  const expiresInSeconds = useCountdown(expiryDeadlineMs);
  const isExpired = expiryDeadlineMs !== null && expiresInSeconds === 0;

  // Held in a ref so an inline callback at the call site does not rebuild the
  // verify handler on every render, and cannot go stale either.
  const onAuthenticatedRef = useRef(onAuthenticated);
  useEffect(() => {
    onAuthenticatedRef.current = onAuthenticated;
  }, [onAuthenticated]);

  const issue = useCallback(
    (phoneNumber: string) => {
      setFailure(null);
      setPhoneError(null);
      setCodeError(null);

      requestOtp.mutate(
        {
          phone_number: phoneNumber,
          ...(deviceIdentifier ? { device_identifier: deviceIdentifier } : {}),
          // Generated as non-optional because the field carries a server-side
          // default; sent explicitly here so a caller that doesn't ask for a
          // role check still gets Customer's ordinary self-service sign-in.
          intended_role: intendedRole ?? "",
        },
        {
          onSuccess: (issued) => {
            const now = Date.now();
            setChallengeId(issued.challenge_id);
            setIssuedCodeLength(issued.code_length);
            setDevelopmentCode(issued.development_code);
            setResendDeadlineMs(now + issued.resend_after_seconds * 1000);
            setExpiryDeadlineMs(now + issued.expires_in_seconds * 1000);
            cooldownPhoneRef.current = phoneNumber;
            setCode("");
            setPhase("code");
          },
          onError: (error) => {
            const invalidPhone = fieldMessage(error, "phone_number");
            if (invalidPhone) {
              setPhoneError(invalidPhone);
              return;
            }
            setFailure(describeOtpFailure(error));
          },
        },
      );
    },
    [deviceIdentifier, intendedRole, requestOtp],
  );

  const onPhoneChange = useCallback((value: string) => {
    const next = sanitizePhoneInput(value);
    setPhone(next);
    setPhoneError(null);
    setFailure(null);

    // Editing away from the throttled number clears its cooldown; Django's
    // limit follows the number, not the browser.
    if (cooldownPhoneRef.current !== null && next !== cooldownPhoneRef.current) {
      cooldownPhoneRef.current = null;
      setResendDeadlineMs(null);
    }
  }, []);

  const onCodeChange = useCallback(
    (value: string) => {
      setCode(sanitizeCodeInput(value, codeLength));
      setCodeError(null);
      setFailure(null);
    },
    [codeLength],
  );

  const hasEnoughDigits = countDigits(phone) >= minimumPhoneDigits;
  // One rule for the first code and every later one. The cooldown belongs to the
  // phone number, so stepping back to edit it does not earn an extra request.
  const canRequest = hasEnoughDigits && !requestOtp.isPending && resendInSeconds === 0;
  const canVerify =
    challengeId !== null && code.length === codeLength && !verifyOtp.isPending && !isExpired;

  const onRequestCode = useCallback(() => {
    if (!hasEnoughDigits) {
      setPhoneError(`Enter your ${minimumPhoneDigits}-digit mobile number.`);
      return;
    }
    if (requestOtp.isPending || resendInSeconds > 0) return;
    issue(phone);
  }, [
    hasEnoughDigits,
    issue,
    minimumPhoneDigits,
    phone,
    requestOtp.isPending,
    resendInSeconds,
  ]);

  /**
   * The same command under the name the code step uses. Deliberately not a
   * separate implementation: "send" and "resend" differ only in what the screen
   * calls them, and giving resend its own path is how a second one quietly ends
   * up without the cooldown guard.
   */
  const onResendCode = onRequestCode;

  const onVerifyCode = useCallback(() => {
    if (challengeId === null) return;
    if (isExpired) {
      setCodeError("That code has expired. Request a new one.");
      return;
    }
    if (code.length !== codeLength) {
      setCodeError(`Enter the ${codeLength}-digit code we sent you.`);
      return;
    }
    if (verifyOtp.isPending) return;

    setFailure(null);
    setCodeError(null);

    verifyOtp.mutate(
      {
        challenge_id: challengeId,
        phone_number: phone,
        code,
        ...(deviceIdentifier ? { device_identifier: deviceIdentifier } : {}),
        ...(deviceLabel ? { device_label: deviceLabel } : {}),
      },
      {
        onSuccess: (session) => {
          setPhase("authenticated");
          setSignedInPhone(session.user.phone_number);
          // The code is single-use and now spent. Drop it and the challenge so
          // neither can be resubmitted or read out of React state.
          setCode("");
          setChallengeId(null);
          setIssuedCodeLength(null);
          setDevelopmentCode(null);
          setExpiryDeadlineMs(null);
          setResendDeadlineMs(null);
          cooldownPhoneRef.current = null;
          onAuthenticatedRef.current?.(session);
        },
        onError: (error) => {
          const invalidCode = fieldMessage(error, "code");
          if (invalidCode) {
            setCodeError(invalidCode);
            return;
          }
          // Django answers 400 `invalid_otp` for a wrong code, an expired
          // challenge and a locked-out challenge alike, on purpose — saying
          // which one would help an attacker. The copy has to cover all three
          // and still leave a way forward.
          if (error instanceof ApiRequestError && error.status === 400) {
            setCodeError(
              "That code is not right, or it has expired. " +
                "Check the code, or request a new one.",
            );
            return;
          }
          setFailure(describeOtpFailure(error));
        },
      },
    );
  }, [challengeId, code, codeLength, deviceIdentifier, deviceLabel, isExpired, phone, verifyOtp]);

  const onChangeNumber = useCallback(() => {
    setPhase("phone");
    setCode("");
    setChallengeId(null);
    setIssuedCodeLength(null);
    setDevelopmentCode(null);
    setExpiryDeadlineMs(null);
    setCodeError(null);
    setFailure(null);
    // The resend cooldown is deliberately kept: it belongs to the number, and
    // coming back to the same number must not hand out a free extra request.
  }, []);

  const reset = useCallback(() => {
    setPhase("phone");
    setPhone("");
    setCode("");
    setChallengeId(null);
    setIssuedCodeLength(null);
    setDevelopmentCode(null);
    setSignedInPhone(null);
    setPhoneError(null);
    setCodeError(null);
    setFailure(null);
    setResendDeadlineMs(null);
    setExpiryDeadlineMs(null);
    cooldownPhoneRef.current = null;
  }, []);

  /**
   * A logout in a sibling tab ends this tab's session too — the cookie is
   * shared. Continuing to show "logged in as" would be a claim about server
   * state that is already false, and the next action would fail with a 401 in
   * the middle of whatever the person was doing.
   */
  useEffect(() => {
    if (phase !== "authenticated") return;

    return getTabChannel().subscribe((message) => {
      if (message.type === "session.logout") reset();
    });
  }, [phase, reset]);

  const onLogout = useCallback(() => {
    if (logout.isPending) return;
    logout.mutate(undefined, {
      // Reset on either outcome: `useLogout` clears the cache and tells sibling
      // tabs, and leaving a "signed in as" summary on screen after a failed
      // logout would be the one claim this screen must never make wrongly.
      onSettled: () => reset(),
    });
  }, [logout, reset]);

  return {
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
    isRequesting: requestOtp.isPending,
    isVerifying: verifyOtp.isPending,
    isLoggingOut: logout.isPending,
    resendInSeconds,
    expiresInSeconds: expiryDeadlineMs === null ? null : expiresInSeconds,
    isExpired,
    phoneError,
    codeError,
    failure,
    signedInPhone,
    developmentCode,
    codeLength,
    reset,
  };
}
