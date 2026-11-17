import { ApiRequestError } from "@vsolve/api-client";

/**
 * Development builds only: names why a sign-in call failed.
 *
 * The sign-in screen deliberately shows generic copy for any code it has no wording for
 * ("That did not go through"), which hides the cause from whoever is debugging. This logs
 * the HTTP status, the error code and the request id, never the phone number, code or token.
 */
export function logAuthFailure(step: string, error: unknown): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  if (error instanceof ApiRequestError) {
    console.warn(
      `[sign-in] ${step} failed: HTTP ${error.status} ${error.code} (request ${error.requestId ?? "none"})`,
    );
    return;
  }
  console.warn(`[sign-in] ${step} failed:`, error instanceof Error ? error.name : typeof error);
}
