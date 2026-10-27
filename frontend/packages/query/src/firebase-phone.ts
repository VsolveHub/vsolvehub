"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  ApiRequestError,
  request,
  type ApiClient,
} from "@vsolve/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
// Types only. The SDK itself is imported on first use — see `loadFirebaseAuthSdk`.
import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import type { Auth, ConfirmationResult, RecaptchaVerifier } from "firebase/auth";

import { getTabChannel } from "./cross-tab";
import { queryKeys } from "./keys";
import {
  describeOtpFailure,
  sanitizeCodeInput,
  sanitizePhoneInput,
  type OtpFailure,
  type OtpFlow,
  type OtpFlowOptions,
  type OtpPhase,
  type SignInRole,
} from "./otp-flow";
import { useLogout, type AuthenticatedSession, type SessionState } from "./session";
import { publishToTabs } from "./use-tab-sync";

const INDIAN_MOBILE_DIGITS = 10;

function countDigits(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

export function formatToE164(phone: string): string {
  const digits = (phone.match(/\d/g) ?? []).join("");
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }
  if (phone.trim().startsWith("+")) {
    return `+${digits}`;
  }
  return `+91${digits}`;
}

function fieldMessage(error: unknown, field: string): string | null {
  if (!(error instanceof ApiRequestError)) return null;
  const messages = error.fieldErrors[field];
  return messages?.[0] ?? null;
}

function secondsUntil(deadlineMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
}

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

const VERIFICATION_FAILED_MESSAGE = "Verification failed. Please refresh and try again.";

function currentPageUrl(): URL | null {
  return typeof window === "undefined" ? null : new URL(window.location.href);
}

/**
 * Developer-facing reason a phone verification was refused, named by its real code.
 *
 * Firebase phone auth will not accept a reCAPTCHA token minted on a `localhost`
 * page, even when `localhost` is listed under Authorized domains — its web guide
 * says "localhost is not allowed as a hosted domain for the purposes of phone
 * auth" — and it reports that as `auth/invalid-app-credential`. 127.0.0.1 is
 * accepted, so that is where a developer is sent.
 */
function describeVerificationFailure(code: string, page: URL | null): string {
  if (code.includes("unauthorized-domain")) {
    return `${code}: ${page?.hostname ?? "This host"} is not an authorized domain. Add it under Firebase Console > Authentication > Settings > Authorized domains.`;
  }
  if (code.includes("app-check")) {
    return `${code}: App Check rejected the request. Set NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY, or stop enforcing App Check on Authentication.`;
  }
  if (page?.hostname === "localhost") {
    const loopback = new URL(page.href);
    loopback.hostname = "127.0.0.1";
    return `${code}: Firebase phone auth does not accept pages served from localhost, even when it is an authorized domain. Open ${loopback.origin}${loopback.pathname} instead, with NEXT_PUBLIC_API_BASE_URL empty (see .env.example).`;
  }
  return `${code}: Firebase rejected the reCAPTCHA token as invalid, expired or already used. Refresh and try again.`;
}

