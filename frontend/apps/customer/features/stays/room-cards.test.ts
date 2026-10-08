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
  it("makes one card per room type, cheapest first, three per property at most", () => {
    const cards = roomCardsFrom([
      property("p1", [unit("a", 900), unit("b", 300), unit("c", 500), unit("d", 700)]),
    ]);

    expect(cards.map((c) => c.unit.id)).toEqual(["b", "c", "d"]);
    expect(cards.map((c) => c.moreHere)).toEqual([0, 0, 1]);
  });

  it("makes one card per look of a room type, never by room number", () => {
    const look = (id: string, name: string, available: number, media = photo) => ({
      id,
      name,
      display_name: name ? `1 BHK · ${name}` : "1 BHK",
      display_order: id === "A" ? 0 : 1,
      media,
      available_count: available,
      room_count: 3,
    });
    const bhk = unit("bhk", 1_800_000, {
      name: "1 BHK",
      looks: [look("A", "", 2), look("B", "With balcony", 1)],
    });
    const cards = roomCardsFrom([property("p1", [bhk])]);

    expect(cards.map((c) => c.look.display_name)).toEqual(["1 BHK", "1 BHK · With balcony"]);
    expect(cards.map((c) => c.look.available_count)).toEqual([2, 1]);
    expect(cards.map((c) => c.otherLooks)).toEqual([1, 1]);
  });

  it("hides a look with no photo or no room free", () => {
    const look = (id: string, available: number, media = photo) => ({
      id,
      name: id === "A" ? "" : `Look ${id}`,
      display_name: id,
      display_order: 0,
      media,
      available_count: available,
      room_count: 1,
    });
    const bhk = unit("bhk", 100, { looks: [look("A", 1), look("B", 0), look("C", 2, [])] });
    const cards = roomCardsFrom([property("p1", [bhk])]);

    expect(cards.map((c) => c.look.id)).toEqual(["A"]);
    expect(cards[0]?.otherLooks).toBe(0);
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
