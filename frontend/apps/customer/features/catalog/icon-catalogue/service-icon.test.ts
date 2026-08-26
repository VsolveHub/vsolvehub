import { Shapes, Zap } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { iconForService } from "./service-icon";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the published vocabulary", () => {
  it("gives a trade its own mark rather than the generic one", () => {
    expect(iconForService("electrical")).toBe(Zap);
    expect(iconForService("plumbing")).not.toBe(Shapes);
    expect(iconForService("pet-grooming")).not.toBe(Shapes);
  });

  it("treats `service` as a real value, not a fallback", () => {
    // The backend reserves this key for a genuinely new service type, so it is
    // published deliberately and must not warn.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(iconForService("service")).toBe(Shapes);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("a server running ahead of this build", () => {
  it("degrades one unknown key to the generic mark instead of failing the grid", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // A catalogue is hundreds of tiles. One key this deploy has never heard of
    // must not take the whole grid down with it.
    expect(iconForService("drone-photography")).toBe(Shapes);
  });

  it("says so out loud, because a silent fallback survives to production", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    iconForService("quantum-plumbing");

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("quantum-plumbing");
  });

  it("reports each unknown key once, not once per tile", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // The same unmapped service rendered across a grid.
    iconForService("hydroponics");
    iconForService("hydroponics");
    iconForService("hydroponics");

    expect(warn).toHaveBeenCalledOnce();
  });
});
