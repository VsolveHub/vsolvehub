// Ported from frontend/apps/partner/features/proposal/model/recent-presets.test.ts
// @vitest-environment jsdom
// The module under test is a localStorage convenience; every case exercises the
// store, and the node environment has no `window` for `afterEach` to clear.

import { byRecentFirst, rememberPreset } from "./recent-presets";

const KEY = "vsh-partner-recent-presets";

const PRESETS = [
  { code: "strip_out" },
  { code: "civil" },
  { code: "wiring" },
  { code: "plumbing" },
  { code: "plaster" },
] as const;

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("byRecentFirst", () => {
  it("leaves the declared order alone for a vendor who has never quoted", () => {
    expect(byRecentFirst(PRESETS)).toEqual(PRESETS);
  });

  it("floats a used preset to the top", () => {
    rememberPreset("plaster");
    expect(byRecentFirst(PRESETS).map((entry) => entry.code)).toEqual([
      "plaster",
      "strip_out",
      "civil",
      "wiring",
      "plumbing",
    ]);
  });

  it("orders several used presets most-recent first", () => {
    rememberPreset("civil");
    rememberPreset("plaster");
    rememberPreset("wiring");

    expect(byRecentFirst(PRESETS).map((entry) => entry.code)).toEqual([
      "wiring",
      "plaster",
      "civil",
      "strip_out",
      "plumbing",
    ]);
  });

  /*
    The property that makes the sheet predictable: presets the vendor has never
    used keep the order `estimate-presets` declares them in, which is the order
    the trade actually runs in (strip out, then walls, then wiring). Sorting
    them among themselves would trade one kind of hunting for another.
  */
  it("is stable among presets that have never been used", () => {
    rememberPreset("plumbing");
    expect(byRecentFirst(PRESETS).map((entry) => entry.code)).toEqual([
      "plumbing",
      "strip_out",
      "civil",
      "wiring",
      "plaster",
    ]);
  });

  it("ignores remembered codes that are not in the list it is given", () => {
    rememberPreset("a_code_from_another_trade");
    expect(byRecentFirst(PRESETS)).toEqual(PRESETS);
  });
});

describe("rememberPreset", () => {
  it("de-duplicates rather than growing on every use", () => {
    rememberPreset("wiring");
    rememberPreset("civil");
    rememberPreset("wiring");

    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "[]")).toEqual(["wiring", "civil"]);
  });

  it("caps the list at six", () => {
    for (const code of ["a", "b", "c", "d", "e", "f", "g", "h"]) rememberPreset(code);

    const stored: string[] = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    expect(stored).toHaveLength(6);
    expect(stored[0]).toBe("h");
    expect(stored).not.toContain("a");
  });
});

/*
  An estimate must never fail to open because a preference could not be read.
  localStorage throws in private modes and on quota, and the store is shared
  with anything else that can write to this origin.
*/
describe("a store that cannot be trusted", () => {
  it("treats unparseable JSON as no history", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(byRecentFirst(PRESETS)).toEqual(PRESETS);
  });

  it("treats a non-array payload as no history", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ wiring: 1 }));
    expect(byRecentFirst(PRESETS)).toEqual(PRESETS);
  });

  it("drops non-string entries rather than ranking on them", () => {
    window.localStorage.setItem(KEY, JSON.stringify([42, "plaster", null]));
    expect(byRecentFirst(PRESETS)[0]?.code).toBe("plaster");
  });

  it("survives a read that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => byRecentFirst(PRESETS)).not.toThrow();
    expect(byRecentFirst(PRESETS)).toEqual(PRESETS);
  });

  it("survives a write that throws, so a full quota cannot block an estimate", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => rememberPreset("wiring")).not.toThrow();
  });
});