/** Error mapping for Firebase Phone Auth. Never returns raw Firebase error strings. */
export function mapFirebaseError(
  error: unknown,
  pageUrl: URL | null = currentPageUrl(),
): {
  target: "phone" | "code" | "failure";
  message: string;
  failure?: OtpFailure;
} {
  const code = (
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : ""
  ).toLowerCase();

  // The code alone, in every environment: production shows customers generic
  // copy, so this line is the only record of why a send failed. Never log the
  // error's message, which can carry the phone number, nor OTPs or tokens.
  console.error("[Firebase Auth error]", code || "unknown");

  if (code.includes("invalid-phone-number")) {
    return { target: "phone", message: "Enter a valid mobile number" };
  }

  if (code.includes("too-many-requests")) {
    return {
      target: "failure",
      message: "Too many attempts. Please try again later",
      failure: {
        kind: "rate_limited",
        title: "Too many attempts",
        message: "Too many attempts. Please try again later",
        severity: "warning",
        reference: null,
      },
    };
  }

  if (code.includes("invalid-verification-code")) {
    return { target: "code", message: "Incorrect OTP" };
  }

  if (code.includes("code-expired")) {
    return { target: "code", message: "OTP expired. Please resend" };
  }

  if (code.includes("quota-exceeded")) {
    return {
      target: "failure",
      message: "SMS limit reached. Please try again later",
      failure: {
        kind: "delivery_unavailable",
        title: "SMS limit reached",
        message: "SMS limit reached. Please try again later",
        severity: "error",
        reference: null,
      },
    };
  }

  if (code.includes("configuration-not-found")) {
    const devMsg =
      "Phone authentication is not enabled in Firebase Console. Please enable 'Phone' under Authentication > Sign-in method.";
    return {
      target: "failure",
      message:
        process.env.NODE_ENV !== "production"
          ? devMsg
          : "Authentication service is currently unavailable. Please try again later.",
      failure: {
        kind: "delivery_unavailable",
        title: "Phone Auth Not Enabled",
        message:
          process.env.NODE_ENV !== "production"
            ? devMsg
            : "Authentication service is currently unavailable. Please try again later.",
        severity: "error",
        reference: null,
      },
    };
  }

  if (code.includes("operation-not-allowed")) {
    const devMsg =
      "SMS region not enabled in Firebase Console. Go to Authentication > Settings > SMS region policy and allow India (+91), or use 'Phone numbers for testing'.";
    return {
      target: "failure",
      message:
        process.env.NODE_ENV !== "production"
          ? devMsg
          : "SMS service is unavailable in this region. Please try again later.",
      failure: {
        kind: "delivery_unavailable",
        title: "SMS Region Not Allowed",
        message:
          process.env.NODE_ENV !== "production"
            ? devMsg
            : "SMS service is unavailable in this region. Please try again later.",
        severity: "error",
        reference: null,
      },
    };
  }

  if (code.includes("billing-not-enabled") || code.includes("billing_not_enabled")) {
    const devMsg =
      "Firebase requires the Blaze (pay-as-you-go) plan to send real SMS. Upgrade in Firebase Console, or use 'Phone numbers for testing' for free.";
    return {
      target: "failure",
      message:
        process.env.NODE_ENV !== "production"
          ? devMsg
          : "SMS service is temporarily unavailable. Please try again later.",
      failure: {
        kind: "delivery_unavailable",
        title: "Firebase Billing Required",
        message:
          process.env.NODE_ENV !== "production"
            ? devMsg
            : "SMS service is temporarily unavailable. Please try again later.",
        severity: "error",
        reference: null,
      },
    };
  }

  if (
    code.includes("captcha-check-failed") ||
    code.includes("unauthorized-domain") ||
    code.includes("app-check") ||
    code.includes("recaptcha") ||
    code.includes("app-credential")
  ) {
    const message =
      process.env.NODE_ENV !== "production"
        ? describeVerificationFailure(code, pageUrl)
        : VERIFICATION_FAILED_MESSAGE;
    return {
      target: "failure",
      message,
      failure: {
        kind: "unexpected",
        title: "Verification failed",
        message,
        severity: "error",
        reference: null,
      },
    };
  }

  return {
    target: "failure",
    message: "We could not complete that step. Please try again.",
    failure: {
      kind: "unexpected",
      title: "Something went wrong",
      message: "We could not complete that step. Please try again.",
      severity: "error",
      reference: null,
    },
  };
}

/**
 * The Firebase Auth SDK, downloaded on first use.
 *
 * Every page's header mounts the phone flow for its login dialog, so a static
 * import put the Firebase SDK (~150 KB of script) on every page, for every
 * visitor — most of whom never log in. It is now fetched when someone starts
 * typing a number (`preloadFirebase`) or, at the latest, when they press Send.
 */
type FirebaseAuthSdk = typeof import("firebase/auth");

let authSdkPromise: Promise<FirebaseAuthSdk> | null = null;

function loadFirebaseAuthSdk(): Promise<FirebaseAuthSdk> {
  authSdkPromise ??= import("firebase/auth").catch((error: unknown) => {
    // A download that failed on a bad connection must not fail every later try.
    authSdkPromise = null;
    throw error;
  });
  return authSdkPromise;
}

/** Starts downloading the SDK without initializing anything. Safe to call repeatedly. */
export function preloadFirebase(): void {
  if (typeof window === "undefined" || firebaseConfig() === null) return;
  void Promise.all([
    loadFirebaseAuthSdk(),
    import("firebase/app"),
    import("firebase/app-check"),
  ]).catch(() => {
    // Send retries the download and reports a failure there.
  });
}

