import { describe, expect, it } from "vitest";

import { isWorkspaceAdvancingForScreen } from "./requirement-flow";

describe("requirement flow saving state", () => {
  it("does not keep Where and when loading for the hidden service-selection create", () => {
    expect(
      isWorkspaceAdvancingForScreen({
        screen: "where_when",
        isCreatingRequirement: true,
        isSavingRequirement: false,
      }),
    ).toBe(false);
  });

  it("still shows loading while the current screen is being saved", () => {
    expect(
      isWorkspaceAdvancingForScreen({
        screen: "where_when",
        isCreatingRequirement: false,
        isSavingRequirement: true,
      }),
    ).toBe(true);
  });
});
