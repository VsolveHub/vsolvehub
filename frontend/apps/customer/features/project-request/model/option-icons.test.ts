import { describe, expect, it } from "vitest";
import { Droplets, Fan, Home, Paintbrush } from "lucide-react";

import { iconForOption } from "./option-icons";

/**
 * The keyword map's contract: recognise the common vocabulary, and answer
 * `null` — never a guess — for anything it does not.
 */
describe("iconForOption", () => {
  it("matches on the option's label", () => {
    expect(iconForOption({ value: "opt_1", label: "Ceiling fan repair" })).toBe(Fan);
    expect(iconForOption({ value: "opt_2", label: "Interior painting" })).toBe(Paintbrush);
  });

  it("matches on the option's code, with separators treated as spaces", () => {
    expect(iconForOption({ value: "tap-leak-fix", label: "Something bespoke" })).toBe(Droplets);
    expect(iconForOption({ value: "full_home_service", label: "Complete package" })).toBe(Home);
  });

  it("answers null for an option it does not recognise", () => {
    // A wrong pictogram misleads at a glance; the tile renders a monogram
    // instead. Null is the contract, not a failure.
    expect(iconForOption({ value: "zz_unmapped", label: "Quantum flux calibration" })).toBeNull();
  });

  it("prefers the narrow rule over the broad room rule", () => {
    // "kitchen deep clean" is a cleaning job that happens in a kitchen; the
    // cleaning rule sits above the room rules on purpose.
    expect(iconForOption({ value: "k1", label: "Kitchen deep clean" })).not.toBe(Home);
  });
});
