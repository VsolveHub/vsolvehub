import { describe, expect, it } from "vitest";

import {
  ApiContractError,
  ApiNetworkError,
  ApiRequestError,
  isApiClientError,
  isTransportRetryable,
  parseErrorEnvelope,
} from "./errors";

const detail = (code: string, overrides: Record<string, unknown> = {}) => ({
  code,
  message: "Something the customer can read.",
  details: null,
  // Defaults to true so a test that cares about status-based classification is
  // not silently vetoed by the server flag.
  retryable: true,
  request_id: "req_abc123",
  ...overrides,
});

describe("parseErrorEnvelope", () => {
  it("accepts a contract-shaped envelope", () => {
    const parsed = parseErrorEnvelope({
      error: {
        code: "QUOTE_EXPIRED",
        message: "Price changed.",
        details: null,
        retryable: true,
        request_id: "r1",
      },
    });
    expect(parsed).toEqual({
      code: "QUOTE_EXPIRED",
      message: "Price changed.",
      details: null,
      retryable: true,
      request_id: "r1",
    });
  });

  it("defaults retryable to false when the field is absent", () => {
    // An older deployment predating the field must not have its errors treated
    // as retryable by omission.
    const parsed = parseErrorEnvelope({
      error: { code: "X", message: "y", details: null, request_id: "r1" },
    });
    expect(parsed?.retryable).toBe(false);
  });

  it("rejects bodies that are not the envelope", () => {
    // A proxy HTML page, a bare string, or a DRF-style {detail: "..."} response
    // must not be mistaken for a domain error.
    expect(parseErrorEnvelope("<html>502</html>")).toBeNull();
    expect(parseErrorEnvelope({ detail: "Not found." })).toBeNull();
    expect(parseErrorEnvelope({ error: "boom" })).toBeNull();
    expect(parseErrorEnvelope(null)).toBeNull();
  });

  it("normalises a missing request_id to null rather than undefined", () => {
    const parsed = parseErrorEnvelope({
      error: { code: "X", message: "y", details: null },
    });
    expect(parsed?.request_id).toBeNull();
  });
});

describe("ApiRequestError transport retryability", () => {
  it("retries only genuine transport-level statuses", () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
      expect(new ApiRequestError(status, detail("UPSTREAM")).isTransportRetryable).toBe(true);
    }
  });

  it("lets the server veto an automatic retry", () => {
    const error = new ApiRequestError(503, detail("UPSTREAM", { retryable: false }));
    expect(error.isTransportRetryable).toBe(false);
  });

  it("does not treat the server's semantic hint as permission to auto-retry", () => {
    // SLOT_NO_LONGER_AVAILABLE is retryable:true because booking again after
    // choosing another slot works — not because resending this request would.
    // Conflating the two would resend a payment on a 409.
    const error = new ApiRequestError(409, detail("SLOT_NO_LONGER_AVAILABLE", { retryable: true }));
    expect(error.retryable).toBe(true);
    expect(error.isTransportRetryable).toBe(false);
  });

  it("never retries a conflict, because the world changed", () => {
    // Retrying an identical request after 409 just fails again. The user has to
    // choose a different slot or provider.
    const error = new ApiRequestError(409, detail("SLOT_NO_LONGER_AVAILABLE"));
    expect(error.isTransportRetryable).toBe(false);
    expect(error.recovery).toBe("choose_again");
  });

  it("never retries validation or authorization failures", () => {
    expect(new ApiRequestError(422, detail("VALIDATION_ERROR")).isTransportRetryable).toBe(false);
    expect(new ApiRequestError(401, detail("SESSION_EXPIRED")).isTransportRetryable).toBe(false);
    expect(new ApiRequestError(403, detail("PERMISSION_DENIED")).isTransportRetryable).toBe(false);
  });
});

describe("ApiRequestError recovery mapping", () => {
  it("maps known domain codes to their recovery intent", () => {
    expect(new ApiRequestError(409, detail("CAPACITY_HOLD_EXPIRED")).recovery).toBe("choose_again");
    expect(new ApiRequestError(400, detail("PAYMENT_METHOD_REQUIRED")).recovery).toBe(
      "add_payment_method",
    );
    expect(new ApiRequestError(402, detail("PAYMENT_PENDING")).recovery).toBe("await_confirmation");
    expect(new ApiRequestError(401, detail("AUTHENTICATION_REQUIRED")).recovery).toBe(
      "reauthenticate",
    );
  });

  it("falls back to status-based recovery for an unknown code", () => {
    // A newly added backend code must degrade sensibly, not crash the screen.
    expect(new ApiRequestError(401, detail("SOME_FUTURE_CODE")).recovery).toBe("reauthenticate");
    expect(new ApiRequestError(409, detail("SOME_FUTURE_CODE")).recovery).toBe("choose_again");
    expect(new ApiRequestError(503, detail("SOME_FUTURE_CODE")).recovery).toBe("retry");
    expect(new ApiRequestError(418, detail("SOME_FUTURE_CODE")).recovery).toBe("contact_support");
  });
});

describe("ApiRequestError.fieldErrors", () => {
  it("normalises string and array field details", () => {
    const error = new ApiRequestError(
      422,
      detail("VALIDATION_ERROR", {
        details: { postal_code: "Not serviceable.", phone_number: ["Too short.", "Invalid."] },
      }),
    );
    expect(error.fieldErrors).toEqual({
      postal_code: ["Not serviceable."],
      phone_number: ["Too short.", "Invalid."],
    });
  });

  it("returns an empty map when details is not a field map", () => {
    expect(new ApiRequestError(422, detail("X", { details: null })).fieldErrors).toEqual({});
    expect(new ApiRequestError(422, detail("X", { details: "nope" })).fieldErrors).toEqual({});
    expect(new ApiRequestError(422, detail("X", { details: [1, 2] })).fieldErrors).toEqual({});
  });

  it("drops non-string entries inside an array rather than leaking them to the UI", () => {
    const error = new ApiRequestError(
      422,
      detail("X", { details: { field: ["ok", 42, null] } }),
    );
    expect(error.fieldErrors.field).toEqual(["ok"]);
  });
});

describe("transport errors", () => {
  it("treats a network failure as retryable", () => {
    const error = new ApiNetworkError("offline", new Error("fetch failed"));
    expect(error.isTransportRetryable).toBe(true);
    expect(error.recovery).toBe("retry");
    expect(error.requestId).toBeNull();
  });

  it("treats an unparseable 502 as retryable but a 400 as support-only", () => {
    expect(new ApiContractError(502, "<html>").isTransportRetryable).toBe(true);
    expect(new ApiContractError(400, "<html>").recovery).toBe("contact_support");
  });

  it("keeps a body preview for diagnosis without exposing it as a user message", () => {
    const error = new ApiContractError(502, "<html><body>Bad Gateway</body></html>");
    expect(error.bodyPreview).toContain("Bad Gateway");
    expect(error.message).not.toContain("<html>");
  });
});

describe("type guards", () => {
  it("recognises every error this package throws", () => {
    expect(isApiClientError(new ApiRequestError(500, detail("X")))).toBe(true);
    expect(isApiClientError(new ApiNetworkError("x", null))).toBe(true);
    expect(isApiClientError(new ApiContractError(502, ""))).toBe(true);
    expect(isApiClientError(new Error("plain"))).toBe(false);
  });

  it("reports an unrecognised error as not retryable", () => {
    // Unknown failure is not known to be safe, so it must not be auto-retried.
    expect(isTransportRetryable(new Error("plain"))).toBe(false);
    expect(isTransportRetryable(undefined)).toBe(false);
  });
});
