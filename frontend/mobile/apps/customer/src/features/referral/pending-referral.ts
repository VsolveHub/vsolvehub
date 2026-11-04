// Ported from frontend/apps/customer/features/referral/pending-referral.ts
/**
 * The referral code a visitor arrived with, held until their OTP verification.
 *
 * Django applies it only when that verification creates a new account, so it is sent on every
 * login attempt and cleared once the person is signed in.
 */
let pendingReferralCode: string | null = null;

export function readPendingReferral(): string | null {
  return pendingReferralCode;
}

export function savePendingReferral(code: string): void {
  pendingReferralCode = code.trim().toUpperCase();
}

export function clearPendingReferral(): void {
  pendingReferralCode = null;
}
