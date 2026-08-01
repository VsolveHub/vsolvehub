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
      new ApiRequestError(422, detail("validation_error")),
      "financial",
    );
    expect(presentation.stateChange).toBe("none");
    expect(presentation.message).toContain("You have not been charged.");
  });

  it("reports a changed state for a conflict", () => {
    // A 409 describes a world that already moved on: the slot went to someone
    // else. Claiming "nothing changed" would be wrong about the slot.
    const presentation = describeError(
      new ApiRequestError(409, detail("address_archived")),
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
    const presentation = describeError(new ApiRequestError(401, detail("session_expired")));
    expect(presentation.action?.intent).toBe("reauthenticate");
    expect(presentation.action?.label).toBe("Log in again");
  });

  it("offers re-selection when the chosen thing is gone", () => {
    const presentation = describeError(new ApiRequestError(409, detail("address_archived")));
    expect(presentation.action?.intent).toBe("choose_again");
    expect(presentation.title).toBe("That option is no longer available");
  });

  it("tells someone to wait rather than act while a command is still running", () => {
    // Django answers idempotency_in_progress when the identical command is still
    // being processed. Offering "Try again" there is how a duplicate lands.
    const presentation = describeError(
      new ApiRequestError(409, detail("idempotency_in_progress")),
      "financial",
    );
    expect(presentation.action?.intent).toBe("await_confirmation");
  });

  it("always provides an action, so no error is a dead end", () => {
    const errors = [
      new ApiRequestError(500, detail("internal_error")),
      new ApiRequestError(403, detail("permission_denied")),
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
      new ApiRequestError(409, detail("address_archived", "That address was archived.")),
    );
    expect(presentation.message).toContain("That address was archived.");
  });

  it("carries the backend reference so support can trace it", () => {
    const presentation = describeError(new ApiRequestError(500, detail("internal_error")));
    expect(presentation.reference).toBe("req_abc123");
  });

  it("exposes stable message keys for later localisation", () => {
    // The key is built from the backend's own code, so a Telugu or Hindi
    // catalogue is keyed on the contract rather than on English copy.
    const presentation = describeError(new ApiRequestError(400, detail("invalid_otp")));
    expect(presentation.messageKey).toBe("error.code.invalid_otp.message");
    expect(presentation.action?.messageKey).toBe("error.action.fixInput");
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
      detail("validation_error", "Check fields.", { postal_code: "Required." }),
    );
    expect(isFieldError(withFields)).toBe(true);
  });

  it("is false for a validation error with no field details", () => {
    // Nothing to attach to an input, so it belongs in a banner instead.
    expect(isFieldError(new ApiRequestError(422, detail("validation_error")))).toBe(false);
  });

  it("is false for non-validation errors", () => {
    expect(isFieldError(new ApiRequestError(409, detail("address_archived")))).toBe(false);
    expect(isFieldError(new ApiNetworkError("x", null))).toBe(false);
  });
});
