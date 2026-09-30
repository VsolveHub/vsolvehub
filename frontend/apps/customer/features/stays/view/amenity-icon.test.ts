import { Check, Wifi, Wind } from "lucide-react";
import { describe, expect, it } from "vitest";

import { amenityIcon } from "./amenity-icon";

describe("amenityIcon", () => {
  it("maps known amenity keys to their icon", () => {
    expect(amenityIcon("wifi")).toBe(Wifi);
    expect(amenityIcon("ac")).toBe(Wind);
  });

  it("falls back to a plain check for a key the app does not know yet", () => {
    expect(amenityIcon("rooftop_garden")).toBe(Check);
  });
});
