import { describe, expect, it } from "vitest";

import { CursorContractError, cursorFromNextUrl } from "./cursor";

describe("cursorFromNextUrl", () => {
  it("returns undefined when next is null", () => {
    expect(cursorFromNextUrl(null)).toBeUndefined();
  });

  it("extracts the opaque cursor from an absolute next URL", () => {
    expect(
      cursorFromNextUrl("https://api.example.test/api/v1/booking-groups/?cursor=abc123&other=1"),
    ).toBe("abc123");
  });

  it("extracts the opaque cursor from a relative next URL", () => {
    expect(cursorFromNextUrl("/api/v1/partner/offers/?cursor=page-two")).toBe("page-two");
  });

  it("does not decode or reinterpret the cursor value", () => {
    const opaque = "cD0yMDI2LTA4LTAzKzA1JTNBMzA=";
    expect(cursorFromNextUrl(`https://api.example.test/list/?cursor=${opaque}`)).toBe(opaque);
  });

  it("rejects a next URL that cannot be parsed", () => {
    expect(() => cursorFromNextUrl("https://exa mple.test/broken")).toThrow(CursorContractError);
  });

  it("rejects a next URL that carries no cursor parameter", () => {
    expect(() => cursorFromNextUrl("https://api.example.test/api/v1/booking-groups/?page=2")).toThrow(
      CursorContractError,
    );
  });

  it("rejects a next URL whose cursor is blank", () => {
    expect(() => cursorFromNextUrl("https://api.example.test/list/?cursor=")).toThrow(
      CursorContractError,
    );
  });

  it("rejects a next URL whose cursor is whitespace only", () => {
    expect(() => cursorFromNextUrl("https://api.example.test/list/?cursor=%20%20")).toThrow(
      CursorContractError,
    );
  });
});
