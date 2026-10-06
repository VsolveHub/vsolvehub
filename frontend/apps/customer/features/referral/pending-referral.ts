/**
 * The referral code a visitor arrived with, held until their OTP verification.
 *
 * Django applies it only when that verification creates a new account, so it is sent on every
 * login attempt and cleared once the person is signed in.
 */
const KEY = "vsolve_pending_referral";

export function readPendingReferral(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function savePendingReferral(code: string): void {
  try {
    window.sessionStorage.setItem(KEY, code);
  } catch {
    // Private mode: the code still travels in the URL for this page view.
  }
}

export function clearPendingReferral(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
