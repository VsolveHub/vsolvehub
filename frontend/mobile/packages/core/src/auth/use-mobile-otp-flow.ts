import { ApiRequestError, request } from "@vsolve/api-client";
import {
  describeOtpFailure,
  sanitizeCodeInput,
  sanitizePhoneInput,
  type OtpFailure,
  type OtpPhase,
} from "@vsolve/query/native";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getApiClient } from "../api/client";
import { getMobileQueryClient } from "../query/query-client";
import { useAuthStore } from "./auth-store";
import { deviceLabel } from "./device-label";
import { phoneAuthProvider } from "./firebase-module";
import { installationId } from "./installation-id";
import { useMobileFirebaseFlow } from "./use-mobile-firebase-flow";

export interface MobileOtpFlowOptions {
  intendedRole?: "partner";
  getReferralCode?: () => string | null | undefined;
}

export interface MobileOtpFlow {
  phase: OtpPhase;
  phone: string;
  onPhoneChange: (value: string) => void;
  code: string;
  onCodeChange: (value: string) => void;
  onRequestCode: () => void;
  onVerifyCode: (codeOverride?: string) => void;
  onResendCode: () => void;
  onChangeNumber: () => void;
  canRequest: boolean;
  canVerify: boolean;
  isRequesting: boolean;
  isVerifying: boolean;
  phoneError: string | null;
  codeError: string | null;
  failure: OtpFailure | null;
  developmentCode: string | null;
  resendInSeconds: number;
  expiresInSeconds: number | null;
  isExpired: boolean;
  codeLength: number;
  reset: () => void;
}

const DEFAULT_CODE_LENGTH = 6;
const MINIMUM_PHONE_DIGITS = 10;

