import { ApiRequestError } from "@vsolve/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { isProposalWindowClosed } from "../queries";
import { EstimateClosedDialog } from "./tap-estimate-composer";

describe("a stale estimate after the customer chose another vendor", () => {
  it("recognises the server refusal by its stable code", () => {
    const error = new ApiRequestError(409, {
      code: "m2_proposal_window_closed",
      message: "The customer continued elsewhere.",
      details: null,
      retryable: false,
      request_id: "request-1",
    });

    expect(isProposalWindowClosed(error)).toBe(true);
  });

  it("shows one clear outcome and a route back to work", () => {
    render(<EstimateClosedDialog />);

    expect(screen.getByRole("dialog", { name: "Estimate closed" })).toBeInTheDocument();
    expect(screen.getByText(/already continued with another professional/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to your work" })).toHaveAttribute(
      "href",
      "/work/all",
    );
  });
});
