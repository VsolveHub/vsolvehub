"use server";

export type AuthState = { error?: string; devCode?: string };

/**
 * Placeholder pending the Django OTP wiring for the partner app (M1 F4).
 *
 * The previous implementation issued OTPs against a Prisma `OtpChallenge`
 * table that no longer exists in this app. Server-action auth against Django
 * needs its own CSRF/cookie-forwarding design — not something to improvise
 * here — so this returns an honest "not available yet" state rather than a
 * fabricated success. `partner-hero.tsx`'s phone form is inert until this is
 * replaced with the real `/api/v1/auth/otp/request/` call.
 */
export async function requestOtp(_prev: AuthState, _formData: FormData): Promise<AuthState> {
  return { error: "Sign-in isn't live yet — check back soon." };
}
