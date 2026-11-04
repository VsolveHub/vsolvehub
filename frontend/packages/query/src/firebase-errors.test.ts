import { describe, expect, it, vi } from "vitest";

import { formatToE164, mapFirebaseError } from "./firebase-errors";

describe("firebase-errors (shared by web and mobile)", () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  it("formats a 10-digit Indian number to E.164", () => {
    expect(formatToE164("98765 43210")).toBe("+919876543210");
  });

  it("treats the native SDKs' session-expired like an expired code", () => {
    expect(mapFirebaseError({ code: "auth/session-expired" }, null)).toMatchObject({
      target: "code",
      message: "OTP expired. Please resend",
    });
  });

  it("reports an unregistered app signing key as a verification failure", () => {
    for (const code of ["auth/app-not-authorized", "auth/missing-client-identifier"]) {
      const mapped = mapFirebaseError({ code }, null);
      expect(mapped.target).toBe("failure");
      expect(mapped.failure?.title).toBe("Verification failed");
    }
  });

  it("does not read window.location when there is no page (React Native)", () => {
    expect(() => mapFirebaseError({ code: "auth/invalid-app-credential" }, null)).not.toThrow();
  });
});