function digitsIn(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

/**
 * Phone sign-in for both apps, switched like the web's `usePhoneAuthFlow`: Firebase when the
 * build sets `EXPO_PUBLIC_PHONE_AUTH_PROVIDER=firebase` (store and test builds), otherwise the
 * server-sent code. The setting is fixed for the life of a build, so the hook order never
 * changes between renders.
 */
export function useMobileOtpFlow(options?: MobileOtpFlowOptions): MobileOtpFlow {
  if (phoneAuthProvider() === "firebase") {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useMobileFirebaseFlow(options);
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useServerOtpFlow(options);
}

/**
 * Same steps as the web OTP flow. Verify uses the mobile endpoint and stores
 * the bearer token instead of relying on a cookie.
 */
function useServerOtpFlow(options?: MobileOtpFlowOptions): MobileOtpFlow {
  const [phase, setPhase] = useState<OtpPhase>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [codeLength, setCodeLength] = useState(DEFAULT_CODE_LENGTH);
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null);
  const [resendUntil, setResendUntil] = useState<number | null>(null);
  const [expiresUntil, setExpiresUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [failure, setFailure] = useState<OtpFailure | null>(null);
  const [isRequesting, setRequesting] = useState(false);
  const [isVerifying, setVerifying] = useState(false);

  const reset = useCallback(() => {
    setPhase("phone");
    setPhone("");
    setCode("");
    setChallengeId(null);
    setCodeLength(DEFAULT_CODE_LENGTH);
    setDevelopmentCode(null);
    setResendUntil(null);
    setExpiresUntil(null);
    setPhoneError(null);
    setCodeError(null);
    setFailure(null);
  }, []);

  const onPhoneChange = useCallback((value: string) => {
    setPhone(sanitizePhoneInput(value));
    setPhoneError(null);
    setFailure(null);
  }, []);

  const onCodeChange = useCallback(
    (value: string) => {
      setCode(sanitizeCodeInput(value, codeLength));
      setCodeError(null);
      setFailure(null);
    },
    [codeLength],
  );

  const issue = useCallback(async () => {
    if (digitsIn(phone) < MINIMUM_PHONE_DIGITS) {
      setPhoneError(`Enter your ${MINIMUM_PHONE_DIGITS}-digit mobile number.`);
      return;
    }
    setRequesting(true);
    setFailure(null);
    try {
      const device = await installationId();
      const issued = await request(() =>
        getApiClient().POST("/api/v1/auth/otp/request/", {
          body: {
            phone_number: phone,
            device_identifier: device,
            intended_role: options?.intendedRole ?? "",
          },
        }),
      );
      setChallengeId(issued.challenge_id);
      setCodeLength(issued.code_length ?? DEFAULT_CODE_LENGTH);
      setDevelopmentCode(issued.development_code ?? null);
      const stamped = Date.now();
      setResendUntil(stamped + issued.resend_after_seconds * 1000);
      setExpiresUntil(stamped + issued.expires_in_seconds * 1000);
      setPhase("code");
    } catch (error) {
      setFailure(describeOtpFailure(error));
    } finally {
      setRequesting(false);
    }
  }, [options?.intendedRole, phone]);

  const onVerifyCode = useCallback(
    (codeOverride?: unknown) => {
      const explicitCode = typeof codeOverride === "string" ? codeOverride : undefined;
      const activeCode = sanitizeCodeInput(explicitCode ?? code, codeLength);
      if (!challengeId || activeCode.length !== codeLength || isVerifying) return;
      if (explicitCode) {
        setCode(activeCode);
      }
      setVerifying(true);
      setCodeError(null);
      void (async () => {
        try {
          const device = await installationId();
          const session = (await request(() =>
            getApiClient().POST("/api/v1/auth/mobile/otp/verify/", {
              body: {
                challenge_id: challengeId,
                phone_number: phone,
                code: activeCode,
                device_identifier: device,
                device_label: deviceLabel(),
                ...(options?.getReferralCode?.()?.trim()
                  ? { referral_code: options.getReferralCode()!.trim() }
                  : {}),
              },
            }),
          )) as { session_token?: string } | undefined;
          if (session?.session_token) {
            await useAuthStore.getState().signIn(session.session_token);
          }
          await getMobileQueryClient().invalidateQueries();
          setPhase("authenticated");
          setCode("");
          setChallengeId(null);
          setDevelopmentCode(null);
        } catch (error) {
          const codeFieldError =
            error instanceof ApiRequestError ? (error.fieldErrors.code?.[0] ?? null) : null;
          if (codeFieldError) {
            setCodeError(codeFieldError);
          } else if (error instanceof ApiRequestError && error.code.toLowerCase() === "invalid_otp") {
            // Django answers `invalid_otp` for a wrong, expired and locked-out code alike.
            setCodeError(
              "That code is not right, or it has expired. Check the code, or request a new one.",
            );
          } else {
            // Any other 400 is about something the app sent (once, an over-long
            // `device_label`), not the code the person typed. Calling it a wrong code
            // sends them round in circles re-entering a correct one.
            setFailure(describeOtpFailure(error));
          }
        } finally {
          setVerifying(false);
        }
      })();
    },
    [challengeId, code, codeLength, isVerifying, options, phone],
  );

  const resendInSeconds =
    resendUntil === null ? 0 : Math.max(0, Math.ceil((resendUntil - now) / 1000));
  const expiresInSeconds =
    expiresUntil === null ? null : Math.max(0, Math.ceil((expiresUntil - now) / 1000));
  const isExpired = expiresInSeconds === 0;

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
        setPhase("phone");
        setCode("");
        setChallengeId(null);
        setCodeError(null);
        setResendUntil(null);
        setExpiresUntil(null);
      },
      canRequest: digitsIn(phone) >= MINIMUM_PHONE_DIGITS && !isRequesting && resendInSeconds === 0,
      canVerify: challengeId !== null && code.length === codeLength && !isVerifying && !isExpired,
      isRequesting,
      isVerifying,
      phoneError,
      codeError,
      failure,
      developmentCode,
      resendInSeconds,
      expiresInSeconds,
      isExpired,
      codeLength,
      reset,
    }),
    [
      challengeId,
      code,
      codeError,
      codeLength,
      developmentCode,
      expiresInSeconds,
      failure,
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
