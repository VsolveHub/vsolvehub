import { describe, expect, it } from "vitest";

import { profileInitials } from "./profile-mark";

const named = (displayName: string | null) => ({ displayName, fullName: null });

describe("profile initials", () => {
  it("skips punctuation, so a bracketed word doesn't become a bracket", () => {
    expect(profileInitials(named("Operations (dev)"))).toBe("OD");
  });

  it("takes the first two words", () => {
    expect(profileInitials(named("sriman rao kumar"))).toBe("SR");
  });

  it("falls back to no initials when the name has no letters or digits", () => {
    expect(profileInitials(named("( - )"))).toBeNull();
  });
});
