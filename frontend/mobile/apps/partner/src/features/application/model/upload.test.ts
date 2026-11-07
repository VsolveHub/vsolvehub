// Ported from frontend/apps/partner/features/application/model/upload.test.ts
import {
  ACCEPTED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  formatBytes,
  isRetryableUploadFailure,
  isUploadExpired,
  rejectFile,
} from "./upload";

/**
 * These guard the two ways a KYC upload goes wrong quietly: a file the server
 * will refuse after a long transfer, and a retry that cannot possibly succeed.
 */

describe("file validation", () => {
  it("refuses an empty file rather than uploading nothing", () => {
    expect(rejectFile({ size: 0, type: "image/jpeg" })?.code).toBe("empty");
  });

  it("refuses a file over Django's ceiling before a byte is sent", () => {
    // The point is not to enforce the rule — Django re-checks the stored object.
    // It is to avoid a two-minute upload on a phone that was always going to be
    // rejected.
    const problem = rejectFile({ size: MAX_UPLOAD_BYTES + 1, type: "image/jpeg" });
    expect(problem?.code).toBe("too_large");
    expect(problem?.message).toContain("20.0 MB");
  });

  it("accepts exactly the ceiling", () => {
    expect(rejectFile({ size: MAX_UPLOAD_BYTES, type: "image/png" })).toBeNull();
  });

  it("accepts only the types a reviewer can open", () => {
    for (const type of ACCEPTED_CONTENT_TYPES) {
      expect(rejectFile({ size: 1_000, type })).toBeNull();
    }
    expect(rejectFile({ size: 1_000, type: "image/heic" })?.code).toBe("unsupported_type");
    expect(rejectFile({ size: 1_000, type: "" })?.code).toBe("unsupported_type");
  });

  it("says what to do, not just what is wrong", () => {
    const problem = rejectFile({ size: 1_000, type: "image/heic" });
    expect(problem?.message).toMatch(/JPEG|PNG|PDF/);
  });
});

describe("signed URL expiry", () => {
  const now = Date.parse("2026-08-02T12:00:00Z");

  it("treats a passed deadline as expired", () => {
    expect(isUploadExpired("2026-08-02T11:59:59Z", now)).toBe(true);
  });

  it("allows a deadline still ahead", () => {
    expect(isUploadExpired("2026-08-02T12:05:00Z", now)).toBe(false);
  });

  it("treats an unparseable deadline as expired rather than assuming time is left", () => {
    // Sending 20 MB at a URL we cannot reason about is worse than asking for a
    // fresh one.
    expect(isUploadExpired("not-a-date", now)).toBe(true);
  });
});

describe("retryability", () => {
  it("offers a retry for the failures a second attempt can fix", () => {
    expect(isRetryableUploadFailure("expired")).toBe(true);
    expect(isRetryableUploadFailure("network")).toBe(true);
  });

  it("does not offer a retry that would fail identically", () => {
    // A checksum or type Django refused does not become correct on a second
    // send; offering Retry there disguises a bad file as a flaky connection.
    expect(isRetryableUploadFailure("rejected")).toBe(false);
    expect(isRetryableUploadFailure("conflict")).toBe(false);
    expect(isRetryableUploadFailure("unknown")).toBe(false);
  });
});

describe("byte formatting", () => {
  it("reads naturally at each scale", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
