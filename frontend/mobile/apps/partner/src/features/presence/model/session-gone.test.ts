import { ApiRequestError } from "@vsolve/api-client";

import { sessionIsGone } from "./use-partner-receiving-offers";

function apiError(status: number): ApiRequestError {
  return Object.assign(Object.create(ApiRequestError.prototype) as ApiRequestError, { status });
}

describe("when the phone may forget its online session", () => {
  it("forgets it when the server says the session is over", () => {
    expect(sessionIsGone(apiError(409))).toBe(true);
    expect(sessionIsGone(apiError(403))).toBe(true);
  });

  it("keeps it through no signal or a server fault", () => {
    // Clearing it then showed a Partner as offline while dispatch still had them online.
    expect(sessionIsGone(new Error("Network request failed"))).toBe(false);
    expect(sessionIsGone(apiError(503))).toBe(false);
  });
});