/** The web app's Firebase config, or `null` when this deployment has none. */
function firebaseConfig(): FirebaseOptions | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !projectId || !appId) {
    return null;
  }
  return { apiKey, authDomain, projectId, appId };
}

let appPromise: Promise<FirebaseApp> | null = null;
let authInstance: Auth | null = null;

async function initializeFirebaseApp(config: FirebaseOptions): Promise<FirebaseApp> {
  const appCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;
  const [{ initializeApp, getApps }, appCheck] = await Promise.all([
    import("firebase/app"),
    appCheckSiteKey ? import("firebase/app-check") : Promise.resolve(null),
  ]);

  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const app = initializeApp(config);

  if (appCheckSiteKey && appCheck) {
    try {
      appCheck.initializeAppCheck(app, {
        provider: new appCheck.ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Firebase App Check initialization failed:", err);
      }
    }
  }

  return app;
}

/**
 * The initialized Firebase app, or `null` when this deployment has no config.
 *
 * One shared promise, so App Check is always set up before anything else gets
 * the app, however many callers race for it.
 */
export function getFirebaseApp(): Promise<FirebaseApp | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const config = firebaseConfig();
  if (!config) return Promise.resolve(null);

  appPromise ??= initializeFirebaseApp(config).catch((error: unknown) => {
    appPromise = null;
    throw error;
  });
  return appPromise;
}

export async function getFirebaseAuth(): Promise<Auth | null> {
  if (typeof window === "undefined") return null;
  if (authInstance) return authInstance;
  if (firebaseConfig() === null) return null;

  const [app, { getAuth }] = await Promise.all([getFirebaseApp(), loadFirebaseAuthSdk()]);
  if (!app) return null;

  authInstance ??= getAuth(app);
  authInstance.languageCode = "en";
  return authInstance;
}

/**
 * A brand-new element for one RecaptchaVerifier to render into.
 *
 * Never reuse one. reCAPTCHA remembers every element it has rendered into, and
 * `clear()` on an invisible verifier leaves its widget registered, so rendering
 * into the same element again throws "reCAPTCHA has already been rendered in
 * this element" — even after emptying it. That error carries no Firebase code,
 * so every send after the first failed as "Something went wrong" until the page
 * was reloaded.
 */
function createRecaptchaHost(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const host = document.createElement("div");
  host.setAttribute("data-vsolve-recaptcha", "");
  document.body.appendChild(host);
  return host;
}

/** Clears a verifier and removes the element it was rendered into. */
function discardRecaptcha(verifier: RecaptchaVerifier, host: HTMLElement) {
  try {
    verifier.clear();
  } catch {
    // already cleared
  }
  host.remove();
}

export type FirebaseVerifyInput = {
  idToken: string;
  intendedRole?: SignInRole | "";
  referralCode?: string | null;
  deviceIdentifier?: string;
  deviceLabel?: string;
};

/**
 * Mutation for POST /api/v1/auth/firebase/verify/.
 *
 * Explicitly sets `retry: false` because Firebase ID tokens are strictly single-use:
 * any automatic retry would send an already-spent token and fail.
 */
export function useVerifyFirebase(
  apiClient: ApiClient,
): UseMutationResult<AuthenticatedSession, Error, FirebaseVerifyInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input) =>
      request(() =>
        apiClient.POST("/api/v1/auth/firebase/verify/", {
          body: {
            id_token: input.idToken,
            intended_role: input.intendedRole ?? "",
            ...(input.deviceIdentifier ? { device_identifier: input.deviceIdentifier } : {}),
            ...(input.deviceLabel ? { device_label: input.deviceLabel } : {}),
            ...(input.referralCode ? { referral_code: input.referralCode } : {}),
          },
        }),
      ),
    onSuccess: (session) => {
      queryClient.setQueryData<SessionState>(queryKeys.session.current(), {
        user: session.user,
        active_role: session.active_role,
        session_expires_at: session.session_expires_at,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.session.devices() });
      publishToTabs({ type: "session.authenticated" });
    },
    retry: false,
  });
}

/**
 * Sends a Firebase verification SMS to `phone` and resolves to the step that
 * confirms it.
 *
 * For proving the person again *inside* a session — the Operations step-up —
 * where the login flow's session handling would be wrong: the caller exchanges
 * the ID token at its own endpoint. The returned `confirm` yields a fresh,
 * single-use ID token and always signs the Firebase client back out, so the
 * Django session cookie stays the only session. Throws Firebase errors as they
 * are; `mapFirebaseError` turns them into copy.
 */
