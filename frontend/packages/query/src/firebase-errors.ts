/**
 * Firebase phone sign-in pieces shared by the web and the mobile apps.
 *
 * Kept apart from `firebase-phone.ts`, which loads the browser Firebase SDK, so the native
 * bundle can use the same number formatting and the same customer-facing error copy.
 */
import type { OtpFailure } from "./otp-flow";

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

const VERIFICATION_FAILED_MESSAGE = "Verification failed. Please refresh and try again.";

function currentPageUrl(): URL | null {
  // React Native has a global `window` but no `window.location`.
  return typeof window === "undefined" || !window.location ? null : new URL(window.location.href);
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
  if (page === null) {
    // The mobile apps: no page, no reCAPTCHA. Android checks the app's signing key instead.
    return `${code}: Firebase refused this app. Add the app's SHA-1 and SHA-256 fingerprints to its Firebase Android app and turn on Play Integrity (iOS: upload the APNs key to Firebase).`;
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

  // `session-expired` is the native SDKs' name for the same thing.
  if (code.includes("code-expired") || code.includes("session-expired")) {
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
    code.includes("app-credential") ||
    // Native SDKs: the app's signing key or Play Integrity is not set up in Firebase.
    code.includes("app-not-authorized") ||
    code.includes("missing-client-identifier")
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
