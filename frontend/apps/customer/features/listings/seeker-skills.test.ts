import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => ({}) }));

const { newSkillsFrom } = await import("./seeker-queries");

describe("skills a quick apply adds", () => {
  it("keeps only ticked skills the profile doesn't have, ignoring case and spaces", () => {
    expect(newSkillsFrom(["Tally", "GST"], ["tally", "Sales", " sales ", "Customer  handling"])).toEqual([
      "Sales",
      "Customer  handling",
    ]);
  });

  it("adds nothing when every ticked skill is already there", () => {
    expect(newSkillsFrom(["Sales"], ["SALES"])).toEqual([]);
  });
});
