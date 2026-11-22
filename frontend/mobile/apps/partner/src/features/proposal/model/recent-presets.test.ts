import { storageAdapter } from "@vsolve/mobile-core";
import { byRecentFirst, rememberPreset } from "./recent-presets";

const KEY = "vsh-partner-recent-presets";

const PRESETS = [
  { code: "strip_out" },
  { code: "civil" },
  { code: "wiring" },
  { code: "plumbing" },
  { code: "plaster" },
] as const;

describe("byRecentFirst and rememberPreset", () => {
  beforeEach(async () => {
    await storageAdapter.removeItem(KEY);
    jest.restoreAllMocks();
  });

  it("leaves the declared order alone for a vendor who has never quoted", async () => {
    expect(await byRecentFirst(PRESETS)).toEqual(PRESETS);
  });

  it("floats a used preset to the top", async () => {
    await rememberPreset("plaster");
    const result = await byRecentFirst(PRESETS);
    expect(result.map((entry) => entry.code)).toEqual([
      "plaster",
      "strip_out",
      "civil",
      "wiring",
      "plumbing",
    ]);
  });

  it("orders several used presets most-recent first", async () => {
    await rememberPreset("civil");
    await rememberPreset("plaster");
    await rememberPreset("wiring");

    const result = await byRecentFirst(PRESETS);
    expect(result.map((entry) => entry.code)).toEqual([
      "wiring",
      "plaster",
      "civil",
      "strip_out",
      "plumbing",
    ]);
  });

  it("is stable among presets that have never been used", async () => {
    await rememberPreset("plumbing");
    const result = await byRecentFirst(PRESETS);
    expect(result.map((entry) => entry.code)).toEqual([
      "plumbing",
      "strip_out",
      "civil",
      "wiring",
      "plaster",
    ]);
  });

  it("ignores remembered codes that are not in the list it is given", async () => {
    await rememberPreset("a_code_from_another_trade");
    expect(await byRecentFirst(PRESETS)).toEqual(PRESETS);
  });

  it("de-duplicates rather than growing on every use", async () => {
    await rememberPreset("wiring");
    await rememberPreset("civil");
    await rememberPreset("wiring");

    const raw = await storageAdapter.getItem(KEY);
    expect(JSON.parse(raw ?? "[]")).toEqual(["wiring", "civil"]);
  });

  it("caps the list at six", async () => {
    for (const code of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      await rememberPreset(code);
    }

    const raw = await storageAdapter.getItem(KEY);
    const stored: string[] = JSON.parse(raw ?? "[]");
    expect(stored).toHaveLength(6);
    expect(stored[0]).toBe("h");
    expect(stored).not.toContain("a");
  });

  it("treats unparseable JSON as no history", async () => {
    await storageAdapter.setItem(KEY, "{not json");
    expect(await byRecentFirst(PRESETS)).toEqual(PRESETS);
  });

  it("treats a non-array payload as no history", async () => {
    await storageAdapter.setItem(KEY, JSON.stringify({ wiring: 1 }));
    expect(await byRecentFirst(PRESETS)).toEqual(PRESETS);
  });

  it("drops non-string entries rather than ranking on them", async () => {
    await storageAdapter.setItem(KEY, JSON.stringify([42, "plaster", null]));
    const result = await byRecentFirst(PRESETS);
    expect(result[0]?.code).toBe("plaster");
  });

  it("survives a read that throws", async () => {
    jest.spyOn(storageAdapter, "getItem").mockRejectedValueOnce(new Error("SecurityError"));
    expect(await byRecentFirst(PRESETS)).toEqual(PRESETS);
  });

  it("survives a write that throws", async () => {
    jest.spyOn(storageAdapter, "setItem").mockRejectedValueOnce(new Error("QuotaExceededError"));
    await expect(rememberPreset("wiring")).resolves.not.toThrow();
  });
});