export async function startFirebasePhoneVerification(
  phone: string,
): Promise<(code: string) => Promise<string>> {
  const auth = await getFirebaseAuth();
  const host = auth ? createRecaptchaHost() : null;
  if (!auth || !host) {
    throw new Error("Phone authentication service is not configured.");
  }

  // Already downloaded by `getFirebaseAuth`; this only reads the loaded module.
  const { RecaptchaVerifier, signInWithPhoneNumber, signOut } = await loadFirebaseAuthSdk();
  const verifier = new RecaptchaVerifier(auth, host, { size: "invisible" });
  let confirmation: ConfirmationResult;
  try {
    confirmation = await signInWithPhoneNumber(auth, formatToE164(phone), verifier);
  } finally {
    // Only the send needs reCAPTCHA. A resend builds a new verifier.
    discardRecaptcha(verifier, host);
  }

  return async (code: string) => {
    try {
      const credential = await confirmation.confirm(code);
      return await credential.user.getIdToken();
    } finally {
      try {
        await signOut(auth);
      } catch {
        // Ignore signOut errors
      }
    }
  };
}

/**
 * Firebase Phone Auth flow hook matching the exact `OtpFlow` public interface.
 */
export function useFirebasePhoneFlow(
  apiClient: ApiClient,
  options: OtpFlowOptions = {},
): OtpFlow {
  const {
    deviceIdentifier,
    deviceLabel,
    getReferralCode,
    minimumPhoneDigits = INDIAN_MOBILE_DIGITS,
    intendedRole,
    onAuthenticated,
    initialPhone = "",
  } = options;

  const logout = useLogout(apiClient);
  const verifyFirebase = useVerifyFirebase(apiClient);

  const [phase, setPhase] = useState<OtpPhase>("phone");
  const [phone, setPhone] = useState(sanitizePhoneInput(initialPhone));
  const [code, setCode] = useState("");
  const [signedInPhone, setSignedInPhone] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [failure, setFailure] = useState<OtpFailure | null>(null);

  const [isRequesting, setIsRequesting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [hasVerificationInProgress, setHasVerificationInProgress] = useState(false);

  const [resendDeadlineMs, setResendDeadlineMs] = useState<number | null>(null);
  const [expiryDeadlineMs, setExpiryDeadlineMs] = useState<number | null>(null);

  const cooldownPhoneRef = useRef<string | null>(null);
  const verifierRef = useRef<{ verifier: RecaptchaVerifier; host: HTMLElement } | null>(null);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  /**
   * Bumped by `reset` and `onChangeNumber` to abandon a send still in flight.
   *
   * A send can wait forever — on a reCAPTCHA picture challenge nobody solves —
   * and the login dialog's flow outlives the dialog. Without this, closing and
   * reopening it left `isRequesting` stuck and Send silently did nothing.
   */
  const sendAttemptRef = useRef(0);

  const onAuthenticatedRef = useRef(onAuthenticated);
  useEffect(() => {
    onAuthenticatedRef.current = onAuthenticated;
  }, [onAuthenticated]);

  useEffect(() => {
    if (initialPhone && phase === "phone") {
      setPhone((current) => current || sanitizePhoneInput(initialPhone));
    }
  }, [initialPhone, phase]);

  const clearVerifier = useCallback(() => {
    if (verifierRef.current) {
      discardRecaptcha(verifierRef.current.verifier, verifierRef.current.host);
      verifierRef.current = null;
    }
  }, []);

  // Clean up verifier on unmount
  useEffect(() => {
    return () => {
      clearVerifier();
    };
  }, [clearVerifier]);

  const resendInSeconds = useCountdown(resendDeadlineMs);
  const expiresInSeconds = useCountdown(expiryDeadlineMs);
  const isExpired = expiryDeadlineMs !== null && expiresInSeconds === 0;

  const onPhoneChange = useCallback((value: string) => {
    const next = sanitizePhoneInput(value);
    // Typing a number is the signal someone is logging in: fetch the SDK now,
    // so it is ready by the time they press Send.
    if (next !== "") preloadFirebase();
    setPhone(next);
    setPhoneError(null);
    setFailure(null);

    if (cooldownPhoneRef.current !== null && next !== cooldownPhoneRef.current) {
      cooldownPhoneRef.current = null;
      setResendDeadlineMs(null);
    }
  }, []);

  const onCodeChange = useCallback((value: string) => {
    setCode(sanitizeCodeInput(value, 6));
    setCodeError(null);
    setFailure(null);
  }, []);

  const hasEnoughDigits = countDigits(phone) >= minimumPhoneDigits;
  const canRequest = hasEnoughDigits && !isRequesting && resendInSeconds === 0;
  const canVerify =
    hasVerificationInProgress &&
    code.length === 6 &&
    !isVerifying &&
    !verifyFirebase.isPending &&
    !isExpired;

  const onRequestCode = useCallback(async () => {
    if (!hasEnoughDigits) {
      setPhoneError(`Enter your ${minimumPhoneDigits}-digit mobile number.`);
      return;
    }
    if (isRequesting || resendInSeconds > 0) return;

    if (firebaseConfig() === null) {
      setFailure({
        kind: "unexpected",
        title: "Authentication unavailable",
        message: "Phone authentication service is not configured. Please try again later.",
        severity: "error",
        reference: null,
      });
      return;
    }

    setFailure(null);
    setPhoneError(null);
    setCodeError(null);
    setIsRequesting(true);

    const attempt = ++sendAttemptRef.current;
    const abandoned = () => attempt !== sendAttemptRef.current;
    const canonicalPhone = formatToE164(phone);

    // The SDK loads alongside the precheck instead of after it. Usually it is
    // already here, fetched while the number was typed.
    const firebaseReady = Promise.all([getFirebaseAuth(), loadFirebaseAuthSdk()]);
    // A failed precheck returns before this is awaited; the send step reports its own errors.
    firebaseReady.catch(() => undefined);

    // 1. Backend precheck
    try {
      await request(() =>
        apiClient.POST("/api/v1/auth/firebase/precheck/", {
          body: {
            phone_number: canonicalPhone,
            intended_role: intendedRole ?? "",
          },
        }),
      );
    } catch (precheckError) {
      if (abandoned()) return;
      clearVerifier();
      setIsRequesting(false);

      const invalidPhone = fieldMessage(precheckError, "phone_number");
      if (invalidPhone) {
        setPhoneError(invalidPhone);
        return;
      }
      setFailure(describeOtpFailure(precheckError, intendedRole));
      return;
    }
    if (abandoned()) return;

    // 2. Firebase Phone Auth with invisible RecaptchaVerifier
    try {
      const [auth, { RecaptchaVerifier, signInWithPhoneNumber }] = await firebaseReady;
      if (abandoned()) return;
      if (!auth) {
        throw new Error("Phone authentication service is not configured.");
      }

      // A verifier is kept after a successful send so Resend can reuse it;
      // anything that discards it also discards its element.
      if (!verifierRef.current) {
        const host = createRecaptchaHost();
        if (!host) {
          throw new Error("Unable to create Recaptcha container");
        }
        verifierRef.current = {
          verifier: new RecaptchaVerifier(auth, host, { size: "invisible" }),
          host,
        };
      }

      const result = await signInWithPhoneNumber(
        auth,
        canonicalPhone,
        verifierRef.current.verifier,
      );
      if (abandoned()) return;
      confirmationResultRef.current = result;
      setHasVerificationInProgress(true);

      const now = Date.now();
      setResendDeadlineMs(now + 60 * 1000);
      setExpiryDeadlineMs(now + 300 * 1000);
      cooldownPhoneRef.current = phone;
      setCode("");
      setPhase("code");
    } catch (firebaseError) {
      // An abandoned send's verifier is already gone; clearing here would
      // discard the one a newer attempt is using.
      if (abandoned()) return;
      clearVerifier();
      const mapped = mapFirebaseError(firebaseError);
      if (mapped.target === "phone") {
        setPhoneError(mapped.message);
      } else {
        setFailure(
          mapped.failure ?? {
            kind: "unexpected",
            title: "That did not go through",
            message: mapped.message,
            severity: "error",
            reference: null,
          },
        );
      }
    } finally {
      if (!abandoned()) setIsRequesting(false);
    }
  }, [
    apiClient,
    clearVerifier,
    hasEnoughDigits,
    intendedRole,
    isRequesting,
    minimumPhoneDigits,
    phone,
    resendInSeconds,
  ]);

  const onResendCode = onRequestCode;

  const onVerifyCode = useCallback(async () => {
    if (!confirmationResultRef.current) {
      setCodeError("No verification in progress. Request a new code.");
      return;
    }
    if (isExpired) {
      setCodeError("That code has expired. Request a new one.");
      return;
    }
    if (code.length !== 6) {
      setCodeError("Enter the 6-digit code we sent you.");
      return;
    }
    if (isVerifying) return;

    setFailure(null);
    setCodeError(null);
    setIsVerifying(true);

    let idToken: string | null = null;
    try {
      const userCredential = await confirmationResultRef.current.confirm(code);
      idToken = await userCredential.user.getIdToken();
    } catch (firebaseError) {
      const mapped = mapFirebaseError(firebaseError);
      if (mapped.target === "code") {
        setCodeError(mapped.message);
      } else {
        setFailure(
          mapped.failure ?? {
            kind: "unexpected",
            title: "That did not go through",
            message: mapped.message,
            severity: "error",
            reference: null,
          },
        );
      }
      setIsVerifying(false);
      return;
    }

    try {
      const referralCode = getReferralCode?.() ?? null;
      const session = await verifyFirebase.mutateAsync({
        idToken,
        intendedRole: intendedRole ?? "",
        referralCode,
        deviceIdentifier,
        deviceLabel,
      });

      setPhase("authenticated");
      setSignedInPhone(session.user.phone_number);
      setCode("");
      confirmationResultRef.current = null;
      setHasVerificationInProgress(false);
      setResendDeadlineMs(null);
      setExpiryDeadlineMs(null);
      cooldownPhoneRef.current = null;
      onAuthenticatedRef.current?.(session);
    } catch (backendError) {
      // Single-use token: Firebase id_token is spent once verified or attempted.
      // Reset the flow back to the send step so the user must request a fresh code,
      // and can never resubmit the same spent id_token.
      confirmationResultRef.current = null;
      setHasVerificationInProgress(false);
      setCode("");
      setPhase("phone");
      setResendDeadlineMs(null);
      cooldownPhoneRef.current = null;

      if (backendError instanceof ApiRequestError && backendError.status === 400) {
        setPhoneError(
          "That code is not right, or it has expired. Please request a new code.",
        );
      } else {
        setFailure(describeOtpFailure(backendError, intendedRole));
      }
    } finally {
      // Always sign out of Firebase auth client so Django session cookie is authoritative
      try {
        const auth = await getFirebaseAuth();
        if (auth) {
          const { signOut } = await loadFirebaseAuthSdk();
          await signOut(auth);
        }
      } catch {
        // Ignore signOut errors
      }
      setIsVerifying(false);
    }
  }, [
    code,
    deviceIdentifier,
    deviceLabel,
    getReferralCode,
    intendedRole,
    isExpired,
    isVerifying,
    verifyFirebase,
  ]);

  const onChangeNumber = useCallback(() => {
    setPhase("phone");
    setCode("");
    setCodeError(null);
    setFailure(null);
    setExpiryDeadlineMs(null);
    confirmationResultRef.current = null;
    setHasVerificationInProgress(false);
    sendAttemptRef.current += 1;
    setIsRequesting(false);
    clearVerifier();
  }, [clearVerifier]);

  const reset = useCallback(() => {
    setPhase("phone");
    setPhone("");
    setCode("");
    setSignedInPhone(null);
    setPhoneError(null);
    setCodeError(null);
    setFailure(null);
    setResendDeadlineMs(null);
    setExpiryDeadlineMs(null);
    cooldownPhoneRef.current = null;
    confirmationResultRef.current = null;
    setHasVerificationInProgress(false);
    sendAttemptRef.current += 1;
    setIsRequesting(false);
    clearVerifier();
  }, [clearVerifier]);

  useEffect(() => {
    if (phase !== "authenticated") return;

    return getTabChannel().subscribe((message) => {
      if (message.type === "session.logout") reset();
    });
  }, [phase, reset]);

  const onLogout = useCallback(() => {
    if (logout.isPending) return;
    logout.mutate(undefined, {
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
    isRequesting,
    isVerifying: isVerifying || verifyFirebase.isPending,
    isLoggingOut: logout.isPending,
    resendInSeconds,
    expiresInSeconds: expiryDeadlineMs === null ? null : expiresInSeconds,
    isExpired,
    phoneError,
    codeError,
    failure,
    signedInPhone,
    developmentCode: null,
    codeLength: 6,
    reset,
  };
}
