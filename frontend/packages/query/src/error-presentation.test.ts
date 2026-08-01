import { ApiContractError, ApiNetworkError, ApiRequestError } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import { describeError, isFieldError } from "./error-presentation";

const detail = (code: string, message = "Readable message.", details: unknown = null) => ({
  code,
  message,
  details,
  retryable: false,
  request_id: "req_abc123",
});

describe("state-change inference", () => {
  it("reports no change when the server rejected the request", () => {
    // The server answered, so it applied its own rules and nothing was charged.
    const presentation = describeError(
      new ApiRequestError(422, detail("VALIDATION_ERROR")),
      "financial",
    );
    expect(presentation.stateChange).toBe("none");
    expect(presentation.message).toContain("You have not been charged.");
  });

  it("reports a changed state for a conflict", () => {
    // A 409 describes a world that already moved on: the slot went to someone
    // else. Claiming "nothing changed" would be wrong about the slot.
    const presentation = describeError(
      new ApiRequestError(409, detail("SLOT_NO_LONGER_AVAILABLE")),
      "financial",
    );
    expect(presentation.stateChange).toBe("changed");
  });

  it("reports UNKNOWN when a financial mutation fails in transit", () => {
    // This is the case that must never be guessed. The request may have reached
    // Django before the connection dropped, so the charge may exist.
    const presentation = describeError(new ApiNetworkError("offline", null), "financial");
    expect(presentation.stateChange).toBe("unknown");
    expect(presentation.message).not.toContain("not been charged");
    expect(presentation.message).toContain("do not pay again");
    expect(presentation.action?.intent).toBe("await_confirmation");
    expect(presentation.severity).toBe("warning");
  });

  it("reports no change when a non-financial mutation fails in transit", () => {
    const presentation = describeError(new ApiNetworkError("offline", null), "mutation");
    expect(presentation.stateChange).toBe("none");
    expect(presentation.message).toContain("Nothing was submitted.");
    expect(presentation.action?.intent).toBe("retry");
  });

  it("adds no money reassurance to a failed read", () => {
    const presentation = describeError(new ApiNetworkError("offline", null), "read");
    expect(presentation.message).not.toContain("charged");
    expect(presentation.stateChange).toBe("none");
  });

  it("treats an unparseable response on a financial call as ambiguous too", () => {
    // A proxy 502 on POST /payments is exactly as ambiguous as a dropped socket.
    const presentation = describeError(new ApiContractError(502, "<html>"), "financial");
    expect(presentation.stateChange).toBe("unknown");
  });
});

describe("recovery actions", () => {
  it("offers login for an expired session", () => {
    const presentation = describeError(new ApiRequestError(401, detail("SESSION_EXPIRED")));
    expect(presentation.action?.intent).toBe("reauthenticate");
    expect(presentation.action?.label).toBe("Log in again");
  });

  it("offers re-selection when capacity is gone", () => {
    const presentation = describeError(new ApiRequestError(409, detail("CAPACITY_HOLD_EXPIRED")));
    expect(presentation.action?.intent).toBe("choose_again");
    expect(presentation.title).toBe("That option is no longer available");
  });

  it("offers a payment method when one is required", () => {
    const presentation = describeError(
      new ApiRequestError(400, detail("PAYMENT_METHOD_REQUIRED")),
      "financial",
    );
    expect(presentation.action?.intent).toBe("add_payment_method");
  });

  it("always provides an action, so no error is a dead end", () => {
    const errors = [
      new ApiRequestError(500, detail("INTERNAL")),
      new ApiRequestError(403, detail("PERMISSION_DENIED")),
      new ApiNetworkError("offline", null),
      new ApiContractError(502, ""),
      new Error("render crash"),
    ];
    for (const error of errors) {
      expect(describeError(error, "mutation").action).not.toBeNull();
    }
  });
});

describe("message provenance", () => {
  it("prefers the server's customer-safe message", () => {
    const presentation = describeError(
      new ApiRequestError(409, detail("SLOT_NO_LONGER_AVAILABLE", "That 10:00 am slot was taken.")),
    );
    expect(presentation.message).toContain("That 10:00 am slot was taken.");
  });

  it("carries the backend reference so support can trace it", () => {
    const presentation = describeError(new ApiRequestError(500, detail("INTERNAL")));
    expect(presentation.reference).toBe("req_abc123");
  });

  it("exposes stable message keys for later localisation", () => {
    const presentation = describeError(new ApiRequestError(409, detail("QUOTE_EXPIRED")));
    expect(presentation.messageKey).toBe("error.code.QUOTE_EXPIRED.message");
    expect(presentation.action?.messageKey).toBe("error.action.retry");
  });

  it("does not blame the network for a rendering crash", () => {
    const presentation = describeError(new TypeError("cannot read property of undefined"));
    expect(presentation.message).toContain("could not be displayed");
    expect(presentation.message).not.toContain("connection");
  });
});

describe("isFieldError", () => {
  it("is true only for a validation error carrying field details", () => {
    const withFields = new ApiRequestError(
      422,
      detail("VALIDATION_ERROR", "Check fields.", { postal_code: "Required." }),
    );
    expect(isFieldError(withFields)).toBe(true);
  });

  it("is false for a validation error with no field details", () => {
    // Nothing to attach to an input, so it belongs in a banner instead.
    expect(isFieldError(new ApiRequestError(422, detail("VALIDATION_ERROR")))).toBe(false);
  });

  it("is false for non-validation errors", () => {
    expect(isFieldError(new ApiRequestError(409, detail("SLOT_NO_LONGER_AVAILABLE")))).toBe(false);
    expect(isFieldError(new ApiNetworkError("x", null))).toBe(false);
  });
});
