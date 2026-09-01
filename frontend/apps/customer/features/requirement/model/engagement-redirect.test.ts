import { describe, expect, it } from "vitest";

import { engagementDestination } from "./engagement-redirect";

describe("converted request navigation", () => {
  it("keeps an open request on its request page", () => {
    expect(engagementDestination(null)).toBeNull();
  });

  it("opens the project workspace once an engagement exists", () => {
    expect(engagementDestination("1c0c2fdd-c23b-4f26-8da2-d98d7530e469")).toBe(
      "/jobs/1c0c2fdd-c23b-4f26-8da2-d98d7530e469",
    );
  });
});
