import { describe, expect, it } from "vitest";

import { shouldRenderQueryDevtools } from "./devtools";

describe("shouldRenderQueryDevtools", () => {
  it("allows an app to suppress the floating launcher during development", () => {
    expect(shouldRenderQueryDevtools("development", false)).toBe(false);
  });

  it("never includes the launcher in a production build", () => {
    expect(shouldRenderQueryDevtools("production", true)).toBe(false);
  });
});
