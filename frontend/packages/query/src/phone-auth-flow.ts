"use client";

import type { ApiClient } from "@vsolve/api-client";

import { useFirebasePhoneFlow } from "./firebase-phone";
import { useOtpFlow, type OtpFlow, type OtpFlowOptions } from "./otp-flow";

export function isFirebasePhoneAuth(): boolean {
  return process.env.NEXT_PUBLIC_PHONE_AUTH_PROVIDER === "firebase";
}

/**
 * Unified phone authentication hook that switches between Firebase Phone Auth
 * and the legacy OTP flow based on NEXT_PUBLIC_PHONE_AUTH_PROVIDER ("firebase" | "otp").
 * Defaults to "otp".
 */
export function usePhoneAuthFlow(
  apiClient: ApiClient,
  options: OtpFlowOptions = {},
): OtpFlow {
  const isFirebase = process.env.NEXT_PUBLIC_PHONE_AUTH_PROVIDER === "firebase";
  if (isFirebase) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useFirebasePhoneFlow(apiClient, options);
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useOtpFlow(apiClient, options);
}
