import { describe, expect, it } from "vitest";

import type { StayPropertySummary, StayUnit } from "./model";
import { roomCardsFrom } from "./room-cards";

const photo = [{ id: "m1", url: "https://cdn.example.com/r.jpg", display_order: 0 }];

function unit(id: string, price: number, extra: Partial<StayUnit> = {}): StayUnit {
  return {
    id,
    name: `Room ${id}`,
    nightly_rate_paise: price,
    media: photo,
    attributes: {},
    ...extra,
  } as StayUnit;
}

function property(id: string, units: StayUnit[], extra: Partial<StayPropertySummary> = {}) {
  return { id, slug: id, title: id, units, structured_fields: {}, ...extra } as StayPropertySummary;
}

describe("roomCardsFrom", () => {
  it("makes one card per room type, cheapest first, two per property at most", () => {
    const cards = roomCardsFrom([property("p1", [unit("a", 900), unit("b", 300), unit("c", 500)])]);

    expect(cards.map((c) => c.unit.id)).toEqual(["b", "c"]);
    expect(cards.map((c) => c.moreHere)).toEqual([0, 1]);
  });

  it("leaves out room types without a photo", () => {
    const cards = roomCardsFrom([property("p1", [unit("a", 100, { media: [] }), unit("b", 200)])]);

    expect(cards.map((c) => c.unit.id)).toEqual(["b"]);
  });

  it("applies price and AC filters to the room itself", () => {
    const cards = roomCardsFrom(
      [property("p1", [unit("cheap", 100), unit("ac", 400, { attributes: { ac: "AC" } })])],
      { ac: true, maxPrice: 500 },
    );

    expect(cards.map((c) => c.unit.id)).toEqual(["ac"]);
  });

  it("sorts rooms across properties by price when asked", () => {
    const cards = roomCardsFrom(
      [property("p1", [unit("x", 700)]), property("p2", [unit("y", 200)])],
      { sort: "price_asc" },
    );

    expect(cards.map((c) => c.unit.id)).toEqual(["y", "x"]);
  });
});
