import { ApiContractError, ApiNetworkError, ApiRequestError } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import { isNoPayoutAccount } from "./queries";

/**
 * "No bank account yet" is the answer `GET /partner/payout-account/` gives with its own code
 * (contract 1.85.1). It decides between offering "Add bank account" and reporting a fault, so it
 * is matched by that code and nothing looser.
 */

function apiError(status: number, code: string): ApiRequestError {
  return new ApiRequestError(status, {
    code,
    message: "No payout account is registered.",
    details: null,
    retryable: false,
    request_id: "req-1",
  });
}

describe("isNoPayoutAccount", () => {
  it("recognises the no-account answer by its code", () => {
    expect(isNoPayoutAccount(apiError(404, "payout_account_not_found"))).toBe(true);
  });

  it("treats any other 404 as a real fault", () => {
    // A wrong route, or a resource that is gone: not a Partner who has yet to add an account.
    expect(isNoPayoutAccount(apiError(404, "not_found"))).toBe(false);
    expect(isNoPayoutAccount(new ApiContractError(404, "<html>Not Found</html>"))).toBe(false);
  });

  it("treats failures to reach the server as faults", () => {
    expect(isNoPayoutAccount(new ApiNetworkError("offline", new TypeError("fetch")))).toBe(false);
    expect(isNoPayoutAccount(new Error("boom"))).toBe(false);
  });
});
