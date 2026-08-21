import type { Schemas } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import { preferredAddressId } from "./queries";

function address(id: string, isDefault = false): Schemas["Address"] {
  return {
    id,
    label: id,
    line1: "1 Test Street",
    line2: "",
    locality: "Kondapur",
    city: "Hyderabad",
    state: "Telangana",
    postal_code: "500084",
    country_code: "IN",
    latitude: "17.450000",
    longitude: "78.380000",
    source: "MANUAL",
    is_default: isDefault,
    confirmed_at: "2026-08-20T10:00:00Z",
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
  };
}

describe("preferred booking address", () => {
  it("keeps a valid address the Customer explicitly selected", () => {
    expect(preferredAddressId([address("home", true), address("site")], "site")).toBe("site");
  });

  it("automatically selects the default address", () => {
    expect(preferredAddressId([address("site"), address("home", true)], null)).toBe("home");
  });

  it("repairs a stale selection with the current default", () => {
    expect(preferredAddressId([address("home", true)], "archived-address")).toBe("home");
  });

  it("falls back safely for an older address book with no default", () => {
    expect(preferredAddressId([address("first"), address("second")], null)).toBe("first");
  });
});
