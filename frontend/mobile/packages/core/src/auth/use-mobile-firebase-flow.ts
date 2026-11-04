import type { ConfirmationResult, User } from "@react-native-firebase/auth";
import { ApiRequestError, request } from "@vsolve/api-client";
import {
  describeOtpFailure,
  formatToE164,
  mapFirebaseError,
  sanitizeCodeInput,
  sanitizePhoneInput,
  type OtpFailure,
  type OtpPhase,
} from "@vsolve/query/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getApiClient } from "../api/client";
import { getMobileQueryClient } from "../query/query-client";
import { useAuthStore } from "./auth-store";
import { deviceLabel } from "./device-label";
import { getFirebaseAuthModule } from "./firebase-module";
import { installationId } from "./installation-id";
import type { MobileOtpFlow } from "./use-mobile-otp-flow";

const CODE_LENGTH = 6;
const MINIMUM_PHONE_DIGITS = 10;
const RESEND_AFTER_MS = 60_000;
const CODE_LIFETIME_MS = 300_000;

function digitsIn(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

function failureFrom(error: unknown): { target: "phone" | "code" | "failure"; message: string; failure: OtpFailure } {
  // No page on a phone: `null` keeps the mapper off `window.location`.
  const mapped = mapFirebaseError(error, null);
  return {
    target: mapped.target,
    message: mapped.message,
    failure: mapped.failure ?? {
      kind: "unexpected",
      title: "That did not go through",
      message: mapped.message,
      severity: "error",
      reference: null,
    },
  };
}

const UNAVAILABLE: OtpFailure = {
  kind: "unexpected",
  title: "Sign-in unavailable",
  message: "Phone sign-in is not available in this build. Install the app from the store.",
  severity: "error",
  reference: null,
};

/**
 * Firebase phone sign-in, the same steps as the web's `useFirebasePhoneFlow`:
 *
 * 1. `POST /auth/firebase/precheck/` (rate limits, and "no Partner account" before an SMS).
 * 2. Firebase sends the SMS and confirms the code. On Android it can also read the SMS itself
 *    and sign in without the code being typed; that path finishes the same way.
 * 3. The Firebase ID token goes to `POST /auth/mobile/firebase/verify/`, which answers with the
 *    bearer token this app keeps instead of a cookie.
 */
export function useMobileFirebaseFlow(options?: { intendedRole?: "partner" }): MobileOtpFlow {
  const intendedRole = options?.intendedRole ?? "";
  const [phase, setPhase] = useState<OtpPhase>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [resendUntil, setResendUntil] = useState<number | null>(null);
  const [expiresUntil, setExpiresUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [failure, setFailure] = useState<OtpFailure | null>(null);
  const [isRequesting, setRequesting] = useState(false);
  const [isVerifying, setVerifying] = useState(false);
  const [hasConfirmation, setHasConfirmation] = useState(false);

  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const finishingRef = useRef(false);
  /** Bumped by `reset` and "change number" so a send still in flight is abandoned. */
  const attemptRef = useRef(0);

  const clearConfirmation = useCallback(() => {
    confirmationRef.current = null;
    setHasConfirmation(false);
  }, []);

  const reset = useCallback(() => {
    attemptRef.current += 1;
    clearConfirmation();
    setPhase("phone");
    setPhone("");
    setCode("");
    setResendUntil(null);
    setExpiresUntil(null);
    setPhoneError(null);
    setCodeError(null);
    setFailure(null);
    setRequesting(false);
  }, [clearConfirmation]);

  const onPhoneChange = useCallback((value: string) => {
    setPhone(sanitizePhoneInput(value));
    setPhoneError(null);
    setFailure(null);
  }, []);

  const onCodeChange = useCallback((value: string) => {
    setCode(sanitizeCodeInput(value, CODE_LENGTH));
    setCodeError(null);
    setFailure(null);
  }, []);

  /** Exchange a signed-in Firebase user for this app's session. Runs once per sign-in. */
  const finishWithUser = useCallback(
    async (user: User) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      const firebase = getFirebaseAuthModule();
      setVerifying(true);
      try {
        const idToken = await user.getIdToken();
        const device = await installationId();
        const session = (await request(() =>
          getApiClient().POST("/api/v1/auth/mobile/firebase/verify/", {
            body: {
              id_token: idToken,
              intended_role: intendedRole,
              device_identifier: device,
              device_label: deviceLabel(),
            },
          }),
        )) as { session_token?: string } | undefined;
        if (session?.session_token) {
          await useAuthStore.getState().signIn(session.session_token);
        }
        await getMobileQueryClient().invalidateQueries();
        clearConfirmation();
        setCode("");
        setResendUntil(null);
        setExpiresUntil(null);
        setPhase("authenticated");
      } catch (error) {
        // The ID token is single use. Back to the number, as the web does, so a spent token is
        // never resubmitted.
        clearConfirmation();
        setCode("");
        setResendUntil(null);
        setPhase("phone");
        if (error instanceof ApiRequestError && error.code.toLowerCase() === "invalid_otp") {
          setPhoneError("That code is not right, or it has expired. Please request a new code.");
        } else {
          setFailure(describeOtpFailure(error, intendedRole || undefined));
        }
      } finally {
        // Firebase only proves the number; this app's session is the bearer token.
        if (firebase) {
          try {
            await firebase.signOut(firebase.getAuth());
          } catch {
            // Nothing to undo if Firebase was already signed out.
          }
        }
        finishingRef.current = false;
        setVerifying(false);
      }
    },
    [clearConfirmation, intendedRole],
  );

  const issue = useCallback(async () => {
    if (digitsIn(phone) < MINIMUM_PHONE_DIGITS) {
      setPhoneError(`Enter your ${MINIMUM_PHONE_DIGITS}-digit mobile number.`);
      return;
    }
    const firebase = getFirebaseAuthModule();
    if (firebase === null) {
      setFailure(UNAVAILABLE);
      return;
    }
    const attempt = ++attemptRef.current;
    const abandoned = () => attempt !== attemptRef.current;
    const canonicalPhone = formatToE164(phone);
    setRequesting(true);
    setFailure(null);
    setPhoneError(null);
    setCodeError(null);

    try {
      await request(() =>
        getApiClient().POST("/api/v1/auth/firebase/precheck/", {
          body: { phone_number: canonicalPhone, intended_role: intendedRole },
        }),
      );
    } catch (error) {
      if (abandoned()) return;
      setRequesting(false);
      const invalidPhone =
        error instanceof ApiRequestError ? (error.fieldErrors.phone_number?.[0] ?? null) : null;
      if (invalidPhone) setPhoneError(invalidPhone);
      else setFailure(describeOtpFailure(error, intendedRole || undefined));
      return;
    }
    if (abandoned()) return;

    try {
      const confirmation = await firebase.signInWithPhoneNumber(firebase.getAuth(), canonicalPhone);
      if (abandoned()) return;
      confirmationRef.current = confirmation;
      setHasConfirmation(true);
      const stamped = Date.now();
      setResendUntil(stamped + RESEND_AFTER_MS);
      setExpiresUntil(stamped + CODE_LIFETIME_MS);
      setCode("");
      setPhase("code");
    } catch (error) {
      if (abandoned()) return;
      clearConfirmation();
      const mapped = failureFrom(error);
      if (mapped.target === "phone") setPhoneError(mapped.message);
      else setFailure(mapped.failure);
    } finally {
      if (!abandoned()) setRequesting(false);
    }
  }, [clearConfirmation, intendedRole, phone]);

  const resendInSeconds =
    resendUntil === null ? 0 : Math.max(0, Math.ceil((resendUntil - now) / 1000));
  const expiresInSeconds =
    expiresUntil === null ? null : Math.max(0, Math.ceil((expiresUntil - now) / 1000));
  const isExpired = expiresInSeconds === 0;

  const onVerifyCode = useCallback(
    (codeOverride?: unknown) => {
      const explicit = typeof codeOverride === "string" ? codeOverride : undefined;
      const activeCode = sanitizeCodeInput(explicit ?? code, CODE_LENGTH);
      const confirmation = confirmationRef.current;
      if (confirmation === null) {
        setCodeError("No verification in progress. Request a new code.");
        return;
      }
      if (isExpired) {
        setCodeError("That code has expired. Request a new one.");
        return;
      }
      if (activeCode.length !== CODE_LENGTH || isVerifying) return;
      if (explicit) setCode(activeCode);
      setCodeError(null);
      setFailure(null);
      setVerifying(true);
      void (async () => {
        let user: User | null = null;
        try {
          const credential = await confirmation.confirm(activeCode);
          user = credential?.user ?? getFirebaseAuthModule()?.getAuth().currentUser ?? null;
        } catch (error) {
          const mapped = failureFrom(error);
          if (mapped.target === "code") setCodeError(mapped.message);
          else setFailure(mapped.failure);
          setVerifying(false);
          return;
        }
        if (user === null) {
          setVerifying(false);
          setCodeError("That code is not right, or it has expired. Check the code, or request a new one.");
          return;
        }
        await finishWithUser(user);
      })();
    },
    [code, finishWithUser, isExpired, isVerifying],
  );

  // Android can verify the number from the SMS on its own. Finish the same way as a typed code.
  useEffect(() => {
    if (phase !== "code" || !hasConfirmation) return;
    const firebase = getFirebaseAuthModule();
    if (firebase === null) return;
    return firebase.onAuthStateChanged(firebase.getAuth(), (user) => {
      if (user !== null) void finishWithUser(user);
    });
  }, [finishWithUser, hasConfirmation, phase]);

  useEffect(() => {
    if (resendUntil === null && expiresUntil === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresUntil, resendUntil]);

  return useMemo(
    () => ({
      phase,
      phone,
      onPhoneChange,
      code,
      onCodeChange,
      onRequestCode: () => void issue(),
      onVerifyCode,
      onResendCode: () => void issue(),
      onChangeNumber: () => {
        attemptRef.current += 1;
        clearConfirmation();
        setPhase("phone");
        setCode("");
        setCodeError(null);
        setFailure(null);
        setExpiresUntil(null);
        setRequesting(false);
      },
      canRequest: digitsIn(phone) >= MINIMUM_PHONE_DIGITS && !isRequesting && resendInSeconds === 0,
      canVerify: hasConfirmation && code.length === CODE_LENGTH && !isVerifying && !isExpired,
      isRequesting,
      isVerifying,
      phoneError,
      codeError,
      failure,
      developmentCode: null,
      resendInSeconds,
      expiresInSeconds,
      isExpired,
      codeLength: CODE_LENGTH,
      reset,
    }),
    [
      clearConfirmation,
      code,
      codeError,
      expiresInSeconds,
      failure,
      hasConfirmation,
      isExpired,
      isRequesting,
      isVerifying,
      issue,
      onCodeChange,
      onPhoneChange,
      onVerifyCode,
      phase,
      phone,
      phoneError,
      resendInSeconds,
      reset,
    ],
  );
}
