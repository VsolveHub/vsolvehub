import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => ({}) }));

const { SCOPES, rowsToShow } = await import("./switch-board");

describe("kill switch board", () => {
  it("never offers a switch the platform does not obey", () => {
    const offered = SCOPES.map((entry) => entry.value);
    expect(offered).not.toContain("PAYMENTS");
    expect(offered).not.toContain("DISPATCH");
    expect(offered).not.toContain("SERVICE");
    expect(offered[0]).toBe("SERVICE_AREA");
  });

  it("asks for an area only when pausing an area", () => {
    expect(SCOPES.filter((entry) => entry.takesArea).map((entry) => entry.value)).toEqual(["SERVICE_AREA"]);
  });

  it("drops released history of switches no longer offered, but never hides one that is on", () => {
    const rows = rowsToShow([
      { scope: "PAYMENTS", is_engaged: false },
      { scope: "DISPATCH", is_engaged: true },
      { scope: "SMS", is_engaged: false },
    ]);
    expect(rows.map((row) => row.scope)).toEqual(["DISPATCH", "SMS"]);
  });
});
